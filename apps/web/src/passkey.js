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

/**
 * An in-app browser — the web view inside WhatsApp, Instagram, Gmail and the
 * rest. It reports no platform authenticator whatever the phone can do, so a
 * guest sent the link in a chat looks like a guest on a passkey-less device.
 * The way out is Safari, not Settings, and the two need different sentences.
 *
 * iOS web views run Safari's engine without Safari's UA token, which is what
 * the second test reads.
 */
export function inAppBrowser() {
  const ua = navigator.userAgent
  if (/FBAN|FBAV|Instagram|LinkedInApp|Line\/|MicroMessenger|Snapchat|Twitter/i.test(ua)) return true
  return /iPhone|iPad/.test(ua) && /AppleWebKit/.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua)
}

export function unsupportedReason() {
  if (typeof window === 'undefined') return 'No browser environment.'
  if (!window.isSecureContext) return 'Passkeys need https:// or localhost.'
  if (!window.PublicKeyCredential) return 'This browser has no passkey support.'
  if (inAppBrowser()) {
    return 'Open this page in Safari — an in-app browser can’t create a passkey.'
  }
  // The probe also answers false with no passcode, with iCloud Passwords off
  // and in a Private tab, and those are the ones a guest can actually fix.
  return 'No built-in unlock available. Check Face ID and iCloud Passwords are on, and that this isn’t a Private tab.'
}

/** True when the guest dismissed the OS sheet rather than something breaking. */
/**
 * Whether the ceremony ended without a credential for a reason the guest can
 * retry.
 *
 * WebAuthn deliberately collapses several failures into `NotAllowedError` so a
 * site cannot probe the authenticator: a dismissed sheet, a timeout, an RP ID
 * that is not a suffix of the page's origin, and a blocked permissions policy
 * are indistinguishable here. Calling all of them "dismissed" blames the guest
 * for what may be our misconfiguration, so the wording stays neutral and the
 * name is logged for whoever is looking at a console.
 */
export const isCancellation = (err) => {
  const cancelled = err?.name === 'NotAllowedError' || err?.name === 'AbortError'
  if (cancelled) {
    console.warn('[passkey] no credential:', err.name, err.message, '| origin', location.origin)
  }
  return cancelled
}

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
