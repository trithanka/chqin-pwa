import { and, eq, isNull, sql } from 'drizzle-orm'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { bookings, checkinSessions, venues, rooms } from '../db/schema/index.js'
import { newSessionToken, tokenHash } from '../lib/crypto.js'
import { conflict, notFound } from '../lib/errors.js'

/**
 * Check-in sessions: what a scanned QR resolves to, and the only thing that
 * carries a guest's identity between requests.
 */

/** Session joined to its hotel and booking, whatever state it's in. */
export async function loadAny(sessionId) {
  const [row] = await db
    .select({
      id: checkinSessions.id,
      venueId: checkinSessions.venueId,
      bookingId: checkinSessions.bookingId,
      guestId: checkinSessions.guestId,
      status: checkinSessions.status,
      journey: checkinSessions.journey,
      expiresAt: checkinSessions.expiresAt,
      venueName: venues.name,
      venueKind: venues.kind,
      venueLocation: venues.location,
      bookingRef: bookings.bookingRef,
      bookingGuestName: bookings.guestName,
      bookingGuestId: bookings.guestId,
      arrivalDate: bookings.arrivalDate,
      departureDate: bookings.departureDate,
      roomNumber: rooms.number,
    })
    .from(checkinSessions)
    .innerJoin(venues, eq(venues.id, checkinSessions.venueId))
    .leftJoin(bookings, eq(bookings.id, checkinSessions.bookingId))
    .leftJoin(rooms, eq(rooms.id, bookings.roomId))
    .where(eq(checkinSessions.id, sessionId))
    .limit(1)

  return row ?? null
}

/** Session that is still open and unexpired, or null. */
export async function loadOpen(sessionId) {
  const session = await loadAny(sessionId)
  if (!session) return null
  if (session.status !== 'open' || session.expiresAt < new Date()) return null
  return session
}

/** Same, but throws the 404 every route would otherwise repeat. */
export async function requireOpen(sessionId) {
  const session = await loadOpen(sessionId)
  if (!session) throw notFound()
  return session
}

export const toPayload = (s) => ({
  sessionId: s.id,
  venue: { name: s.venueName, kind: s.venueKind, location: s.venueLocation },
  booking: s.bookingId
    ? {
        reference: s.bookingRef,
        guestName: s.bookingGuestName,
        roomNumber: s.roomNumber,
        arrivalDate: s.arrivalDate,
        departureDate: s.departureDate,
      }
    : null,
  expiresAt: s.expiresAt.toISOString(),
})

/**
 * Resolve a scanned token. A 'desk' QR is long-lived and mints a short-lived
 * child per scan; anything else is single-use and must still be open.
 */
export async function resolveToken(token) {
  const [parent] = await db
    .select()
    .from(checkinSessions)
    .where(eq(checkinSessions.tokenHash, tokenHash(token)))
    .limit(1)

  if (!parent || parent.status === 'revoked' || parent.expiresAt < new Date()) {
    throw notFound('This QR code is not valid any more.')
  }

  if (parent.kind !== 'desk') {
    if (parent.status !== 'open') {
      throw conflict('session_used', 'This QR code has already been used.')
    }
    return loadAny(parent.id)
  }

  const [child] = await db
    .insert(checkinSessions)
    .values({
      venueId: parent.venueId,
      bookingId: parent.bookingId,
      parentId: parent.id,
      tokenHash: tokenHash(newSessionToken()),
      kind: 'kiosk',
      expiresAt: new Date(Date.now() + config.SESSION_TTL_MS),
    })
    .returning({ id: checkinSessions.id })

  return loadAny(child.id)
}

/** Records who the session belongs to. Only a verified ceremony may call this. */
export const bindGuest = (tx, sessionId, guestId) =>
  tx.update(checkinSessions).set({ guestId }).where(eq(checkinSessions.id, sessionId))

/**
 * A desk QR carries no reservation — it identifies the property. Once a
 * ceremony says who the guest is, attach today's booking for them. A guest
 * with no arrival today gets none, and check-in says so rather than inventing
 * one.
 */
export async function attachBooking(tx, session, guestId) {
  if (session.bookingId) return session.bookingId

  const [booking] = await tx
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.venueId, session.venueId),
        eq(bookings.guestId, guestId),
        eq(bookings.status, 'confirmed'),
        sql`${bookings.arrivalDate} = CURRENT_DATE`,
      ),
    )
    .orderBy(bookings.createdAt)
    .limit(1)

  if (!booking) return null
  await tx
    .update(checkinSessions)
    .set({ bookingId: booking.id })
    .where(and(eq(checkinSessions.id, session.id), isNull(checkinSessions.bookingId)))
  return booking.id
}
