import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

/**
 * Password hashing with scrypt.
 *
 * scrypt rather than argon2id only because it's in Node's standard library —
 * no native build to fail on a deploy. It's memory-hard and accepted by OWASP;
 * argon2id is the better primitive when adding the dependency is worth it.
 *
 * Stored as `scrypt$N$r$p$salt$hash`. The prefix is the point: moving to
 * argon2id later means branching on it and rehashing at next login, rather
 * than locking everyone out of their account.
 */

const scryptAsync = promisify(scrypt)

// ~100ms on a modern laptop. Slow is the feature — it's what makes a stolen
// hash expensive to guess against.
const N = 2 ** 15
const r = 8
const p = 1
const KEY_LENGTH = 32

// scrypt needs roughly 128 * N * r bytes — ~34MB here — and Node caps maxmem
// at 32MB unless told otherwise. Without this every hash throws
// ERR_CRYPTO_INVALID_SCRYPT_PARAMS, which reads as a param bug rather than a
// ceiling.
const maxmem = 64 * 1024 * 1024

export async function hashPassword(password) {
  const salt = randomBytes(32)
  const hash = await scryptAsync(password.normalize('NFKC'), salt, KEY_LENGTH, { N, r, p, maxmem })
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64url')}$${hash.toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false
  const [scheme, nRaw, rRaw, pRaw, saltRaw, hashRaw] = stored.split('$')
  if (scheme !== 'scrypt') return false

  try {
    const salt = Buffer.from(saltRaw, 'base64url')
    const expected = Buffer.from(hashRaw, 'base64url')
    const actual = await scryptAsync(password.normalize('NFKC'), salt, expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem,
    })
    // Constant time: a fast "no" leaks how much of the hash matched.
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
