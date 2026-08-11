/**
 * Simulated ChqIn identity + passkey layer.
 *
 * The ceremonies themselves are real where the platform allows
 * (see passkey.js); this module is the storage either side of
 * them, and the reason the app can *decide* which check-in journey a guest is
 * in instead of asking them — the one rule the flow must never break.
 *
 * The device store doubles as the detection hint. WebAuthn deliberately gives
 * no way to ask "is there a passkey here?" without a user gesture and a
 * biometric prompt, so a local record is how any real app guesses; the
 * ceremony on the next screen is what confirms it.
 *
 * Two stores, deliberately separate:
 *
 *   chqin.device.credentials — the "passkeys on this phone". Wiping this is
 *                              what a new device looks like.
 *   chqin.identities         — stands in for the ChqIn server. Identity
 *                              records survive a device wipe, which is what
 *                              makes recovery on a new device possible.
 */

const DEVICE_KEY = 'chqin.device.credentials'
const SERVER_KEY = 'chqin.identities'

function read(key) {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function write(key, value) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode / quota — the prototype degrades to first-time every scan */
  }
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/**
 * Decide the journey from device + server state. The guest never picks.
 *
 *   returning  — this device holds a passkey the identity still recognises
 *   newDevice  — no passkey here, but the QR session resolves to an identity
 *   firstTime  — neither
 *
 * @param {{ bookingRef: string }} session — the check-in session behind the QR
 */
export function detect(session) {
  const identities = read(SERVER_KEY)
  const credentials = read(DEVICE_KEY)

  for (const credential of credentials) {
    const identity = identities.find((i) => i.id === credential.identityId)
    // The server has to still trust the credential — revoking it server-side
    // drops this device back to the new-device path.
    const known = identity?.credentials?.some((c) => c.id === credential.credentialId)
    if (known) return { mode: 'returning', identity, credential }
  }

  // No passkey here. The QR carries the booking, so an existing guest is
  // recoverable without asking them for a phone number or an OTP.
  const known = identities.find((i) => i.bookingRef === session.bookingRef)
  if (known) return { mode: 'newDevice', identity: known, credential: null }

  return { mode: 'firstTime', identity: null, credential: null }
}

/* ------------------------------------------------------------------ */
/* Enrolment                                                           */
/* ------------------------------------------------------------------ */

/** Create the persistent ChqIn Identity after one-time verification. */
export function createIdentity({ bookingRef, guestName }) {
  const identities = read(SERVER_KEY)
  const existing = identities.find((i) => i.bookingRef === bookingRef)
  if (existing) return existing

  const identity = {
    id: randomId('chq'),
    name: guestName,
    bookingRef,
    createdAt: Date.now(),
    credentials: [],
  }
  write(SERVER_KEY, [...identities, identity])
  return identity
}

/**
 * Register a passkey for this device against an identity.
 *
 * The server side keeps only what a real ChqIn would: the credential ID and
 * the public key. The private half lives in the phone's secure enclave and is
 * never seen here — with `real: false` it doesn't exist at all, because the
 * ceremony was simulated.
 *
 * @param {{ credentialId: string, publicKey?: string, alg?: number, real?: boolean }} passkey
 */
export function registerCredential(identityId, passkey = {}) {
  const credentialId = passkey.credentialId ?? randomId('cred')
  const record = {
    id: credentialId,
    publicKey: passkey.publicKey ?? null,
    alg: passkey.alg ?? null,
    real: passkey.real ?? false,
    createdAt: Date.now(),
  }

  const identities = read(SERVER_KEY).map((i) =>
    i.id === identityId ? { ...i, credentials: [...(i.credentials ?? []), record] } : i,
  )
  write(SERVER_KEY, identities)

  const credential = { credentialId, identityId, real: record.real, createdAt: record.createdAt }
  write(DEVICE_KEY, [...read(DEVICE_KEY), credential])
  return credential
}

/**
 * Look up the identity behind an asserted credential, and hand back the
 * stored public key so the assertion's signature can be checked.
 */
export function authenticate(credentialId) {
  const identities = read(SERVER_KEY)
  for (const identity of identities) {
    const credential = identity.credentials?.find((c) => c.id === credentialId)
    if (credential) return { ok: true, identity, credential }
  }
  return { ok: false, identity: null, credential: null }
}

/* ------------------------------------------------------------------ */
/* Prototype controls — device state, never journey choice             */
/* ------------------------------------------------------------------ */

/** Wipe this device's passkeys. Server identities survive → new device. */
export function forgetDevice() {
  write(DEVICE_KEY, [])
}

/** Wipe everything, device and server → first-time guest. */
export function resetAll() {
  write(DEVICE_KEY, [])
  write(SERVER_KEY, [])
}

/** For the prototype's status line. */
export function snapshot() {
  return { credentials: read(DEVICE_KEY), identities: read(SERVER_KEY) }
}
