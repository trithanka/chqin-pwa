import { Hono } from 'hono'
import { checkinRequest } from '@chqin/shared'
import { conflict, notFound } from '../lib/errors.js'
import { body } from '../lib/validate.js'
import { logEvent } from '../services/audit.js'
import { checkIn, findByIdempotencyKey } from '../services/checkins.js'
import { loadAny, loadOpen } from '../services/sessions.js'

export const checkin = new Hono()

checkin.post('/', body(checkinRequest), async (c) => {
  const { sessionId, idempotencyKey } = c.get('body')

  const open = await loadOpen(sessionId)
  const session = open ?? (await loadAny(sessionId))
  if (!session) throw notFound()

  // A retry after a dropped response must not 404 on the session its own first
  // attempt consumed — the idempotency key is the whole point.
  if (!open) {
    const existing = await findByIdempotencyKey(session.bookingId, idempotencyKey)
    if (!existing) throw conflict('session_used', 'This check-in session is closed.')

    return c.json({
      checkinId: existing.id,
      journey: existing.journey,
      hotelName: session.hotelName,
      roomNumber: existing.roomNumber ?? session.roomNumber,
      checkedInAt: existing.checkedInAt.toISOString(),
    })
  }

  const result = await checkIn(session, idempotencyKey)

  await logEvent(c, {
    guestId: session.guestId,
    hotelId: session.hotelId,
    sessionId: session.id,
    event: 'checkin',
    outcome: 'ok',
  })

  return c.json(result)
})
