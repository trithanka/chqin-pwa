import { isIP } from 'node:net'
import { getConnInfo } from '@hono/node-server/conninfo'
import { sql } from 'drizzle-orm'
import { config } from '../../config.js'
import { invalid } from '../../lib/errors.js'

/**
 * Small pieces every admin service shares: who is calling from where, how a
 * list pages, and how a personal value is shown without being shown.
 */

/**
 * The caller's address, as the allow-list and the audit log see it.
 *
 * From ADMIN_CLIENT_IP_HEADER when the proxy is known to set it, else from the
 * socket. Never the leftmost X-Forwarded-For: Render appends to that header,
 * so its first entry is whatever the client wrote.
 */
export function clientIp(c) {
  let ip = null
  if (config.ADMIN_CLIENT_IP_HEADER) {
    ip = c.req.header(config.ADMIN_CLIENT_IP_HEADER)?.split(',')[0]?.trim() ?? null
  } else {
    try {
      ip = getConnInfo(c).remote.address ?? null
    } catch {
      ip = null // app.request() in tests has no socket
    }
  }
  if (ip?.startsWith('::ffff:')) ip = ip.slice(7)
  // The audit column is inet: a malformed value would fail the insert, and with
  // it the change being audited.
  return ip && isIP(ip) ? ip : null
}

/* ------------------------------------------------------------------ */
/* Paging                                                              */
/* ------------------------------------------------------------------ */

/**
 * Keyset paging on the id. Ids are UUIDv7, so id order is creation order and
 * "newest first, then the next page" is `WHERE id < $cursor ORDER BY id DESC`
 * on an index that already exists. Fetch `limit + 1` and pass it to pageOf.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function pageParams(query) {
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const cursor = query.cursor || null
  if (cursor && !UUID.test(cursor)) throw invalid('That page cursor is not valid.')
  return { limit, cursor }
}

export const pageOf = (rows, limit) => ({
  items: rows.slice(0, limit),
  next: rows.length > limit ? rows[limit - 1].id : null,
})

/* ------------------------------------------------------------------ */
/* Raw SQL helpers                                                     */
/* ------------------------------------------------------------------ */

/** Joins the conditions that are present with AND; none present is `true`. */
export const whereAll = (parts) => {
  const present = parts.filter(Boolean)
  return present.length ? sql.join(present, sql` AND `) : sql`true`
}

export const like = (q) => `%${q.replace(/[%_\\]/g, '\\$&')}%`
export const camel = (row) =>
  Object.fromEntries(Object.entries(row).map(([k, v]) => [k.replace(/_(\w)/g, (_, c) => c.toUpperCase()), v]))

/* ------------------------------------------------------------------ */
/* Masking                                                             */
/* ------------------------------------------------------------------ */

const DOT = '•'

/** t•••@g•••.com */
export function maskEmail(email) {
  if (!email) return null
  const [user, domain = ''] = email.split('@')
  const [host, ...tld] = domain.split('.')
  return `${user.slice(0, 1)}${DOT.repeat(3)}@${host ? host.slice(0, 1) + DOT.repeat(3) : ''}${tld.length ? `.${tld.join('.')}` : ''}`
}

/** +91 98••• ••210 — the country code, two leading and three trailing digits. */
export function maskPhone(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) return DOT.repeat(4)
  const local = digits.length > 10 ? digits.slice(-10) : digits
  const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : ''
  return `${country}${local.slice(0, 2)}${DOT.repeat(3)} ${DOT.repeat(2)}${local.slice(-3)}`
}

/** Built from the last four digits only: the number itself is never stored. */
export const maskAadhaar = (last4) => (last4 ? `XXXX XXXX ${last4}` : null)
