import { Hono } from 'hono'
import { detectRequest } from '@chqin/shared'
import { body } from '../lib/validate.js'
import { decideJourney, recordJourney } from '../services/detection.js'
import { requireOpen } from '../services/sessions.js'

export const detect = new Hono()

detect.post('/', body(detectRequest), async (c) => {
  const { sessionId, knownCredentialIds } = c.get('body')
  const session = await requireOpen(sessionId)

  const decision = await decideJourney(session, knownCredentialIds)
  await recordJourney(session.id, decision.journey)

  return c.json(decision)
})
