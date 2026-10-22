import { Hono } from 'hono'
import { z } from 'zod'
import { identityFormSchema } from '@chqin/shared'
import { phoneSchema } from '@chqin/shared'
import { body } from '../../../shared/lib/validate.js'
import { respond } from '../progress.js'
import {
  addEvent,
  addHost,
  arrivals,
  getEntrySettings,
  saveEntrySettings,
  listEvents,
  listHosts,
  listWaiting,
  setEventActive,
  updateHost,
} from '../visits.js'

/** The staff API for a venue that hosts visitors: who is waiting, hosts, events, and how visitors are identified. Mounted after the session guard in venueStaff.js, so every route here is private. */
export const visitorStaff = new Hono()

const venueOf = (c) => c.get('session').venueId

/* Visitors — venues that host visitors and events                     */
const hostRequest = z.object({
  name: z.string().min(1).max(120),
  phone: phoneSchema.nullable().optional(),
})

const hostPatch = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: phoneSchema.nullable().optional(),
  active: z.boolean().optional(),
})

const eventRequest = z.object({
  name: z.string().min(1).max(160),
  organizerId: z.uuid().nullable().optional(),
})

const decisionRequest = z.object({ decision: z.enum(['confirm', 'hold', 'decline']) })

visitorStaff.get('/visits/waiting', async (c) => c.json({ waiting: await listWaiting(venueOf(c)) }))

visitorStaff.get('/visits/arrivals', async (c) => c.json(await arrivals(venueOf(c))))

visitorStaff.post('/visits/:id/decision', body(decisionRequest), async (c) =>
  c.json(await respond(venueOf(c), c.get('session').staffId, c.req.param('id'), c.get('body').decision)),
)

visitorStaff.get('/hosts', async (c) => c.json({ hosts: await listHosts(venueOf(c)) }))

visitorStaff.post('/hosts', body(hostRequest), async (c) =>
  c.json(await addHost(venueOf(c), c.get('body'))),
)

visitorStaff.post('/hosts/:id', body(hostPatch), async (c) =>
  c.json(await updateHost(venueOf(c), c.req.param('id'), c.get('body'))),
)

visitorStaff.get('/events', async (c) => c.json({ events: await listEvents(venueOf(c)) }))

visitorStaff.post('/events', body(eventRequest), async (c) =>
  c.json(await addEvent(venueOf(c), c.get('body'))),
)

visitorStaff.post('/events/:id/active', body(z.object({ active: z.boolean() })), async (c) =>
  c.json(await setEventActive(venueOf(c), c.req.param('id'), c.get('body').active)),
)

visitorStaff.get('/entry-settings', async (c) => c.json(await getEntrySettings(venueOf(c))))

visitorStaff.post(
  '/entry-settings',
  body(z.object({ identity: z.enum(['basic', 'aadhaar']).optional(), identityForm: identityFormSchema.optional() })),
  async (c) =>
  c.json(await saveEntrySettings(venueOf(c), c.get('body'))),
)
