import { Hono } from 'hono'
import { z } from 'zod'
import { body } from '../../lib/validate.js'
import { endSession, getEntry, getSession, listEntries, listSessions } from '../../services/admin/activity.js'
import { adminRecord, adminWrite } from '../../services/admin/audit.js'
import {
  eraseGuest,
  forceReset,
  getGuest,
  getStaff,
  listGuests,
  listStaff,
  revealGuest,
  revokeCredential,
  revokeStaffSessions,
  sendReset,
  setGuestStatus,
  setMembershipRole,
  setStaffStatus,
  verifyStaffEmail,
} from '../../services/admin/people.js'
import { pageOf, pageParams } from '../../services/admin/util.js'
import { OWNER, WRITE } from './guard.js'

/** Staff accounts, guests, entries and sessions. */
export const peopleRoutes = new Hono()

const reasoned = z.object({ reason: z.string().max(500) })
const paged = (list) => async (c) => {
  const { limit, cursor } = pageParams(c.req.query())
  return c.json(pageOf(await list({ ...c.req.query(), cursor, limit }), limit))
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

peopleRoutes.get('/staff', paged(listStaff))
peopleRoutes.get('/staff/:id', async (c) => c.json(await getStaff(c.req.param('id'))))

const staffWrite = (action, run, { needsReason = true } = {}) => async (c) => {
  const id = c.req.param('id')
  const input = c.get('body')
  return c.json(
    await adminWrite(c, { action, targetType: 'staff', targetId: id, reason: input.reason, needsReason }, (tx) => run(tx, id, input)),
  )
}

peopleRoutes.post('/staff/:id/revoke-sessions', WRITE, body(reasoned), staffWrite('staff.revoke_sessions', revokeStaffSessions))

peopleRoutes.post('/staff/:id/password-reset', WRITE, body(reasoned), async (c) => {
  const id = c.req.param('id')
  const { email } = await adminWrite(c, { action: 'staff.force_reset', targetType: 'staff', targetId: id, reason: c.get('body').reason, needsReason: true }, (tx) =>
    forceReset(tx, id),
  )
  // After commit, through the existing mail service.
  sendReset(email)
  return c.json({ ok: true })
})

peopleRoutes.post(
  '/staff/:id/verify-email',
  WRITE,
  body(z.object({ reason: z.string().max(500).optional() })),
  staffWrite('staff.verify_email', verifyStaffEmail, { needsReason: false }),
)

peopleRoutes.post(
  '/staff/:id/status',
  WRITE,
  body(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().max(500) })),
  staffWrite('staff.status', (tx, id, { status }) => setStaffStatus(tx, id, status)),
)

peopleRoutes.post(
  '/memberships/:id/role',
  WRITE,
  body(z.object({ role: z.enum(['owner', 'manager', 'frontdesk', 'approver']), reason: z.string().max(500) })),
  async (c) => {
    const id = c.req.param('id')
    const { role, reason } = c.get('body')
    return c.json(
      await adminWrite(c, { action: 'staff.role', targetType: 'staff', reason, needsReason: true }, (tx) => setMembershipRole(tx, id, role)),
    )
  },
)

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

peopleRoutes.get('/guests', paged(listGuests))
peopleRoutes.get('/guests/:id', async (c) => c.json(await getGuest(c.req.param('id'))))

// Audited before the value leaves: the row is committed, then the plaintext is read.
peopleRoutes.post('/guests/:id/reveal', WRITE, body(z.object({ field: z.enum(['email', 'phone']), reason: z.string().max(500) })), async (c) => {
  const id = c.req.param('id')
  const { field, reason } = c.get('body')
  await adminRecord(c, { action: 'guest.reveal', targetType: 'guest', targetId: id, reason, needsReason: true, changes: { field } })
  return c.json(await revealGuest(id, field))
})

peopleRoutes.post('/credentials/:id/revoke', WRITE, body(reasoned), async (c) => {
  const id = c.req.param('id')
  return c.json(
    await adminWrite(c, { action: 'guest.revoke_passkey', targetType: 'guest', reason: c.get('body').reason, needsReason: true }, (tx) =>
      revokeCredential(tx, id),
    ),
  )
})

peopleRoutes.post('/guests/:id/status', WRITE, body(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().max(500) })), async (c) => {
  const id = c.req.param('id')
  const { status, reason } = c.get('body')
  return c.json(
    await adminWrite(c, { action: 'guest.status', targetType: 'guest', targetId: id, reason, needsReason: true }, (tx) => setGuestStatus(tx, id, status)),
  )
})

peopleRoutes.post('/guests/:id/erase', OWNER, body(z.object({ confirm: z.string(), reason: z.string().max(500) })), async (c) => {
  const id = c.req.param('id')
  const { confirm, reason } = c.get('body')
  return c.json(
    await adminWrite(c, { action: 'guest.erase', targetType: 'guest', targetId: id, reason, needsReason: true }, (tx) => eraseGuest(tx, id, confirm)),
  )
})

/* ------------------------------------------------------------------ */
/* Entries and sessions                                                */
/* ------------------------------------------------------------------ */

peopleRoutes.get('/entries', paged(listEntries))
peopleRoutes.get('/entries/:id', async (c) => c.json(await getEntry(c.req.param('id'))))
peopleRoutes.get('/sessions', paged(listSessions))
peopleRoutes.get('/sessions/:id', async (c) => c.json(await getSession(c.req.param('id'))))

peopleRoutes.post('/sessions/:id/end', WRITE, body(z.object({ status: z.enum(['expired', 'revoked']), reason: z.string().max(500) })), async (c) => {
  const id = c.req.param('id')
  const { status, reason } = c.get('body')
  return c.json(
    await adminWrite(c, { action: `session.${status === 'expired' ? 'expire' : 'revoke'}`, targetType: 'session', targetId: id, reason, needsReason: true }, (tx) =>
      endSession(tx, id, status),
    ),
  )
})
