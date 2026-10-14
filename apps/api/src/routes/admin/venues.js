import { Hono } from 'hono'
import { z } from 'zod'
import { VENUE_KINDS, phoneSchema } from '@chqin/shared'
import { body } from '../../lib/validate.js'
import { adminWrite } from '../../services/admin/audit.js'
import { pageOf, pageParams } from '../../services/admin/util.js'
import {
  createGate,
  createVenue,
  deleteVenue,
  flowChoices,
  getGate,
  getVenue,
  listGates,
  listVenues,
  rotateGate,
  sendOwnerInvite,
  setGateStatus,
  setVenueStatus,
  updateGate,
  updateSettings,
  updateVenue,
} from '../../services/admin/venues.js'
import { addEvent, addHost, setEventActive, updateHost } from '../../services/visits.js'
import { OWNER, WRITE } from './guard.js'

/**
 * Venues, gates, and a visitor venue's hosts and events. Mounted below the
 * second-factor check in routes/admin/index.js; every write is a WRITE or
 * OWNER route and goes through adminWrite.
 */
export const venueRoutes = new Hono()

const reason = z.string().max(500).optional()
const GATE_KINDS = ['qr', 'desk', 'turnstile', 'kiosk']
const IDENTITY = ['basic', 'aadhaar']

const createRequest = z.object({
  name: z.string().min(1).max(160),
  kind: z.enum(VENUE_KINDS),
  city: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
  country: z.string().max(2).optional(),
  timezone: z.string().max(64).default('Asia/Kolkata'),
  flowKey: z.string().max(80).optional(),
  owner: z.object({ name: z.string().min(1).max(120), email: z.email() }),
  hosts: z.array(z.object({ name: z.string().min(1).max(120), phone: phoneSchema.optional() })).max(50).optional(),
  business: z
    .object({
      legalName: z.string().max(160).optional(),
      tradeName: z.string().max(160).optional(),
      gstin: z.string().max(20).optional(),
      pan: z.string().max(10).optional(),
    })
    .optional(),
  reason,
})

const profileRequest = z.object({
  name: z.string().min(1).max(160).optional(),
  kind: z.enum(VENUE_KINDS).optional(),
  location: z.string().max(160).nullable().optional(),
  timezone: z.string().max(64).optional(),
  address: z.record(z.string(), z.unknown()).optional(),
  retentionDays: z.number().int().min(1).max(3650).nullable().optional(),
  reason,
})

// The settings blob as onboarding writes it. Edited whole, as JSON: the
// panel shows exactly what is stored, and what is stored is what it saves.
const settingsRequest = z.object({
  settings: z
    .object({
      business: z.record(z.string(), z.unknown()).optional(),
      services: z.array(z.string().max(40)).max(20).optional(),
      essentials: z.record(z.string(), z.unknown()).optional(),
      contacts: z.record(z.string(), z.unknown()).optional(),
    })
    // Other keys (reception, and whatever onboarding adds next) pass through as stored.
    .catchall(z.unknown()),
  reason,
})

const without = ({ reason: _, ...rest }) => rest

venueRoutes.get('/venues', async (c) => {
  const { limit, cursor } = pageParams(c.req.query())
  const { q, kind, status } = c.req.query()
  return c.json(pageOf(await listVenues({ q, kind, status, cursor, limit }), limit))
})

venueRoutes.get('/venues/:id', async (c) => c.json(await getVenue(c.req.param('id'))))

venueRoutes.get('/flow-choices', async (c) => c.json({ flows: await flowChoices(), kinds: VENUE_KINDS }))

venueRoutes.post('/venues', WRITE, body(createRequest), async (c) => {
  const input = c.get('body')
  const created = await adminWrite(c, { action: 'venue.create', targetType: 'venue', reason: input.reason }, async (tx) => {
    const result = await createVenue(tx, input)
    return {
      result,
      targetId: result.venueId,
      venueId: result.venueId,
      changes: { created: { name: input.name, kind: input.kind, flowKey: result.flowKey, hosts: input.hosts?.length ?? 0 } },
    }
  })
  sendOwnerInvite(input.owner.email)
  return c.json({ venueId: created.venueId })
})

venueRoutes.post('/venues/:id', WRITE, body(profileRequest), async (c) => {
  const id = c.req.param('id')
  const input = c.get('body')
  return c.json(
    await adminWrite(c, { action: 'venue.update', targetType: 'venue', targetId: id, reason: input.reason }, (tx) =>
      updateVenue(tx, id, without(input)),
    ),
  )
})

venueRoutes.post('/venues/:id/settings', WRITE, body(settingsRequest), async (c) => {
  const id = c.req.param('id')
  const { settings, reason: why } = c.get('body')
  return c.json(
    await adminWrite(c, { action: 'venue.settings', targetType: 'venue', targetId: id, reason: why }, (tx) =>
      updateSettings(tx, id, settings),
    ),
  )
})

venueRoutes.post(
  '/venues/:id/status',
  WRITE,
  body(z.object({ status: z.enum(['active', 'suspended']), reason: z.string().max(500) })),
  async (c) => {
    const id = c.req.param('id')
    const { status, reason: why } = c.get('body')
    return c.json(
      await adminWrite(
        c,
        { action: status === 'active' ? 'venue.unsuspend' : 'venue.suspend', targetType: 'venue', targetId: id, reason: why, needsReason: true },
        (tx) => setVenueStatus(tx, id, status, why),
      ),
    )
  },
)

