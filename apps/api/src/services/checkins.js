import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, transaction } from '../db/client.js'
import { bookings, checkinSessions, checkins, credentials, rooms } from '../db/schema/index.js'
import { conflict, unauthorized } from '../lib/errors.js'

/**
 * The check-in itself. Everything before this exists to establish who the
 * guest is; this is the only place that writes the record a hotel is audited
 * on.
 */

/** The original result of a completed check-in, for a retry to receive. */
export async function findByIdempotencyKey(bookingId, key) {
  if (!bookingId || !key) return null
  const [row] = await db
    .select({
      id: checkins.id,
      journey: checkins.journey,
      checkedInAt: checkins.checkedInAt,
      roomNumber: rooms.number,
    })
    .from(checkins)
    .leftJoin(rooms, eq(rooms.id, checkins.roomId))
    .where(and(eq(checkins.bookingId, bookingId), eq(checkins.idempotencyKey, key)))
    .limit(1)

  return row ?? null
}

export async function checkIn(session, idempotencyKey) {
  if (!session.guestId) {
    throw unauthorized('not_authenticated', 'Verify with your passkey first.')
  }
  if (!session.bookingId) {
    throw conflict('no_booking', 'No reservation is attached to this session.')
  }

  // What the server decided at detection, not what the rows look like now:
  // enrolment sets bookings.guestId, so a first-time guest would otherwise
  // finish as 'returning'.
  const journey = session.journey ?? 'returning'

  const result = await transaction(async (tx) => {
    const [credential] = await tx
      .select({ id: credentials.id })
      .from(credentials)
      .where(and(eq(credentials.guestId, session.guestId), isNull(credentials.revokedAt)))
      .orderBy(sql`${credentials.lastUsedAt} DESC NULLS LAST`)
      .limit(1)

    // ON CONFLICT covers the race where two requests both see an open session.
    const [row] = await tx
      .insert(checkins)
      .values({
        venueId: session.venueId,
        bookingId: session.bookingId,
        guestId: session.guestId,
        sessionId: session.id,
        credentialId: credential?.id ?? null,
        journey,
        idempotencyKey,
      })
      .onConflictDoUpdate({
        target: [checkins.bookingId, checkins.idempotencyKey],
        targetWhere: sql`idempotency_key IS NOT NULL`,
        set: { journey: sql`${checkins.journey}` },
      })
      .returning({ id: checkins.id, checkedInAt: checkins.checkedInAt })

    await tx
      .update(bookings)
      .set({ status: 'checked_in', guestId: sql`COALESCE(${bookings.guestId}, ${session.guestId})` })
      .where(eq(bookings.id, session.bookingId))

    await tx
      .update(checkinSessions)
      .set({ status: 'consumed', consumedAt: new Date() })
      .where(eq(checkinSessions.id, session.id))

    return row
  })

  return {
    checkinId: result.id,
    journey,
    venueName: session.venueName,
    roomNumber: session.roomNumber,
    checkedInAt: result.checkedInAt.toISOString(),
  }
}

/** Today's arrivals — the dashboard's first real screen. */
export const recentCheckins = (venueId, limit = 50) =>
  db
    .select()
    .from(checkins)
    .where(eq(checkins.venueId, venueId))
    .orderBy(desc(checkins.checkedInAt))
    .limit(limit)
