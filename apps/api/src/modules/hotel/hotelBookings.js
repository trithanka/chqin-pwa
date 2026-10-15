import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import {
  entitlements,
  entries,
  hotelBookingRooms,
  hotelBookings,
  hotelEntryDetails,
  hotelRooms,
} from '../../shared/db/schema.js'
import { notFound } from '../../shared/lib/errors.js'

/** A hotel's reservations as the desk reads them. Every query filters by the caller's venue. */

const bookingRow = {
  // What this row *is*. A walk-in row is shaped identically but its id keys a
  // different table, and a client that can't tell them apart sends check-in
  // ids to /bookings/:id — which 404s, and looks like missing data.
  kind: sql`'booking'`,
  id: entitlements.id,
  reference: entitlements.ref,
  guestId: entitlements.guestId,
  guestName: hotelBookings.guestName,
  // Every room the booking holds, as one string — "003" or "003, 004". A row
  // per room would repeat the booking once per room in every list.
  room: sql`string_agg(${hotelRooms.number}, ', ' ORDER BY ${hotelRooms.number})`,
  roomIds: sql`coalesce(array_agg(${hotelBookingRooms.roomId}) FILTER (WHERE ${hotelBookingRooms.roomId} IS NOT NULL), '{}')`,
  roomType: sql`min(${hotelRooms.roomType})`,
  arrival: hotelBookings.arrivalDate,
  departure: hotelBookings.departureDate,
  status: hotelBookings.status,
  source: hotelBookings.pmsRef,
  partySize: hotelBookings.partySize,
  roomsCount: hotelBookings.roomsCount,
  checkedInAt: entries.enteredAt,
  journey: hotelEntryDetails.journey,
  // Whether a passkey signed this check-in. Identity is what a check-in now
  // rests on, so one can be finished on a phone that never enrolled — and the
  // desk must not be told "Passkey Verified" about a guest who has none.
  passkey: sql`${entries.credentialId} IS NOT NULL`,
  // The check-in behind the reservation, when there is one. Room changes are
  // addressed by check-in, so a row without this can't be moved from Today.
  checkinId: entries.id,
}

/**
 * Callers pass their extra condition in rather than chaining a second
 * `.where()`: the rooms are aggregated, so the query ends in a GROUP BY and a
 * later `.where()` would land on the wrong side of it.
 */
export const bookingsQuery = (venueId, extra) =>
  db
    .select(bookingRow)
    .from(entitlements)
    .innerJoin(hotelBookings, eq(hotelBookings.entitlementId, entitlements.id))
    .leftJoin(hotelBookingRooms, eq(hotelBookingRooms.bookingId, hotelBookings.entitlementId))
    .leftJoin(hotelRooms, eq(hotelRooms.id, hotelBookingRooms.roomId))
    .leftJoin(entries, eq(entries.entitlementId, entitlements.id))
    .leftJoin(hotelEntryDetails, eq(hotelEntryDetails.entryId, entries.id))
    .where(
      extra
        ? and(eq(entitlements.venueId, venueId), extra)
        : eq(entitlements.venueId, venueId),
    )
    .groupBy(entitlements.id, hotelBookings.entitlementId, entries.id, hotelEntryDetails.entryId)

export const listBookings = (venueId) =>
  bookingsQuery(venueId).orderBy(desc(hotelBookings.arrivalDate), entitlements.ref)

export async function getBooking(venueId, id) {
  const [row] = await bookingsQuery(venueId, eq(entitlements.id, id))
  if (!row) throw notFound('No such booking here.')
  return row
}
