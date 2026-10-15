import { and, count, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import {
  entries,
  guests,
  hotelBookings,
  hotelEntryDetails,
  hotelRooms,
} from '../../shared/db/schema.js'
import { bookingsQuery } from './hotelBookings.js'

/** A hotel's Today screen. */

/**
 * Today's arrivals plus the counts a desk actually watches.
 *
 * Two kinds of row: reservations expected today, and people who simply turned
 * up and checked in. A list built only from bookings would show nothing at a
 * venue that doesn't take them.
 */
export async function overview(venueId) {
  const today = new Date().toISOString().slice(0, 10)

  const expected = await bookingsQuery(venueId, eq(hotelBookings.arrivalDate, today))

  const walkIns = await db
    .select({
      kind: sql`'walkin'`,
      id: entries.id,
      reference: sql`null`,
      guestId: entries.guestId,
      guestName: guests.displayName,
      checkinId: entries.id,
      partySize: hotelEntryDetails.partySize,
      roomsCount: hotelEntryDetails.roomsCount,
      roomId: hotelEntryDetails.roomId,
      roomIds: sql`case when ${hotelEntryDetails.roomId} is null then '{}'::uuid[] else array[${hotelEntryDetails.roomId}] end`,
      room: hotelRooms.number,
      roomType: sql`null`,
      arrival: sql`${today}`,
      departure: sql`null`,
      status: sql`'checked_in'`,
      source: sql`null`,
      checkedInAt: entries.enteredAt,
      journey: hotelEntryDetails.journey,
    })
    .from(entries)
    .innerJoin(hotelEntryDetails, eq(hotelEntryDetails.entryId, entries.id))
    .leftJoin(guests, eq(guests.id, entries.guestId))
    .leftJoin(hotelRooms, eq(hotelRooms.id, hotelEntryDetails.roomId))
    .where(
      and(
        eq(entries.venueId, venueId),
        isNull(entries.entitlementId),
        sql`${entries.enteredAt}::date = CURRENT_DATE`,
      ),
    )

  const arrivals = [...expected, ...walkIns]

  const [inHouse] = await db
    .select({ value: count() })
    .from(entries)
    .where(and(eq(entries.venueId, venueId), sql`${entries.enteredAt}::date >= CURRENT_DATE - 1`))

  const [roomCount] = await db
    .select({ value: count() })
    .from(hotelRooms)
    .where(eq(hotelRooms.venueId, venueId))

  return {
    date: today,
    arrivals,
    inHouse: inHouse.value,
    rooms: roomCount.value,
  }
}
