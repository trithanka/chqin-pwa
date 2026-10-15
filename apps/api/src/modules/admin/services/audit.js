import { db, transaction } from '../../../shared/db/client.js'
import { adminAuditLog } from '../../../shared/db/schema.js'
import { forbidden, invalid } from '../../../shared/lib/errors.js'
import { clientIp } from './util.js'

/**
 * The one way an admin changes anything.
 *
 * The opposite of logEvent on purpose. That one is best-effort and fires after
 * the response, because a failed audit write must never fail a guest's
 * check-in. Here the audit row is the point: it is written in the same
 * transaction as the change, so a change that cannot be recorded does not
 * happen, and "who did this" always has an answer.
 */

/** Only the fields whose value changed, as { field: { before, after } }. */
export function diff(before = {}, after = {}) {
  const changes = {}
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])) {
    const a = before?.[key]
    const b = after?.[key]
    if (JSON.stringify(a) !== JSON.stringify(b)) changes[key] = { before: a ?? null, after: b ?? null }
  }
  return changes
}

const actor = (c) => {
  const admin = c.get('admin')
  return {
    adminId: admin.adminId,
    adminName: admin.name,
    role: admin.role,
    ip: clientIp(c),
    userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
  }
}

const reasonOf = (reason, needed) => {
  const text = typeof reason === 'string' ? reason.trim() : ''
  if (needed && text.length < 5) throw invalid('Give a reason (at least 5 characters).')
  return text ? text.slice(0, 500) : null
}

/**
 * @param meta { action, targetType, targetId?, venueId?, reason?, needsReason? }
 * @param fn   (tx) => { before?, after?, result, targetId?, venueId?, changes? }
 *             `changes` replaces the computed diff for actions that are not an
 *             edit of one row (a delete, an erase).
 */
export async function adminWrite(c, meta, fn) {
  // requireRole already refuses this; a second check costs nothing and holds
  // if a route is ever registered without one.
  if (c.get('admin').role === 'read_only') throw forbidden('read_only', 'Your role can only look.')
  const reason = reasonOf(meta.reason, meta.needsReason)

  return transaction(async (tx) => {
    const out = (await fn(tx)) ?? {}
    await tx.insert(adminAuditLog).values({
      ...actor(c),
      action: meta.action,
      targetType: meta.targetType ?? null,
      targetId: String(out.targetId ?? meta.targetId ?? '') || null,
      venueId: out.venueId ?? meta.venueId ?? null,
      reason,
      changes: out.changes ?? diff(out.before, out.after),
    })
    return out.result
  })
}

/**
 * An audited read: a reveal or an export. Awaited and committed before the
 * caller returns anything, so a value can't be seen without a row saying so.
 */
export async function adminRecord(c, meta) {
  const reason = reasonOf(meta.reason, meta.needsReason)
  await db.insert(adminAuditLog).values({
    ...actor(c),
    action: meta.action,
    targetType: meta.targetType ?? null,
    targetId: meta.targetId ? String(meta.targetId) : null,
    venueId: meta.venueId ?? null,
    reason,
    changes: meta.changes ?? {},
  })
}
