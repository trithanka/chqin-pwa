/**
 * What this device remembers: the credential IDs of passkeys enrolled here.
 *
 * That's all. Identity lives on the server now — this is only the hint that
 * lets `/detect` answer "returning" before any ceremony runs, because WebAuthn
 * gives no way to ask whether a passkey exists without a biometric prompt.
 *
 * Being wrong is safe: a stale hint means the assertion fails and the guest
 * falls to the new-device path, which is exactly where they belong.
 */

const KEY = 'chqin.device.credentials'

const read = () => {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const write = (value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value))
  } catch {
    /* private mode: every scan looks like a new device, which is honest */
  }
}

export const knownCredentialIds = () => read().map((c) => c.credentialId)

export function rememberCredential(credentialId) {
  const existing = read().filter((c) => c.credentialId !== credentialId)
  write([...existing, { credentialId, addedAt: Date.now() }])
}

export function forgetCredential(credentialId) {
  write(read().filter((c) => c.credentialId !== credentialId))
}

/** Prototype control: makes the next scan look like a new device. */
export const forgetDevice = () => write([])
