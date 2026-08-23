import { createHmac, timingSafeEqual } from 'node:crypto'
import { config } from '../config.js'

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
 * next request is 401. SameSite=None has the same symptom for a different
 * reason, and browsers require Secure alongside it.
 *
 * Which is why this reads the request's own scheme rather than inferring it.
 * It used to ask `isRemote()`, meaning "does DATABASE_URL point somewhere
 * hosted" — a stand-in for "are we deployed" that quietly became wrong the day
 * local development started against a hosted database: every local login then
 * issued a Secure cookie over http and every request after it was a 401. The
 * database's address was never evidence about the browser's connection.
 *
 * Behind a proxy the socket is plain http and only `x-forwarded-proto` knows
 * the truth, so that is trusted when present — Render and Vercel both set it,
 * and neither passes a client-supplied one through.
 */
export const cookieOptions = (c) => {
  const forwarded = c?.req?.header('x-forwarded-proto')?.split(',')[0]?.trim()
  const scheme = forwarded ?? (c ? new URL(c.req.url).protocol.replace(':', '') : 'https')

  return {
    httpOnly: true,
    sameSite: config.COOKIE_SAMESITE,
    secure: config.COOKIE_SAMESITE === 'None' || scheme === 'https',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  }
}
