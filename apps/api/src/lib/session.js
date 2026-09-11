import { and, eq, isNull } from 'drizzle-orm'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { staffSessions } from '../db/schema/index.js'
import { newSessionToken, tokenHash } from './crypto.js'

/**
 * Staff sessions as a row, not a self-contained signed cookie.
 *
 * This used to be an HMAC-signed payload carrying the claims — no table, no
 * expiry job, and no way to revoke. That trade stops being worth it the moment
 * real staff exist: logout only cleared the browser's copy, so a stolen cookie
 * stayed valid for its full twelve hours and a dismissed employee kept access
 * until it expired.
 *
 * Now the cookie holds an opaque random token and the row holds the claims.
 * Revoking is an UPDATE, and it takes effect on the next request. The cost is
 * one indexed lookup per authenticated request, which is the right price.
 *
 * A side effect worth naming: sessions no longer depend on HASH_PEPPER, so
 * changing that secret no longer logs everyone out on top of everything else
 * it breaks.
 */

export const COOKIE = 'chqin_staff'
const MAX_AGE_SECONDS = 60 * 60 * 12

/** Creates the row and returns the token that addresses it. */
export async function issue({ staffId, venueId, role }) {
  const token = newSessionToken()
  await db.insert(staffSessions).values({
    staffId,
    venueId,
    role,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + MAX_AGE_SECONDS * 1000),
  })
  return token
}

/** The claims behind a cookie, or null if it is expired, revoked or forged. */
export async function read(token) {
  if (!token) return null

  const session = await db.query.staffSessions.findFirst({
    where: (s, { eq: e, and: a, isNull: n, gt: g }) =>
      a(e(s.tokenHash, tokenHash(token)), n(s.revokedAt), g(s.expiresAt, new Date())),
  })
  if (!session) return null

  return { staffId: session.staffId, venueId: session.venueId, role: session.role, sessionId: session.id }
}

/** Logout. Idempotent: an already-revoked or unknown token is not an error. */
export async function revoke(token) {
  if (!token) return
  await db
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSessions.tokenHash, tokenHash(token)), isNull(staffSessions.revokedAt)))
}

/**
 * Ends every session this person has anywhere.
 *
 * Called on password reset. Without it, resetting the password does not
 * dislodge whoever prompted the reset — they keep the cookie they stole.
 */
export async function revokeAllFor(staffId) {
  await db
    .update(staffSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(staffSessions.staffId, staffId), isNull(staffSessions.revokedAt)))
}

// ponytail: expired rows are left in place. They can never authenticate — the
// lookup requires expires_at in the future — and a dozen dead rows per staff
// member per year is not a table anyone will notice. Add a scheduled delete if
// it ever is; a prune fired from a request path just hides its own failures.

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
