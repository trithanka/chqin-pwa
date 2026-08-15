import { Hono } from 'hono'
import { z } from 'zod'
import { resolveSessionRequest } from '@chqin/shared'
import { body } from '../lib/validate.js'
import { attachBookingByLookup, requireOpen, resolveToken, toPayload } from '../services/sessions.js'

export const sessions = new Hono()

const lookupRequest = z.object({
  sessionId: z.uuid(),
  lookup: z.string().min(2).max(80),
})

sessions.post('/resolve', body(resolveSessionRequest), async (c) => {
  const session = await resolveToken(c.get('body').token)
  return c.json(toPayload(session))
})

/** For desk QRs: the guest says which reservation is theirs. */
sessions.post('/booking', body(lookupRequest), async (c) => {
  const { sessionId, lookup } = c.get('body')
  const session = await requireOpen(sessionId)
  const booking = await attachBookingByLookup(session, lookup)
  return c.json({ booking })
})
