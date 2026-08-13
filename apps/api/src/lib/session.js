import { createHmac, timingSafeEqual } from 'node:crypto'
import { config, isRemote } from '../config.js'

/**
 * Staff sessions as a signed cookie — no session table.
 *
 * The cookie carries who you are and which venue you're in, signed with
 * HASH_PEPPER. That's enough for read endpoints and keeps a whole table (and
 * the expiry job that comes with it) out of the system. The trade is real:
 * there is no server-side revocation, so a stolen cookie is valid until it
 * expires. Add a `staff_sessions` table the day that matters — logout today
 * only clears the browser's copy.
 */

export const COOKIE = 'chqin_staff'
const MAX_AGE_SECONDS = 60 * 60 * 12

const sign = (payload) =>
  createHmac('sha256', config.HASH_PEPPER).update(payload).digest('base64url')

export function issue({ staffId, venueId, role }) {
  const payload = Buffer.from(
    JSON.stringify({ staffId, venueId, role, exp: Date.now() + MAX_AGE_SECONDS * 1000 }),
  ).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function read(token) {
  if (!token || !token.includes('.')) return null
  const [payload, signature] = token.split('.')

  const expected = Buffer.from(sign(payload))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    return claims.exp > Date.now() ? claims : null
  } catch {
    return null
  }
}

/**
 * `secure` has to be off over plain http or the browser silently drops the
 * cookie — which looks exactly like a broken session: login returns 200, the
 * next request is 401.
 */
export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'Lax',
  secure: isRemote() || process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: MAX_AGE_SECONDS,
})
