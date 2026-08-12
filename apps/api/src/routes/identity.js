import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/client.js'
import { identityVerifications } from '../db/schema/index.js'
import { body } from '../lib/validate.js'
import { logEvent } from '../services/audit.js'
import { requireOpen } from '../services/sessions.js'

export const identity = new Hono()

const request = z.object({ sessionId: z.uuid() })

/**
 * Records that the one-time check happened.
 *
 * This is an authorization gate, not a flow step: it is the only thing between
 * a scanned QR and enrolling a passkey against that reservation. Wiring a KYC
 * provider replaces the body of this route, not its contract — and until that
 * happens, anyone who can call it can pass it.
 */
identity.post('/verifications', body(request), async (c) => {
  const session = await requireOpen(c.get('body').sessionId)

  const [verification] = await db
    .insert(identityVerifications)
    .values({
      guestId: session.bookingGuestId ?? null,
      sessionId: session.id,
      method: 'simulated',
      result: 'passed',
      verifiedAt: new Date(),
    })
    .returning({ id: identityVerifications.id })

  await logEvent(c, {
    hotelId: session.hotelId,
    sessionId: session.id,
    event: 'identity_verified',
    outcome: 'ok',
    detail: { method: 'simulated' },
  })

  return c.json({ verificationId: verification.id })
})
