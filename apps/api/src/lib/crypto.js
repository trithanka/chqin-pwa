import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto'
import { config } from '../config.js'

/**
 * Keyed hash for lookup columns. A bare SHA-256 of an email or phone number is
 * offline-attackable — the input space is small and guessable — so the digest
 * is keyed with a secret the database itself never holds.
 */
export const lookupHash = (value) =>
  value ? createHmac('sha256', config.HASH_PEPPER).update(value.trim().toLowerCase()).digest() : null

/** Session tokens are high-entropy already, so a plain digest is enough. */
export const tokenHash = (token) => createHash('sha256').update(token).digest()

export const newSessionToken = () => randomBytes(32).toString('base64url')

/**
 * The `*_enc` columns — email addresses, today.
 *
 * The hash columns answer "is this the same person"; these answer "where do I
 * send the mail". Both are needed and neither substitutes for the other: a
 * password reset with only an HMAC has nowhere to send to.
 *
 * AES-256-GCM, stored as iv(12) ‖ tag(16) ‖ ciphertext in one bytea. GCM
 * rather than CBC because it authenticates: a tampered row fails to decrypt
 * instead of returning a different address.
 */
const key = Buffer.from(config.ENCRYPTION_KEY, 'base64')
if (key.length !== 32) {
  console.error('ENCRYPTION_KEY must be 32 bytes, base64 encoded. Refusing to start.')
  process.exit(1)
}

export const encrypt = (value) => {
  if (value == null) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body])
}

/**
 * Null rather than throwing on a row that won't decrypt: rows written before
 * this existed have no ciphertext, and a key that has been rotated leaves the
 * same shape. Callers treat "no address" as "can't mail this person", which
 * is the truth in both cases.
 */
export const decrypt = (buffer) => {
  if (!buffer?.length) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12))
    decipher.setAuthTag(buffer.subarray(12, 28))
    return decipher.update(buffer.subarray(28)) + decipher.final('utf8')
  } catch {
    return null
  }
}
