/**
 * Real WebAuthn ceremonies, with the prototype's simulation as fallback.
 *
 * What's real: credential creation and assertion on the platform
 * authenticator (Face ID / Touch ID / Windows Hello), and ES256/RS256
 * signature verification over `authenticatorData || SHA-256(clientDataJSON)`
 * via WebCrypto.
 *
 * What isn't: the verifier. With no backend, the page checks its own
 * challenge, which is not a security boundary — a real deployment verifies
 * server-side. The crypto is genuine; the trust model is a demo.
 *
 * Falls back to `simulated` where WebAuthn can't run at all: an insecure
 * context (the http:// LAN URL) or a device with no platform authenticator.
 */

/* ------------------------------------------------------------------ */
/* base64url                                                           */
/* ------------------------------------------------------------------ */

const toB64u = (buf) => {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64u = (str) => {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

const randomChallenge = () => crypto.getRandomValues(new Uint8Array(32))

/* ------------------------------------------------------------------ */
/* Capability                                                          */
/* ------------------------------------------------------------------ */

/** 'webauthn' when a platform authenticator can run the ceremony, else 'simulated'. */
export async function passkeyMode() {
  if (typeof window === 'undefined') return 'simulated'
  if (!window.isSecureContext || !window.PublicKeyCredential) return 'simulated'
  try {
    const available =
      await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    return available ? 'webauthn' : 'simulated'
  } catch {
    return 'simulated'
  }
}

/** Why the simulation is in play, for the screens to show. */
export function unsupportedReason() {
  if (typeof window === 'undefined') return 'No browser environment.'
  if (!window.isSecureContext) return 'Passkeys need https:// or localhost.'
  if (!window.PublicKeyCredential) return 'This browser has no passkey support.'
  return 'This device has no built-in unlock (Face ID, Touch ID or fingerprint).'
}

const rp = () => ({ id: window.location.hostname, name: 'ChqIn' })

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create a device-bound, discoverable passkey. Discoverable (`residentKey:
 * 'required'`) is what lets a returning guest authenticate with no username —
 * the whole point of the flow.
 */
export async function createPasskey({ identityId, guestName }) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomChallenge(),
      rp: rp(),
      user: {
        id: new TextEncoder().encode(identityId),
        name: guestName,
        displayName: guestName,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'required',
        userVerification: 'required',
      },
      attestation: 'none',
      timeout: 60000,
    },
  })

  if (!credential) throw new Error('No credential returned')

  // getPublicKey() is the easy path to an SPKI key; without it we keep the
  // credential but can't verify signatures locally.
  const spki = credential.response.getPublicKey?.()
  return {
    credentialId: credential.id,
    publicKey: spki ? toB64u(spki) : null,
    alg: credential.response.getPublicKeyAlgorithm?.() ?? -7,
    real: true,
  }
}

/* ------------------------------------------------------------------ */
/* Authentication                                                      */
/* ------------------------------------------------------------------ */

/**
 * Ask the platform authenticator for an assertion. `allowCredentials: []`
 * means "any discoverable credential for this site" — no username, no hint
 * about which guest is standing there.
 */
export async function assertPasskey() {
  const challenge = randomChallenge()
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: rp().id,
      allowCredentials: [],
      userVerification: 'required',
      timeout: 60000,
    },
  })

  if (!assertion) return null
  return {
    credentialId: assertion.id,
    challenge: toB64u(challenge),
    clientDataJSON: assertion.response.clientDataJSON,
    authenticatorData: assertion.response.authenticatorData,
    signature: assertion.response.signature,
    real: true,
  }
}

/** ECDSA signatures arrive DER-encoded; WebCrypto wants raw r||s. */
function derToRaw(der) {
  const d = new Uint8Array(der)
  if (d[0] !== 0x30) return d // already raw
  let i = 2
  if (d[1] & 0x80) i += d[1] & 0x7f // long-form length
  const read = () => {
    i++ // 0x02 INTEGER tag
    const len = d[i++]
    let val = d.slice(i, i + len)
    i += len
    while (val.length > 32 && val[0] === 0) val = val.slice(1) // strip sign pad
    const out = new Uint8Array(32)
    out.set(val, 32 - val.length)
    return out
  }
  const r = read()
  const s = read()
  const raw = new Uint8Array(64)
  raw.set(r, 0)
  raw.set(s, 32)
  return raw
}

/**
 * Verify the assertion against the stored public key: the challenge we just
 * issued, our own origin, and the signature over the authenticator data.
 */
export async function verifyAssertion(assertion, stored) {
  if (!stored?.publicKey) return { ok: false, reason: 'no stored public key' }

  const clientData = JSON.parse(new TextDecoder().decode(assertion.clientDataJSON))
  if (clientData.type !== 'webauthn.get') return { ok: false, reason: 'wrong ceremony type' }
  if (clientData.challenge !== assertion.challenge) return { ok: false, reason: 'challenge mismatch' }
  if (clientData.origin !== window.location.origin) return { ok: false, reason: 'origin mismatch' }

  const rsa = stored.alg === -257
  const key = await crypto.subtle.importKey(
    'spki',
    fromB64u(stored.publicKey),
    rsa
      ? { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
      : { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  )

  const clientHash = new Uint8Array(
    await crypto.subtle.digest('SHA-256', assertion.clientDataJSON),
  )
  const authData = new Uint8Array(assertion.authenticatorData)
  const signed = new Uint8Array(authData.length + clientHash.length)
  signed.set(authData, 0)
  signed.set(clientHash, authData.length)

  const signature = rsa
    ? new Uint8Array(assertion.signature)
    : derToRaw(assertion.signature)

  const ok = await crypto.subtle.verify(
    rsa ? { name: 'RSASSA-PKCS1-v1_5' } : { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    signed,
  )
  return { ok, reason: ok ? null : 'signature rejected' }
}

/** True when the guest dismissed the OS sheet rather than something breaking. */
export const isCancellation = (err) =>
  err?.name === 'NotAllowedError' || err?.name === 'AbortError'
