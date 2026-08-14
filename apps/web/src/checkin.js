import { api } from './api'
import { knownCredentialIds, rememberCredential } from './device'
import { deviceLabel, runAuthentication, runRegistration } from './passkey'

/**
 * The check-in conversation with the server, in one place.
 *
 * Screens call these and render what comes back; none of them know a URL. The
 * order is the product: resolve the QR, let the server pick the journey, prove
 * who you are, then check in.
 */

/** A scanned token becomes a session, and the session picks the journey. */
export async function start(token) {
  const session = await api.resolveSession(token)
  const detection = await api.detect(session.sessionId, knownCredentialIds())

  return {
    sessionId: session.sessionId,
    venue: session.venue,
    booking: session.booking,
    journey: detection.journey,
    greetingName: detection.greetingName,
    // One key per session: a retry after a dropped response returns the
    // original check-in instead of making a second one.
    idempotencyKey: crypto.randomUUID(),
  }
}

/** The one-time identity check. Its id is what permits enrolment. */
export const verifyIdentity = (sessionId) => api.verifyIdentity(sessionId)

/**
 * Enrol this device. The credential ID is remembered locally afterwards —
 * that's the hint `/detect` reads on the next scan.
 */
export async function enrolDevice(sessionId, verificationId) {
  const { challengeId, options } = await api.registrationOptions(sessionId, verificationId)
  const credential = await runRegistration(options)

  const result = await api.registrationVerify({
    sessionId,
    challengeId,
    credential,
    deviceLabel: deviceLabel(),
  })

  rememberCredential(result.credentialId)
  return result
}

/** Prove an enrolled passkey. The server checks the signature; we don't. */
export async function authenticate(sessionId) {
  const { challengeId, options } = await api.authenticationOptions(sessionId)
  const credential = await runAuthentication(options)
  return api.authenticationVerify({ sessionId, challengeId, credential })
}

export const completeCheckin = (sessionId, idempotencyKey) =>
  api.checkin(sessionId, idempotencyKey)

/**
 * A QR scanned by the phone's own camera app opens a link rather than landing
 * in ours, so the token usually arrives in the path: /c/<token>. Reading it
 * here means both routes — in-app scan and camera deep link — start the same
 * conversation.
 */
export function tokenFromLocation() {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/^\/c\/([A-Za-z0-9_-]{16,128})$/)
  return match ? match[1] : null
}

/** Drop the token from the URL once used, so a refresh can't replay it. */
export function clearTokenFromLocation() {
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/c/')) {
    window.history.replaceState({}, '', '/')
  }
}
