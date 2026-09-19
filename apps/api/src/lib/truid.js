import { randomBytes } from 'node:crypto'
import { config, simulateAadhaar } from '../config.js'
import { ApiError } from './errors.js'

/**
 * TrueID (truid.one) — the KUA we go through for Aadhaar OKYC.
 *
 * Replaces Sandbox (sandbox.co.in). Five things worth knowing before touching
 * this file, three of which are not in TrueID's published documentation:
 *
 * 1. Auth is HTTP Basic — base64(key id : key secret). No token exchange, so
 *    there is nothing to cache or refresh, which is why this file is shorter
 *    than the one it replaced.
 * 2. `X-Request-Id` (exactly 32 alphanumeric characters) and `X-Timestamp`
 *    (unix seconds) are required on every call. Neither appears in their
 *    OpenAPI spec; omitting either is a 400 that reads like a malformed body.
 * 3. The environment is chosen by the key, not the host: a TEST_ key and a
 *    live key hit the same URL. There is no separate staging hostname.
 * 4. Callers are IP-whitelisted per environment, and the allow list is keyed
 *    on the address the request actually arrives from. Render's outbound
 *    traffic leaves from a CIDR range shared across the region, so production
 *    points TRUID_BASE_URL at our own proxy, which has one fixed address they
 *    can whitelist. Locally, note that a host with both IPv4 and IPv6 uses
 *    IPv6 by default and is refused while its whitelisted IPv4 sits unused —
 *    run with `node --dns-result-order=ipv4first`.
 * 5. **A failed verification is an HTTP 200 with `"status": true`.** The only
 *    thing separating a pass from a refusal is `data.verified`. Reading the
 *    HTTP code, or the top-level `status` field, passes every guest. This is
 *    the enrolment gate, so that is the one mistake this file exists to avoid.
 */

/**
 * Upstream is UIDAI, and a stalled OKYC call is worse than a refused one: a
 * guest stands in a lobby watching a spinner for as long as the socket stays
 * open. Twelve seconds leaves room for a slow-but-working call.
 */
const CALL_TIMEOUT_MS = 12_000

/** Written to the row and read back by the verify step; see identity.js. */
export const PROVIDER = 'truid'

/** True when credentials are configured; the caller decides what absence means. */
export const truidConfigured = () => Boolean(config.TRUID_KEY_ID && config.TRUID_KEY_SECRET)

/**
 * Whether a real UIDAI call should be made at all.
 *
 * Two ways to end up simulating: no credentials, or the SIMULATE_AADHAAR
 * switch in src/devFlags.js with credentials present — for working offline, or
 * against a provider that is down, without editing them out. Every caller asks
 * this rather than `truidConfigured()`, so the request and the verification can
 * never disagree about which world they are in.
 */
export const liveAadhaar = () => truidConfigured() && !simulateAadhaar()

const authHeader = () =>
  'Basic ' +
  Buffer.from(`${config.TRUID_KEY_ID}:${config.TRUID_KEY_SECRET}`).toString('base64')

/**
 * Exactly 32 alphanumeric characters — TrueID rejects anything else, including
 * 31. Hex rather than base64url: 16 bytes is always 32 hex characters, where
 * base64url yields a variable count once its `-` and `_` are stripped out.
 */
const requestId = () => randomBytes(16).toString('hex')

