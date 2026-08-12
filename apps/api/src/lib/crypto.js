import { createHash, createHmac, randomBytes } from 'node:crypto'
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
