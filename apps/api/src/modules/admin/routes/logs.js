import { Hono } from 'hono'
import { z } from 'zod'
import { body } from '../../../shared/lib/validate.js'
import { adminRecord, adminWrite } from '../services/audit.js'
import { invite } from '../services/auth.js'
import {
  adminSessionsOf,
  auditActions,
  auditCsv,
  authEventNames,
  cancelMessage,
  listAdmins,
  listAudit,
  listAuthEvents,
  listOutbox,
  outboxInfo,
  reset2fa,
  retryMessage,
  revokeAdminSession,
  updateAdmin,
} from '../services/logs.js'
import { pageOf, pageParams } from '../services/util.js'
import { OWNER, WRITE } from './guard.js'

/** Outbox, auth events, the admin audit log, and admin accounts. */
export const logRoutes = new Hono()

const paged = (list) => async (c) => {
  const { limit, cursor } = pageParams(c.req.query())
  return c.json(pageOf(await list({ ...c.req.query(), cursor, limit }), limit))
}
const reasoned = z.object({ reason: z.string().max(500) })

/* Outbox ------------------------------------------------------------ */

logRoutes.get('/outbox', paged(listOutbox))
logRoutes.get('/outbox-info', async (c) => c.json(await outboxInfo()))

for (const [verb, run] of [
  ['retry', retryMessage],
  ['cancel', cancelMessage],
]) {
  logRoutes.post(`/outbox/:id/${verb}`, WRITE, body(reasoned), async (c) => {
    const id = c.req.param('id')
    return c.json(
      await adminWrite(c, { action: `outbox.${verb}`, targetType: 'outbox', targetId: id, reason: c.get('body').reason, needsReason: true }, (tx) =>
        run(tx, id),
      ),
    )
  })
}

/* Logs -------------------------------------------------------------- */

logRoutes.get('/auth-events', paged(listAuthEvents))
logRoutes.get('/auth-event-names', async (c) => c.json({ events: await authEventNames() }))
logRoutes.get('/audit', paged(listAudit))
logRoutes.get('/audit-actions', async (c) => c.json({ actions: await auditActions() }))

// An export is itself audited: what was taken out is as much a question as what was changed.
logRoutes.get('/audit.csv', OWNER, async (c) => {
  const filters = c.req.query()
  const { csv, count } = await auditCsv(filters)
  await adminRecord(c, { action: 'audit.export', targetType: 'audit', changes: { rows: count, filters } })
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="chqin-admin-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
  })
})

/* Admin accounts ---------------------------------------------------- */

logRoutes.get('/admins', OWNER, async (c) => c.json({ admins: await listAdmins() }))
logRoutes.get('/admins/:id/sessions', OWNER, async (c) => c.json({ sessions: await adminSessionsOf(c.req.param('id')) }))

const ROLES = ['owner', 'support', 'read_only']

logRoutes.post(
  '/admins',
  OWNER,
  body(z.object({ email: z.email(), name: z.string().min(1).max(120), role: z.enum(ROLES), reason: z.string().max(500).optional() })),
  async (c) => {
    const { reason, ...input } = c.get('body')
    // The link is returned once, to the inviting owner, to pass on. It is never logged.
    return c.json(
      await adminWrite(c, { action: 'admin.invite', targetType: 'admin', reason }, async (tx) => {
        const made = await invite(tx, input)
        return { result: made, targetId: made.id, changes: { invited: { name: input.name, role: input.role } } }
      }),
    )
  },
)

logRoutes.post(
  '/admins/:id',
  OWNER,
  body(z.object({ role: z.enum(ROLES).optional(), status: z.enum(['active', 'disabled']).optional(), reason: z.string().max(500) })),
  async (c) => {
    const id = c.req.param('id')
    const { reason, ...patch } = c.get('body')
    return c.json(
      await adminWrite(c, { action: 'admin.update', targetType: 'admin', targetId: id, reason, needsReason: true }, (tx) =>
        updateAdmin(tx, id, patch, c.get('admin').adminId),
      ),
    )
  },
)

logRoutes.post('/admins/:id/reset-2fa', OWNER, body(reasoned), async (c) => {
  const id = c.req.param('id')
  return c.json(
    await adminWrite(c, { action: 'admin.reset_2fa', targetType: 'admin', targetId: id, reason: c.get('body').reason, needsReason: true }, (tx) =>
      reset2fa(tx, id),
    ),
  )
})

logRoutes.post('/admin-sessions/:id/revoke', OWNER, body(reasoned), async (c) =>
  c.json(
    await adminWrite(c, { action: 'admin.revoke_session', targetType: 'admin', reason: c.get('body').reason, needsReason: true }, (tx) =>
      revokeAdminSession(tx, c.req.param('id')),
    ),
  ),
)
