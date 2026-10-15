import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, transaction } from '../../shared/db/client.js'
import {
  credentials,
  entitlements,
  entries,
  entrySessions,
  guests,
  hotelBookings,
  hotelEntryDetails,
  hotelRooms,
} from '../../shared/db/schema.js'
import { conflict, unauthorized } from '../../shared/lib/errors.js'
import { advance } from '../entry/index.js'
import { loadFlow } from '../entry/index.js'
import { touch } from '../entry/index.js'
import { receptionAlert } from './hotelNotify.js'
import { enqueue } from '../../shared/outbox/outbox.js'
import { stayFrom } from './stay.js'

/**
 * The check-in itself. Everything before this exists to establish who the
 * guest is; this is where the entry engine walks the session to its end and
 * writes the record a hotel is audited on.
 */

/** The original result of a completed check-in, for a retry to receive. */
export async function findByIdempotencyKey(key) {
  if (!key) return null
  const [row] = await db
    .select({
      id: entries.id,
      journey: hotelEntryDetails.journey,
      checkedInAt: entries.enteredAt,
      roomNumber: hotelRooms.number,
    })
    .from(entries)
    .leftJoin(hotelEntryDetails, eq(hotelEntryDetails.entryId, entries.id))
    .leftJoin(hotelRooms, eq(hotelRooms.id, hotelEntryDetails.roomId))
    .where(eq(entries.idempotencyKey, key))
    .limit(1)

  return row ?? null
}

export async function checkIn(session, idempotencyKey, stay) {
  const flow = await loadFlow(session.flowId)
  // What the server decided at detection, not what the rows look like now:
  // enrolment sets the booking's guest, so a first-time guest would otherwise
  // finish as 'returning'.
  const journey = session.journey ?? 'returning'

  const result = await transaction(async (tx) => {
    // Locked and re-read: the session the route loaded may be a moment old, and
    // two taps must not both walk it to the end.
    const [fresh] = await tx
      .select()
      .from(entrySessions)
      .where(eq(entrySessions.id, session.id))
      .for('update')
    if (!fresh || !['in_progress', 'waiting'].includes(fresh.status) || fresh.expiresAt < new Date()) {
      throw conflict('session_used', 'This check-in session is closed.')
    }

    const admit = async (s) => {
      const [credential] = fresh.guestId
        ? await tx
            .select({ id: credentials.id })
            .from(credentials)
            .where(and(eq(credentials.guestId, fresh.guestId), isNull(credentials.revokedAt)))
            .orderBy(sql`${credentials.lastUsedAt} DESC NULLS LAST`)
            .limit(1)
        : []

      // ON CONFLICT covers the race where two requests both see an open session.
      const [row] = await tx
        .insert(entries)
        .values({
          venueId: s.venueId,
          gateId: s.gateId,
          entitlementId: s.entitlementId,
          guestId: s.guestId,
          sessionId: s.id,
          credentialId: credential?.id ?? null,
          idempotencyKey,
          data: { trail: s.trail },
        })
        .onConflictDoUpdate({
          target: entries.idempotencyKey,
          targetWhere: sql`idempotency_key IS NOT NULL`,
          set: { outcome: sql`${entries.outcome}` },
        })
        .returning({ id: entries.id, enteredAt: entries.enteredAt })

      await tx
        .insert(hotelEntryDetails)
        .values({
          entryId: row.id,
          journey,
          // What the guest said. Null for a guest who was never asked — anyone
          // arriving on a reservation, which already carries these answers.
          nights: stay?.nights ?? null,
          partySize: stay?.partySize ?? null,
          roomsCount: stay?.roomsCount ?? null,
        })
        .onConflictDoNothing()

      // Only when there is one — a walk-in has no reservation to move on.
      if (s.entitlementId) {
        await tx
          .update(entitlements)
          .set({ status: 'used', guestId: sql`COALESCE(${entitlements.guestId}, ${s.guestId})` })
          .where(eq(entitlements.id, s.entitlementId))
        await tx
          .update(hotelBookings)
          .set({ status: 'checked_in' })
          .where(eq(hotelBookings.entitlementId, s.entitlementId))
      }

      return row
    }

    const out = await advance({
      flow,
      session: {
        id: fresh.id,
        venueId: fresh.venueId,
        gateId: fresh.gateId,
        status: fresh.status,
        cursor: fresh.cursor,
        state: fresh.state,
        trail: fresh.trail,
        guestId: fresh.guestId,
        entitlementId: fresh.entitlementId,
        expiresAt: fresh.expiresAt,
      },
      deps: { admit },
    })

    if (out.status === 'waiting' && out.waitingFor === 'identity') {
      // Identity, not the passkey: a verified guest can check in from a phone
      // that could never enrol one.
      throw unauthorized('not_authenticated', 'Complete the identity check first.')
    }
    if (out.status !== 'done') {
      throw conflict('not_admitted', 'This check-in could not be completed.')
    }

    // One save for the whole walk. Under the lock the version cannot have
    // moved, but the condition is what makes this safe to move off the lock.
    const saved = await tx
      .update(entrySessions)
      .set({
        status: 'done',
        cursor: out.cursor,
        state: out.state,
        trail: out.trail,
        ...touch(),
      })
      .where(and(eq(entrySessions.id, fresh.id), eq(entrySessions.version, fresh.version)))
      .returning({ id: entrySessions.id })
    if (!saved.length) throw conflict('session_changed', 'Try that again.')

    // The front desk hears about it in the same transaction that admitted the
    // guest, so a check-in that rolls back tells nobody.
    const reception = session.venueSettings?.reception
    if (reception) {
      const [guest] = await tx.select({ name: guests.displayName }).from(guests).where(eq(guests.id, fresh.guestId))
      await enqueue(tx, [
        receptionAlert(fresh.venueId, reception, {
          guest: guest?.name,
          hotel: session.venueName,
          room: session.roomNumber,
          sessionId: fresh.id,
        }),
      ])
    }

    const [row] = await tx
      .select({ id: entries.id, enteredAt: entries.enteredAt })
      .from(entries)
      .where(eq(entries.id, out.state.entryId))
    return row
  })

  return {
    checkinId: result.id,
    journey,
    venueName: session.venueName,
    roomNumber: session.roomNumber,
    checkedInAt: result.enteredAt.toISOString(),
    // What the hotel offers. Sent with the check-in rather than fetched after
    // it: the screen that shows it is the next thing the guest sees, and a
    // second round trip in a lobby is a spinner nobody needed.
    stay: stayFrom(session.venueSettings),
  }
}

/** Today's arrivals — the dashboard's first real screen. */
export const recentCheckins = (venueId, limit = 50) =>
  db
    .select()
    .from(entries)
    .where(eq(entries.venueId, venueId))
    .orderBy(desc(entries.enteredAt))
    .limit(limit)
