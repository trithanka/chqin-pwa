import { Hono } from 'hono'
import { z } from 'zod'
import { phoneSchema } from '@chqin/shared'
import { body } from '../../../shared/lib/validate.js'
import { optIn, request } from '../stayMessages.js'

/** What a guest can ask for after checking in. Only works where WhatsApp is on. */
export const stay = new Hono()

stay.post('/whatsapp', body(z.object({ sessionId: z.uuid(), phone: phoneSchema })), async (c) => {
  const { sessionId, phone } = c.get('body')
  return c.json(await optIn(sessionId, phone))
})

stay.post(
  '/request',
  body(z.object({ sessionId: z.uuid(), service: z.string().max(40), note: z.string().max(140).optional() })),
  async (c) => {
    const { sessionId, service, note } = c.get('body')
    return c.json(await request(sessionId, service, note))
  },
)
