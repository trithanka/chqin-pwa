import { Hono } from 'hono'
import {
  authenticationOptionsRequest,
  authenticationVerifyRequest,
  registrationOptionsRequest,
  registrationVerifyRequest,
} from '@chqin/shared'
import { body } from '../lib/validate.js'
import { logEvent } from '../services/audit.js'
import { requireOpen } from '../services/sessions.js'
import {
  finishAuthentication,
  finishRegistration,
  startAuthentication,
  startRegistration,
} from '../services/passkeys.js'

export const webauthn = new Hono()

/**
 * Routes stay thin on purpose: load the session, call the service, log the
 * outcome. The rules live in services/passkeys.js where they can be read in
 * one piece.
 */

webauthn.post('/registration/options', body(registrationOptionsRequest), async (c) => {
  const session = await requireOpen(c.get('body').sessionId)
  return c.json(await startRegistration(session))
})

webauthn.post('/registration/verify', body(registrationVerifyRequest), async (c) => {
  const data = c.get('body')
  const session = await requireOpen(data.sessionId)

  try {
    const result = await finishRegistration(session, data)
    await logEvent(c, {
      guestId: result.guestId,
      credentialId: result.credentialId,
      hotelId: session.hotelId,
      sessionId: session.id,
      event: 'register',
      outcome: 'ok',
    })
    return c.json(result)
  } catch (err) {
    await logEvent(c, {
      hotelId: session.hotelId,
      sessionId: session.id,
      event: 'register',
      outcome: 'failed',
      detail: { reason: err.message },
    })
    throw err
  }
})

webauthn.post('/authentication/options', body(authenticationOptionsRequest), async (c) => {
  const session = await requireOpen(c.get('body').sessionId)
  return c.json(await startAuthentication(session))
})

webauthn.post('/authentication/verify', body(authenticationVerifyRequest), async (c) => {
  const data = c.get('body')
  const session = await requireOpen(data.sessionId)

  try {
    const result = await finishAuthentication(session, data)
    await logEvent(c, {
      guestId: result.guestId,
      credentialId: result.credentialId,
      hotelId: session.hotelId,
      sessionId: session.id,
      event: 'assert',
      outcome: 'ok',
    })
    return c.json({ guestId: result.guestId, greetingName: result.greetingName })
  } catch (err) {
    await logEvent(c, {
      credentialId: data.credential.id,
      hotelId: session.hotelId,
      sessionId: session.id,
      event: 'assert',
      outcome: 'failed',
      detail: { reason: err.message },
    })
    throw err
  }
})