venueRoutes.post('/venues/:id/delete', OWNER, body(z.object({ confirm: z.string(), reason: z.string().max(500) })), async (c) => {
  const id = c.req.param('id')
  const { confirm, reason: why } = c.get('body')
  return c.json(
    await adminWrite(c, { action: 'venue.delete', targetType: 'venue', targetId: id, reason: why, needsReason: true }, (tx) =>
      deleteVenue(tx, id, confirm),
    ),
  )
})

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

venueRoutes.get('/gates', async (c) => {
  const { limit, cursor } = pageParams(c.req.query())
  const { venueId, status, q } = c.req.query()
  return c.json(pageOf(await listGates({ venueId, status, q, cursor, limit }), limit))
})

venueRoutes.get('/gates/:id', async (c) => c.json(await getGate(c.req.param('id'))))

venueRoutes.post(
  '/venues/:id/gates',
  WRITE,
  body(
    z.object({
      name: z.string().min(1).max(80),
      kind: z.enum(GATE_KINDS),
      flowId: z.uuid(),
      identity: z.enum(IDENTITY).optional(),
      reason,
    }),
  ),
  async (c) => {
    const venueId = c.req.param('id')
    const input = c.get('body')
    return c.json(
      await adminWrite(c, { action: 'gate.create', targetType: 'gate', venueId, reason: input.reason }, (tx) =>
        createGate(tx, venueId, input),
      ),
    )
  },
)

venueRoutes.post(
  '/gates/:id',
  WRITE,
  body(
    z.object({
      name: z.string().min(1).max(80).optional(),
      kind: z.enum(GATE_KINDS).optional(),
      flowId: z.uuid().optional(),
      config: z
        .object({ identity: z.enum(IDENTITY).optional() })
        .catchall(z.unknown())
        .optional(),
      reason: z.string().max(500),
    }),
  ),
  async (c) => {
    const id = c.req.param('id')
    const input = c.get('body')
    // A gate's flow and config are what a guest at it lives through: a reason, always.
    return c.json(
      await adminWrite(c, { action: 'gate.update', targetType: 'gate', targetId: id, reason: input.reason, needsReason: true }, (tx) =>
        updateGate(tx, id, without(input)),
      ),
    )
  },
)

venueRoutes.post(
  '/gates/:id/status',
  WRITE,
  body(z.object({ status: z.enum(['active', 'revoked']), reason: z.string().max(500) })),
  async (c) => {
    const id = c.req.param('id')
    const { status, reason: why } = c.get('body')
    return c.json(
      await adminWrite(
        c,
        { action: status === 'active' ? 'gate.restore' : 'gate.revoke', targetType: 'gate', targetId: id, reason: why, needsReason: true },
        (tx) => setGateStatus(tx, id, status),
      ),
    )
  },
)

venueRoutes.post('/gates/:id/rotate', WRITE, body(z.object({ reason: z.string().max(500) })), async (c) => {
  const id = c.req.param('id')
  return c.json(
    await adminWrite(c, { action: 'gate.rotate', targetType: 'gate', targetId: id, reason: c.get('body').reason, needsReason: true }, (tx) =>
      rotateGate(tx, id),
    ),
  )
})

/* ------------------------------------------------------------------ */
/* Hosts and events, on a venue's behalf                               */
/* ------------------------------------------------------------------ */

const hostWrite = (action, run) => async (c) => {
  const venueId = c.req.param('id')
  const input = c.get('body')
  return c.json(
    await adminWrite(c, { action, targetType: action.split('.')[0], venueId, reason: input.reason }, async (tx) => {
      const row = await run(tx, venueId, without(input), c)
      return { result: row, targetId: row.id, after: without(input) }
    }),
  )
}

venueRoutes.post(
  '/venues/:id/hosts',
  WRITE,
  body(z.object({ name: z.string().min(1).max(120), phone: phoneSchema.nullable().optional(), reason })),
  hostWrite('host.create', (tx, venueId, input) => addHost(venueId, input, tx)),
)

venueRoutes.post(
  '/venues/:id/hosts/:hid',
  WRITE,
  body(
    z.object({
      name: z.string().min(1).max(120).optional(),
      phone: phoneSchema.nullable().optional(),
      active: z.boolean().optional(),
      reason,
    }),
  ),
  hostWrite('host.update', (tx, venueId, input, c) => updateHost(venueId, c.req.param('hid'), input, tx)),
)

venueRoutes.post(
  '/venues/:id/events',
  WRITE,
  body(z.object({ name: z.string().min(1).max(160), organizerId: z.uuid().nullable().optional(), reason })),
  hostWrite('event.create', (tx, venueId, input) => addEvent(venueId, input, tx)),
)

venueRoutes.post(
  '/venues/:id/events/:eid/active',
  WRITE,
  body(z.object({ active: z.boolean(), reason })),
  hostWrite('event.active', (tx, venueId, input, c) => setEventActive(venueId, c.req.param('eid'), input.active, tx)),
)
