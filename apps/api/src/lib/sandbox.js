import { config } from '../config.js'
import { ApiError } from './errors.js'

/**
 * Sandbox (sandbox.co.in) — the KUA we go through for Aadhaar OKYC.
 *
 * Two things worth knowing before touching this file:
 *
 * 1. The access token is *not* a bearer token. It goes in the Authorization
 *    header bare, without the "Bearer " prefix. Adding the prefix returns 401
 *    with a message that sounds like a bad key.
 * 2. Tokens last 24 hours. One is fetched on first use and kept in memory —
 *    a token request costs nothing, but doing it per verification doubles the
 *    latency a guest waits in a lobby. A restart simply fetches a new one.
 */

/** Refreshed an hour early so a long-running request can't cross the expiry. */
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000

/**
 * Upstream is UIDAI, and when its OKYC source is unavailable Sandbox takes
 * around five seconds to say so. Twelve leaves room for a slow-but-working call
 * while making sure a stalled one becomes "ask the desk" rather than a guest
 * watching a spinner in a lobby for as long as the socket stays open.
 */
const CALL_TIMEOUT_MS = 12_000

let cached = null // { token, expiresAt }

/** True when credentials are configured; the caller decides what absence means. */
export const sandboxConfigured = () =>
  Boolean(config.SANDBOX_API_KEY && config.SANDBOX_API_SECRET)

async function accessToken() {
  if (cached && cached.expiresAt > Date.now()) return cached.token

  const res = await fetch(`${config.SANDBOX_BASE_URL}/authenticate`, {
    method: 'POST',
    headers: {
      'x-api-key': config.SANDBOX_API_KEY,
      'x-api-secret': config.SANDBOX_API_SECRET,
      'x-api-version': '1.0',
    },
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch((err) => {
    console.error('sandbox: authenticate unreachable', err.name)
    throw new ApiError('provider_unavailable', "We couldn't reach the verification service.", 502)
  })

  const payload = await res.json().catch(() => null)
  // The token appears at the top level and under `data`; either is fine.
  const token = payload?.data?.access_token ?? payload?.access_token

  if (!res.ok || !token) {
    console.error('sandbox: authenticate failed', res.status, payload?.message ?? payload)
    throw new ApiError('provider_unavailable', "We couldn't reach the verification service.", 502)
  }

  cached = { token, expiresAt: Date.now() + TOKEN_TTL_MS }
  return token
}

/**
 * A KYC call, with one retry after a fresh token.
 *
 * The token can be revoked or invalidated before its 24 hours are up, and the
 * only signal is a 401 on the call itself — so a single 401 re-authenticates
 * and tries again rather than surfacing as a failed check in a lobby.
 */
async function call(path, body, { retryOnAuth = true } = {}) {
  const token = await accessToken()

  const res = await fetch(`${config.SANDBOX_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: token, // no "Bearer " — see the note above
      'x-api-key': config.SANDBOX_API_KEY,
      'x-api-version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch((err) => {
    // A timeout here says nothing about whether UIDAI sent the code, so it is
    // reported as unavailable rather than as a refusal: "try again" is safe
    // advice, "that number was refused" would not be true.
    console.error('sandbox: okyc call unreachable', path, err.name)
    throw new ApiError(
      'provider_unavailable',
      'Aadhaar verification is unavailable right now. Please ask the desk.',
      502,
    )
  })

  const payload = await res.json().catch(() => null)

  if (res.status === 401 && retryOnAuth) {
    cached = null
    return call(path, body, { retryOnAuth: false })
  }

  return { ok: res.ok, status: res.status, payload, data: payload?.data ?? null }
}

/**
 * Step one: UIDAI sends a code to the mobile registered against the number.
 *
 * `consent` is a required field on this call, not the next one — the guest has
 * to have agreed before the number reaches UIDAI, which is why the consent line
 * sits on the screen where the number is typed.
 */
export async function generateOkycOtp(aadhaarNumber, { reason = config.SANDBOX_KYC_REASON } = {}) {
  const { ok, status, payload, data } = await call('/kyc/aadhaar/okyc/otp', {
    '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.otp.request',
    aadhaar_number: aadhaarNumber,
    consent: 'y',
    reason,
  })

  const referenceId = data?.reference_id

  // A refused number is an HTTP 200 carrying "Invalid Aadhaar Card" and no
  // reference, so a 200 without one is a rejection the guest can act on — not
  // the provider trouble that providerError() would otherwise report it as.
  if (ok && !referenceId) {
    const message = data?.message ?? payload?.message
    console.error('sandbox: okyc otp 200 without reference', message, payload?.transaction_id ?? '')
    throw new ApiError(
      'provider_rejected',
      message || 'That number was refused by UIDAI. Check it and try again.',
      400,
    )
  }

  if (!ok) {
    throw providerError(status, payload, 'That number was refused by UIDAI. Check it and try again.')
  }

  // reference_id comes back as a number; provider_ref is text.
  return { referenceId: String(referenceId), message: data.message ?? null }
}

/** Step two: the code goes back, the holder's demographics come out. */
export async function verifyOkycOtp(referenceId, otp) {
  const { ok, status, payload, data } = await call('/kyc/aadhaar/okyc/otp/verify', {
    '@entity': 'in.co.sandbox.kyc.aadhaar.okyc.request',
    // A string here, deliberately. Generate *returns* reference_id as an integer
    // and verify *accepts* it as a string — sending the number back the way it
    // arrived is rejected with "Invalid request body".
    reference_id: String(referenceId),
    otp,
  })

  if (!ok || !data) {
    throw providerError(status, payload, 'That code was not accepted. Request a new one.')
  }

  // UIDAI is still working on it; the code isn't wrong, it just isn't answered.
  if (/under process/i.test(data.message ?? '')) {
    throw new ApiError('otp_processing', 'Still checking — try again in half a minute.', 409)
  }

  /**
   * Only "VALID" is a pass.
   *
   * A wrong or expired code comes back as HTTP 200 with the reason in `message`
   * ("Invalid OTP", "OTP Expired"), so anything that isn't an explicit VALID has
   * to be treated as a rejection — including a missing status. Reading this the
   * other way round ("reject when status says something bad") would let a
   * response with no status through as a pass with an empty name, which is the
   * one failure mode that must not exist here: it is the enrolment gate.
   */
  if (String(data.status ?? '').toUpperCase() !== 'VALID') {
    console.error('sandbox: okyc verify not valid', data.status ?? '(no status)', payload?.transaction_id ?? '')
    throw new ApiError('otp_rejected', data.message || 'That code was not accepted.', 400)
  }

  return data
}

/**
 * Provider failures, translated.
 *
 * Only 400 and 422 are about what the guest typed, so only those messages are
 * shown. Everything else is our problem wearing a provider's words — 401 is a
 * bad key, 403 is an exhausted wallet or quota, 503 is UIDAI being down — and
 * none of that is a guest's to read or act on. The raw payload and transaction
 * id go to the log, which is what support asks for.
 */
function providerError(status, payload, fallback) {
  const message = payload?.message ?? payload?.data?.message
  // The transaction id is what Sandbox support asks for first, and it's the only
  // way to ask them about a call that left no row behind.
  console.error(
    'sandbox: okyc call failed',
    status,
    message ?? payload,
    payload?.transaction_id ?? '',
  )

  if (status === 400 || status === 422) {
    return new ApiError('provider_rejected', message || fallback, 400)
  }
  return new ApiError(
    'provider_unavailable',
    'Aadhaar verification is unavailable right now. Please ask the desk.',
    502,
  )
}
