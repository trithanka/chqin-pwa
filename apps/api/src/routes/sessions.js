import { Hono } from 'hono'
import { resolveSessionRequest } from '@chqin/shared'
import { body } from '../lib/validate.js'
import { resolveToken, toPayload } from '../services/sessions.js'

export const sessions = new Hono()

sessions.post('/resolve', body(resolveSessionRequest), async (c) => {
  const session = await resolveToken(c.get('body').token)
  return c.json(toPayload(session))
})
