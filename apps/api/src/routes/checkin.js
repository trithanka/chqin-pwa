import { Hono } from 'hono'
import { checkinRequest } from '@chqin/shared'
import { conflict, notFound } from '../lib/errors.js'
import { body } from '../lib/validate.js'
import { logEvent } from '../services/audit.js'
import { checkIn, findByIdempotencyKey } from '../services/checkins.js'
import { loadAny, loadOpen } from '../services/sessions.js'
import { stayFrom } from '../services/stay.js'

export const checkin = new Hono()

checkin.post('/', body(checkinRequest), async (c) => {
  const { sessionId, idempotencyKey, stay, noPasskeyReason } = c.get('body')

  const open = await loadOpen(sessionId)
  const session = open ?? (await loadAny(sessionId))
  if (!session) throw notFound()

  // A retry after a dropped response must not 404 on the session its own first
  // attempt consumed — the idempotency key is the whole point.
  if (!open) {
    const existing = await findByIdempotencyKey(idempotencyKey)
    if (!existing) throw conflict('session_used', 'This check-in session is closed.')

    return c.json({
      checkinId: existing.id,
      journey: existing.journey,
      venueName: session.venueName,
      roomNumber: existing.roomNumber ?? session.roomNumber,
      checkedInAt: existing.checkedInAt.toISOString(),
      // A retry has to answer with everything the first attempt would have,
      // or the guest whose response was dropped lands on an empty stay screen.
      stay: stayFrom(session.venueSettings),
    })
  }

  const result = await checkIn(session, idempotencyKey, stay)

  await logEvent(c, {
    guestId: session.guestId,
    venueId: session.venueId,
    sessionId: session.id,
    event: 'checkin',
    outcome: 'ok',
    // The reason a guest finished without enrolling — a WebAuthn error name,
    // or that the device reported no authenticator at all. This is the only
    // place that number can be counted; the guest's phone keeps no log.
    detail: noPasskeyReason ? { noPasskeyReason } : {},
  })

  return c.json(result)
})
