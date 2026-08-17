import { db } from '../db/client.js'
import { authEvents } from '../db/schema/index.js'

/**
 * Detail is written to a jsonb column, so a string in it has to be valid text.
 *
 * The values that end up here are often error messages, and a driver error
 * message can carry a dump of the failing row — raw hmac bytes and all. Those
 * bytes aren't valid UTF-8, Postgres rejects the whole insert, and the audit
 * trail loses precisely the failed attempt it exists to record. So: strip what
 * isn't printable, and cap the length, because a paragraph of stack trace in an
 * audit row is noise either way.
 */
const MAX_DETAIL_STRING = 300

const clean = (value) => {
  if (typeof value === 'string') {
    const printable = value
      // Control characters, then lone surrogates — the shape stray binary takes
      // once it has been read as a JS string.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
      .replace(/[\uD800-\uDFFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    return printable.length > MAX_DETAIL_STRING
      ? `${printable.slice(0, MAX_DETAIL_STRING)}…`
      : printable
  }
  if (Array.isArray(value)) return value.map(clean)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]))
  }
  return value
}

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
      detail: clean(fields.detail ?? {}),
      ip: c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    })
    .catch((err) => console.error('auth_event write failed:', err.message))
}
