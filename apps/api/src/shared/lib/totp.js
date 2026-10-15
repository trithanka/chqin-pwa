import { createHmac, randomBytes } from 'node:crypto'

/**
 * TOTP (RFC 6238): HMAC-SHA1, six digits, thirty-second steps — what every
 * authenticator app speaks. On node:crypto because the whole algorithm is a
 * dozen lines; a dependency for it would be a dependency for a dozen lines.
 *
 * The secret is base32 because that is what an otpauth:// URI carries and what
 * a person types when a QR won't scan.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const STEP_SECONDS = 30
const DIGITS = 6

export function toBase32(buffer) {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export function fromBase32(text) {
  let bits = 0
  let value = 0
  const out = []
  for (const char of text.replace(/[\s=]/g, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char)
    if (index === -1) throw new Error('not base32')
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** 160 bits, the size RFC 4226 recommends for SHA-1. */
export const newSecret = () => toBase32(randomBytes(20))

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS)

/** The code for one time step. `digits` exists for the RFC's eight-digit test vectors. */
export function codeAt(secret, step, digits = DIGITS) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))
  const mac = createHmac('sha1', fromBase32(secret)).update(counter).digest()
  const offset = mac[mac.length - 1] & 0x0f
  const binary = mac.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 10 ** digits).padStart(digits, '0')
}

/**
 * The step a code matched, or null.
 *
 * One step either side forgives a phone clock a few seconds out. A step at or
 * below `lastStep` is refused: a code seen over someone's shoulder (or in a
 * proxy log) is then worth nothing once it has been used.
 */
export function verifyCode(secret, code, { lastStep = -1, now = Date.now() } = {}) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return null
  const current = stepAt(now)
  for (const step of [current - 1, current, current + 1]) {
    if (step > lastStep && codeAt(secret, step) === code) return step
  }
  return null
}

export const otpauthUri = (secret, account, issuer = 'ChqIn Admin') =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}` +
  `?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`
