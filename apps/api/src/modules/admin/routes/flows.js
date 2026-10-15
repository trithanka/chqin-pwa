import { Hono } from 'hono'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { db } from '../../../shared/db/client.js'
import { body } from '../../../shared/lib/validate.js'
import { adminWrite } from '../services/audit.js'
import { check, getFlow, listFlows, publish, simulate, stepLibrary } from '../services/flows.js'
import { OWNER } from './guard.js'

/** Flows: read by anyone signed in, published only by an owner. */
export const flowRoutes = new Hono()

const steps = z.array(z.record(z.string(), z.unknown())).max(50)

flowRoutes.get('/flows', async (c) => c.json({ flows: await listFlows() }))
flowRoutes.get('/flows/:id', async (c) => c.json(await getFlow(c.req.param('id'))))
flowRoutes.get('/steps', (c) => c.json({ steps: stepLibrary() }))

// Validation is a read: the editor calls it on every keystroke.
flowRoutes.post('/flows/validate', body(z.object({ steps: z.unknown() })), (c) => c.json(check(c.get('body').steps)))

flowRoutes.post(
  '/flows',
  OWNER,
  body(
    z.object({
      key: z.string().regex(/^[a-z][a-z0-9_.-]{1,60}$/, 'lower-case letters, digits, dot, dash or underscore'),
      steps,
      reason: z.string().max(500),
    }),
  ),
  async (c) => {
    const { key, steps: list, reason } = c.get('body')
    return c.json(
      await adminWrite(c, { action: 'flow.publish', targetType: 'flow', reason, needsReason: true }, (tx) =>
        publish(tx, { key, steps: list }),
      ),
    )
  },
)

flowRoutes.post(
  '/flows/simulate',
  body(
    z.object({
      steps,
      state: z.record(z.string(), z.unknown()).default({}),
      guest: z.boolean().default(true),
      booking: z.boolean().default(false),
      inputs: z.array(z.record(z.string(), z.unknown())).max(20).default([]),
      // A real venue's hosts and events as the choices, instead of samples. Read only.
      venueId: z.uuid().optional(),
    }),
  ),
  async (c) => {
    const { venueId, ...input } = c.get('body')
    const options = {}
    if (venueId) {
      const rows = async (query) => (await db.execute(query)).rows
      options.hosts = await rows(sql`SELECT id AS value, name AS label FROM visit_hosts WHERE venue_id = ${venueId} AND active ORDER BY name`)
      options.events = await rows(sql`SELECT id AS value, name AS label FROM event_events WHERE venue_id = ${venueId} AND active ORDER BY name`)
    }
    return c.json(await simulate({ ...input, options }))
  },
)
