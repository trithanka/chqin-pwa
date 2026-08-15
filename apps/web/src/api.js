/**
 * The API client.
 *
 * No cookies here: a guest is identified by the session the QR resolved to,
 * carried explicitly in each request body. Nothing about a guest is remembered
 * between scans except the credential-ID hint on the device.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

async function request(path, body) {
  let response
  try {
    response = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new ApiError('offline', 'No connection. Check the network and try again.', 0)
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new ApiError(data.error ?? 'error', data.message ?? 'Something went wrong.', response.status)
  }
  return data
}

export const api = {
  resolveSession: (token) => request('/sessions/resolve', { token }),
  attachBooking: (sessionId, lookup) => request('/sessions/booking', { sessionId, lookup }),
  detect: (sessionId, knownCredentialIds) => request('/detect', { sessionId, knownCredentialIds }),
  verifyIdentity: (sessionId) => request('/identity/verifications', { sessionId }),
  registrationOptions: (sessionId, verificationId) =>
    request('/webauthn/registration/options', { sessionId, verificationId }),
  registrationVerify: (payload) => request('/webauthn/registration/verify', payload),
  authenticationOptions: (sessionId) => request('/webauthn/authentication/options', { sessionId }),
  authenticationVerify: (payload) => request('/webauthn/authentication/verify', payload),
  checkin: (sessionId, idempotencyKey) => request('/checkin', { sessionId, idempotencyKey }),
}

export const apiConfigured = Boolean(import.meta.env.VITE_API_URL)
