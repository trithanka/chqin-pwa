import { eq, sql } from 'drizzle-orm'
import { transaction } from '../../shared/db/client.js'
import { entrySessions, guests, outbox } from '../../shared/db/schema.js'
import { ApiError, conflict, notFound } from '../../shared/lib/errors.js'
import { encrypt } from '../../shared/lib/crypto.js'
import { config } from '../../config.js'
import { enqueue } from '../../shared/outbox/outbox.js'
import { loadAny, touch } from '../entry/index.js'
import { serviceRequest, welcome } from './hotelNotify.js'
import { GUEST_SERVICES } from '@chqin/shared'

/**
 * What a checked-in hotel guest can ask for over WhatsApp, from their stay
 * screen. The session id is the capability, as everywhere on the guest side,
 * and only a finished hotel check-in qualifies. Nothing is offered unless this
 * server actually sends WhatsApp: a request written to an outbox nobody drains
 * would look sent and go nowhere.
 */

const MAX_REQUESTS = 10

async function stayOf(tx, sessionId) {
  const session = await loadAny(sessionId)
  if (!session || session.flowKey !== 'hotel' || session.status !== 'done' || !session.guestId) {
    throw notFound('That stay was not found.')
  }
  if (config.OUTBOX_SENDER !== 'kapso') {
    throw conflict('whatsapp_off', 'WhatsApp is not switched on for this property.')
  }
  const [guest] = await tx
    .select({ name: guests.displayName })
    .from(guests)
    .where(eq(guests.id, session.guestId))
  return { session, guest: guest?.name }
}

const sentFor = (tx, sessionId, kind) =>
  tx
    .select({ n: sql`count(*)::int` })
    .from(outbox)
    .where(sql`${outbox.kind} = ${kind} AND ${outbox.payload}->>'sessionId' = ${sessionId}`)
    .then(([r]) => r.n)

/** The guest gives their number for their stay details, and gets them now. */
export function optIn(sessionId, phone) {
  return transaction(async (tx) => {
    const { session, guest } = await stayOf(tx, sessionId)

    // Remembered for this stay only, encrypted: it is how the desk's room
    // assignment reaches the guest later, and it is not kept on the guest.
    await tx
      .update(entrySessions)
      .set({
        state: sql`${entrySessions.state} || ${JSON.stringify({ stayPhone: encrypt(phone).toString('base64') })}::jsonb`,
        ...touch(),
      })
      .where(eq(entrySessions.id, sessionId))

    if (await sentFor(tx, sessionId, 'hotel.welcome')) return { ok: true, already: true }

    await enqueue(tx, [
      welcome(session.venueId, phone, {
        guest,
        hotel: session.venueName,
        essentials: session.venueSettings?.essentials,
        sessionId,
      }),
    ])
    return { ok: true }
  })
}

/** A request to the team that handles one service. */
export function request(sessionId, service, note) {
  return transaction(async (tx) => {
    const { session, guest } = await stayOf(tx, sessionId)

    const settings = session.venueSettings ?? {}
    const contact = settings.contacts?.[service]
    if (!GUEST_SERVICES.includes(service) || !settings.services?.includes(service) || !contact) {
      throw notFound('That service is not available here.')
    }
    if ((await sentFor(tx, sessionId, 'service.request')) >= MAX_REQUESTS) {
      throw new ApiError('too_many', 'That is a lot of requests. Please ask at the desk.', 429)
    }

    await enqueue(tx, [
      serviceRequest(session.venueId, contact, {
        service,
        guest,
        room: session.roomNumber,
        note,
        sessionId,
      }),
    ])
    return { ok: true }
  })
}