async function call(path, body) {
  // Nothing reaches TrueID while simulating. Every caller already checks
  // liveAadhaar(); this is the backstop for the one that forgets, so a
  // developer with the switch on can never be billed a real transaction.
  if (simulateAadhaar()) {
    throw new Error(`truid: refusing ${path} — SIMULATE_AADHAAR is on`)
  }

  const id = requestId()

  const res = await fetch(`${config.TRUID_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'X-Request-Id': id,
      'X-Timestamp': String(Math.floor(Date.now() / 1000)),
      // Only set when TRUID_BASE_URL points at our own egress proxy, which
      // refuses anything without it. TrueID itself ignores the header.
      ...(config.TRUID_PROXY_KEY ? { 'X-Proxy-Key': config.TRUID_PROXY_KEY } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch((err) => {
    // A timeout here says nothing about whether UIDAI sent the code, so it is
    // reported as unavailable rather than as a refusal: "try again" is safe
    // advice, "that number was refused" would not be true.
    console.error('truid: okyc call unreachable', path, err.name, id)
    throw new ApiError(
      'provider_unavailable',
      'Aadhaar verification is unavailable right now. Please ask the desk.',
      502,
    )
  })

  const payload = await res.json().catch(() => null)
  // The request id is what TrueID support asks for first, and it is the only
  // way to ask about a call that left no row behind.
  return { ok: res.ok, status: res.status, payload, data: payload?.data ?? null, requestId: id }
}

/**
 * Step one: UIDAI sends a code to the mobile registered against the number.
 *
 * Returns TrueID's `session_id`, which the verify step sends back. It is stored
 * in `provider_ref` and never leaves the server.
 */
export async function generateOkycOtp(aadhaarNumber) {
  const { ok, status, payload, data, requestId: rid } = await call(
    '/services/okyc/generate-otp',
    { aadhaar_number: aadhaarNumber },
  )

  if (!ok) {
    throw providerError(status, payload, rid, 'That number was refused by UIDAI. Check it and try again.')
  }

  // A refused number comes back 200 with `sent: false` and a reason, so a 200
  // without a session is a rejection the guest can act on — not the provider
  // trouble that providerError() would otherwise report it as.
  if (data?.sent !== true || !data?.session_id) {
    console.error('truid: otp not sent', data?.failure_code, data?.failure_reason, rid)
    throw new ApiError(
      'provider_rejected',
      data?.failure_reason || 'That number was refused by UIDAI. Check it and try again.',
      400,
    )
  }

  return { referenceId: String(data.session_id), message: data.failure_reason ?? null }
}

/**
 * Step two: the code goes back, the holder's demographics come out.
 *
 * Returned in the shape `identity.js` already reads — `name`, `date_of_birth`,
 * `gender` — rather than TrueID's own field names, so the mapping lives here
 * with the provider rather than leaking into the service.
 */
export async function verifyOkycOtp(sessionId, otp) {
  const { ok, status, payload, data, requestId: rid } = await call(
    '/services/okyc/get-result',
    { session_id: String(sessionId), otp },
  )

  if (!ok || !data) {
    throw providerError(status, payload, rid, 'That code was not accepted. Request a new one.')
  }

  /**
   * Only `verified === true` is a pass.
   *
   * A wrong or expired code comes back as HTTP 200 with `"status": true` and
   * the reason in `failure_code` — success and failure are otherwise identical
   * at every level a caller normally checks. Reading this the other way round
   * ("reject when a failure code is present") would let a response with neither
   * field through as a pass with an empty name, which is the one failure mode
   * that must not exist here: it is the enrolment gate.
   */
  if (data.verified !== true) {
    console.error('truid: okyc verify not verified', data.failure_code ?? '(no code)', rid)
    throw new ApiError(
      'otp_rejected',
      data.failure_reason || 'That code was not accepted.',
      400,
    )
  }

  return {
    name: data.name,
    // TrueID returns DD-MM-YYYY; isoDate() in identity.js already reads that.
    date_of_birth: data.dob,
    gender: data.gender,
    // UIDAI's address is a bag of optional parts, and which ones are present
    // differs between records — passed through whole rather than flattened,
    // because a register wants them in separate fields.
    address: data.address ?? null,
    care_of: data.care_of ?? null,
  }
}

/**
 * Provider failures, translated.
 *
 * Only 400 and 422 are about what the guest typed, so only those messages are
 * shown. Everything else is our problem wearing a provider's words — 401 is a
 * bad key, 403 is an unwhitelisted IP or an empty wallet, 5xx is UIDAI being
 * down — and none of that is a guest's to read or act on.
 */
function providerError(status, payload, rid, fallback) {
  const message = payload?.message ?? payload?.data?.failure_reason
  console.error('truid: okyc call failed', status, message ?? payload, rid)

  if (status === 400 || status === 422) {
    return new ApiError('provider_rejected', message || fallback, 400)
  }
  return new ApiError(
    'provider_unavailable',
    'Aadhaar verification is unavailable right now. Please ask the desk.',
    502,
  )
}
