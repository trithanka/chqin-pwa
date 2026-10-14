import { and, eq, isNull, sql } from 'drizzle-orm'
import { config } from '../../config.js'
import { db } from '../../db/client.js'
import { adminSessions, adminUsers, outbox } from '../../db/schema/index.js'
import { decrypt } from '../../lib/crypto.js'
import { conflict, invalid, notFound } from '../../lib/errors.js'
import { resetTotp, revokeAllFor } from './auth.js'
import { camel, maskEmail, maskPhone, whereAll } from './util.js'

/**
 * The outbox, the two logs (guest auth events and admin actions), and the
 * admin accounts themselves.
 */

const rowsOf = async (query) => (await db.execute(query)).rows.map(camel)

/* ------------------------------------------------------------------ */
/* Outbox                                                              */
/* ------------------------------------------------------------------ */

/** The payload as stored, with the recipient's number masked. */
const preview = (payload) => (payload?.to ? { ...payload, to: maskPhone(payload.to) } : payload)

export async function listOutbox({ status, kind, venueId, cursor, limit }) {
  const rows = await rowsOf(sql`
    SELECT o.id, o.kind, o.status, o.attempts, o.last_error, o.run_after, o.created_at, o.sent_at, o.payload,
      o.venue_id, v.name AS venue
    FROM outbox o LEFT JOIN venues v ON v.id = o.venue_id
    WHERE ${whereAll([
      status && sql`o.status = ${status}`,
      kind && sql`o.kind = ${kind}`,
      venueId && sql`o.venue_id = ${venueId}`,
      cursor && sql`o.id < ${cursor}`,
    ])}
    ORDER BY o.id DESC LIMIT ${limit + 1}`)
  return rows.map((r) => ({ ...r, payload: preview(r.payload) }))
}

export const outboxInfo = async () => ({
  sender: config.OUTBOX_SENDER ?? null,
  kinds: (await rowsOf(sql`SELECT DISTINCT kind FROM outbox ORDER BY kind`)).map((r) => r.kind),
})

async function lockMessage(tx, id) {
  const [row] = await tx.select().from(outbox).where(eq(outbox.id, id)).for('update')
  if (!row) throw notFound('That message was not found.')
  return row
}

/** A failed message goes back in the queue, due now, with a fresh set of attempts. */
export async function retryMessage(tx, id) {
  const row = await lockMessage(tx, id)
  if (row.status !== 'failed') throw conflict('not_failed', `Only a failed message can be retried; this one is ${row.status}.`)
  await tx.update(outbox).set({ status: 'pending', attempts: 0, runAfter: new Date() }).where(eq(outbox.id, id))
  return { before: { status: 'failed', attempts: row.attempts }, after: { status: 'pending', attempts: 0 }, result: { ok: true }, venueId: row.venueId }
}

/** A pending message is never sent. The row stays, saying it existed. */
export async function cancelMessage(tx, id) {
  const row = await lockMessage(tx, id)
  if (row.status !== 'pending') throw conflict('not_pending', `Only a pending message can be cancelled; this one is ${row.status}.`)
  await tx.update(outbox).set({ status: 'cancelled' }).where(eq(outbox.id, id))
  return { before: { status: 'pending' }, after: { status: 'cancelled' }, result: { ok: true }, venueId: row.venueId }
}

/* ------------------------------------------------------------------ */
/* Guest auth events                                                   */
/* ------------------------------------------------------------------ */

export async function listAuthEvents({ event, outcome, venueId, guestId, ip, cursor, limit }) {
  if (ip && !/^[0-9a-fA-F:.]+$/.test(ip)) throw invalid('That is not an IP address.')
  return rowsOf(sql`
    SELECT a.id, a.occurred_at, a.event, a.outcome, a.detail, host(a.ip) AS ip, a.user_agent,
      a.guest_id, a.venue_id, a.session_id, a.credential_id, v.name AS venue
    FROM auth_events a LEFT JOIN venues v ON v.id = a.venue_id
    WHERE ${whereAll([
      event && sql`a.event = ${event}`,
      outcome && sql`a.outcome = ${outcome}`,
      venueId && sql`a.venue_id = ${venueId}`,
      guestId && sql`a.guest_id = ${guestId}`,
      ip && sql`a.ip = ${ip}::inet`,
      cursor && sql`a.id < ${cursor}`,
    ])}
    ORDER BY a.id DESC LIMIT ${limit + 1}`)
}

export const authEventNames = async () =>
  (await rowsOf(sql`SELECT DISTINCT event FROM auth_events ORDER BY event`)).map((r) => r.event)

/* ------------------------------------------------------------------ */
/* Admin audit log                                                     */
/* ------------------------------------------------------------------ */

