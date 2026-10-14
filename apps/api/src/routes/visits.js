import { Hono } from 'hono'
import { z } from 'zod'
import { body } from '../lib/validate.js'
import { submit } from '../services/progress.js'

/**
 * The guest's side of any flow that is not a hotel check-in. One endpoint: post
 * what you have (or nothing, to poll) and be told where you are. The session id
 * is the capability, the same as every other guest route.
 */
export const visits = new Hono()

const stepRequest = z.object({
  sessionId: z.uuid(),
  // Only answers to the current step's own fields are ever read.
  values: z.record(z.string().max(40), z.string().max(200)).optional(),
})

visits.post('/step', body(stepRequest), async (c) => {
  const { sessionId, values } = c.get('body')
  return c.json(await submit(sessionId, values))
})
