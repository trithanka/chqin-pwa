import { db } from '../db/client.js'
import { authEvents } from '../db/schema/index.js'

/**
 * Append-only, best-effort: an audit write must never fail a check-in, so this
 * swallows its own errors and logs them instead.
 */
export function logEvent(c, fields) {
  return db
    .insert(authEvents)
    .values({
      guestId: fields.guestId ?? null,
      credentialId: fields.credentialId ?? null,
      venueId: fields.venueId ?? null,
      sessionId: fields.sessionId ?? null,
      event: fields.event,
      outcome: fields.outcome,
      detail: fields.detail ?? {},
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    })
    .catch((err) => console.error('auth_event write failed:', err.message))
}