const auditWhere = ({ adminId, action, targetType, targetId, venueId, from, to, cursor }) =>
  whereAll([
    adminId && sql`l.admin_id = ${adminId}`,
    action && sql`l.action = ${action}`,
    targetType && sql`l.target_type = ${targetType}`,
    targetId && sql`l.target_id = ${targetId}`,
    venueId && sql`l.venue_id = ${venueId}`,
    from && sql`l.occurred_at >= ${from}::date`,
    to && sql`l.occurred_at < ${to}::date + 1`,
    cursor && sql`l.id < ${cursor}`,
  ])

export const listAudit = ({ limit, ...filters }) =>
  rowsOf(sql`
    SELECT l.id, l.occurred_at, l.admin_id, l.admin_name, l.role, l.action, l.target_type, l.target_id,
      l.venue_id, l.reason, l.changes, host(l.ip) AS ip, l.user_agent
    FROM admin_audit_log l WHERE ${auditWhere(filters)}
    ORDER BY l.id DESC LIMIT ${limit + 1}`)

export const auditActions = async () => (await rowsOf(sql`SELECT DISTINCT action FROM admin_audit_log ORDER BY action`)).map((r) => r.action)

const CSV_LIMIT = 10_000
const cell = (value) => {
  const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Quoted always; a leading formula character is neutralised so a spreadsheet
  // doesn't execute a reason someone typed.
  return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, '""')}"`
}

/** Rows as CSV text, capped. Returns the count so the export's own audit row can say how many. */
export function toCsv(rows, columns) {
  const lines = [columns.join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))]
  return lines.join('\n')
}

export async function auditCsv(filters) {
  const rows = await listAudit({ ...filters, limit: CSV_LIMIT - 1 })
  return {
    count: rows.length,
    csv: toCsv(rows, ['occurredAt', 'adminName', 'role', 'action', 'targetType', 'targetId', 'venueId', 'reason', 'changes', 'ip', 'userAgent']),
  }
}

/* ------------------------------------------------------------------ */
/* Admin accounts (owner only)                                         */
/* ------------------------------------------------------------------ */

export async function listAdmins() {
  const rows = await rowsOf(sql`
    SELECT u.id, u.display_name AS name, u.email_enc, u.role, u.status, u.totp_enabled_at, u.created_at, u.last_login_at,
      u.locked_until,
      (SELECT count(*)::int FROM admin_sessions s WHERE s.admin_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS sessions
    FROM admin_users u ORDER BY u.created_at`)
  return rows.map(({ emailEnc, ...r }) => ({ ...r, email: maskEmail(decrypt(emailEnc)) }))
}

export const adminSessionsOf = (adminId) =>
  rowsOf(sql`
    SELECT id, created_at, last_seen_at, expires_at, revoked_at, mfa_at, host(ip) AS ip, user_agent,
      (revoked_at IS NULL AND expires_at > now()) AS active
    FROM admin_sessions WHERE admin_id = ${adminId} ORDER BY id DESC LIMIT 50`)

async function lockAdmin(tx, id) {
  const [row] = await tx.select().from(adminUsers).where(eq(adminUsers.id, id)).for('update')
  if (!row) throw notFound('That admin was not found.')
  return row
}

/** There must always be an active owner, or nobody can manage admins again without the CLI. */
async function assertOtherOwner(tx, id) {
  const [{ owners }] = (
    await tx.execute(sql`SELECT count(*)::int AS owners FROM admin_users WHERE role = 'owner' AND status = 'active' AND id <> ${id}`)
  ).rows
  if (!owners) throw conflict('last_owner', 'This is the last active owner. Make someone else an owner first.')
}

export async function updateAdmin(tx, id, patch, self) {
  if (id === self) throw conflict('self', "You can't change your own role or status. Ask another owner.")
  const before = await lockAdmin(tx, id)
  if (before.role === 'owner' && (patch.role && patch.role !== 'owner' || patch.status === 'disabled')) await assertOtherOwner(tx, id)
  const [after] = await tx.update(adminUsers).set(patch).where(eq(adminUsers.id, id)).returning()
  // Sessions read the role and status on every request, so this applies at
  // once; disabling also ends the sessions outright.
  if (patch.status === 'disabled') await revokeAllFor(id, tx)
  const pick = (u) => ({ role: u.role, status: u.status })
  return { before: pick(before), after: pick(after), result: pick(after) }
}

export async function reset2fa(tx, id) {
  await lockAdmin(tx, id)
  const link = await resetTotp(tx, id)
  return { changes: { totp: 'reset', sessions: 'revoked' }, result: { link } }
}

export async function revokeAdminSession(tx, sessionId) {
  const [row] = await tx
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)))
    .returning({ adminId: adminSessions.adminId })
  if (!row) throw notFound('That session was not found or has already ended.')
  return { changes: { session: sessionId }, result: { ok: true }, targetId: row.adminId }
}
