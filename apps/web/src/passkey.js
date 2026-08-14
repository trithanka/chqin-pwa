/**
 * WebAuthn ceremonies, driven by the server.
 *
 * The options come from the API and the assertion goes back to it — this file
 * no longer verifies anything. It used to check its own signature, which
 * proved the architecture and secured nothing: the page checking the proof was
 * the same page that produced it.
 *
 * What's left is the part that genuinely belongs in the browser: converting
 * between the API's base64url and the ArrayBuffers WebAuthn wants, and asking
 * the platform whether it can do this at all.
 */

const toBuffer = (value) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const toBase64url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/* ------------------------------------------------------------------ */
/* Capability                                                          */
/* ------------------------------------------------------------------ */

/** 'webauthn' when a platform authenticator can run the ceremony, else 'simulated'. */
export async function passkeyMode() {
  if (typeof window === 'undefined') return 'simulated'
  if (!window.isSecureContext || !window.PublicKeyCredential) return 'simulated'
  try {
    return (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
      ? 'webauthn'
      : 'simulated'
  } catch {
    return 'simulated'
  }
}

export function unsupportedReason() {
  if (typeof window === 'undefined') return 'No browser environment.'
  if (!window.isSecureContext) return 'Passkeys need https:// or localhost.'
  if (!window.PublicKeyCredential) return 'This browser has no passkey support.'
  return 'This device has no built-in unlock (Face ID, Touch ID or fingerprint).'
}

/** True when the guest dismissed the OS sheet rather than something breaking. */
export const isCancellation = (err) =>
  err?.name === 'NotAllowedError' || err?.name === 'AbortError'

/* ------------------------------------------------------------------ */
/* Ceremonies                                                          */
/* ------------------------------------------------------------------ */

/** Create a passkey from the server's options, and shape the reply for it. */
export async function runRegistration(options) {
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: toBuffer(options.challenge),
      user: { ...options.user, id: toBuffer(options.user.id) },
      excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({
        ...c,
        id: toBuffer(c.id),
      })),
    },
  })

  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64url(credential.response.clientDataJSON),
      attestationObject: toBase64url(credential.response.attestationObject),
      transports: credential.response.getTransports?.() ?? [],
    },
  }
}

/** Assert an existing passkey. `allowCredentials` is empty — discoverable. */
export async function runAuthentication(options) {
  const assertion = await navigator.credentials.get({
    publicKey: {
      ...options,
      challenge: toBuffer(options.challenge),
      allowCredentials: (options.allowCredentials ?? []).map((c) => ({
        ...c,
        id: toBuffer(c.id),
      })),
    },
  })

  return {
    id: assertion.id,
    rawId: toBase64url(assertion.rawId),
    type: assertion.type,
    clientExtensionResults: assertion.getClientExtensionResults(),
    response: {
      clientDataJSON: toBase64url(assertion.response.clientDataJSON),
      authenticatorData: toBase64url(assertion.response.authenticatorData),
      signature: toBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? toBase64url(assertion.response.userHandle)
        : null,
    },
  }
}

/** A device label the guest would recognise in a list of their passkeys. */
export function deviceLabel() {
  const ua = navigator.userAgent
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android phone'
  if (/Macintosh/.test(ua)) return 'Mac'
  if (/Windows/.test(ua)) return 'Windows PC'
  return 'This device'
}
