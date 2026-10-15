import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { db, transaction } from '../../shared/db/client.js'
import {
  entitlements,
  entries,
  entrySessions,
  guests,
  hotelBookingRooms,
  hotelBookings,
  hotelEntryDetails,
  hotelRooms,
  venues,
} from '../../shared/db/schema.js'
import { decrypt } from '../../shared/lib/crypto.js'
import { roomReady } from './hotelNotify.js'
import { enqueue } from '../../shared/outbox/outbox.js'
import { conflict, notFound } from '../../shared/lib/errors.js'

/** A hotel's rooms, and giving one to a guest who checked in without a reservation. */

/**
 * The venue's rooms, and which are spoken for right now.
 *
 * "Occupied" means some current stay already points at it. A room the desk
 * assigns today and never clears would otherwise look free tomorrow, so the
 * window matches the one Today's in-house count uses: since yesterday.
 */
export async function listRooms(venueId) {
  const rows = await db
    .select({
      id: hotelRooms.id,
      number: hotelRooms.number,
      roomType: hotelRooms.roomType,
      takenBy: sql`(
        select ${entries.id}
        from ${hotelEntryDetails}
        join ${entries} on ${entries.id} = ${hotelEntryDetails.entryId}
        where ${hotelEntryDetails.roomId} = ${hotelRooms.id}
          and ${entries.enteredAt}::date >= CURRENT_DATE - 1
        limit 1
      )`,
    })
    .from(hotelRooms)
    .where(eq(hotelRooms.venueId, venueId))
    .orderBy(hotelRooms.number)

  return rows
}

/**
 * Put a walk-in in a room, or take them out of one.
 *
 * A walk-in arrives with no reservation, so nothing has decided a room for
 * them — until now that meant the column stayed null forever and the desk had
 * no way to say where the guest actually is.
 *
 * Both ids are checked against the venue in the same statement rather than
 * read first and trusted: an id from a client is a guess about someone else's
 * property until the `where` says otherwise.
 */
/**
 * Which rooms a stay holds, set by the desk.
 *
 * Takes the whole list rather than one room, because "give them 003 and 004"
 * is one decision and two calls would leave a moment where the guest has half
 * their rooms. An empty list means the desk has taken the rooms back.
 *
 * The booking is written here, on the first assignment: a walk-in exists only
 * as a check-in until the desk agrees to something, and this is that moment.
 * What the guest said on the way in — nights, how many people, how many rooms
 * — is what it is created from, so their answers become the reservation rather
 * than a note nobody reads.
 */
export async function assignRoom(venueId, checkinId, roomIds) {
  const wanted = [...new Set(roomIds ?? [])]

  return transaction(async (tx) => {
    const found = wanted.length
      ? await tx
          .select({ id: hotelRooms.id, number: hotelRooms.number })
          .from(hotelRooms)
          .where(and(inArray(hotelRooms.id, wanted), eq(hotelRooms.venueId, venueId)))
      : []

    if (found.length !== wanted.length) throw notFound('No such room here.')

    const [stay] = await tx
      .select({
        id: entries.id,
        bookingId: entries.entitlementId,
        guestId: entries.guestId,
        guestName: guests.displayName,
        checkedInAt: entries.enteredAt,
        nights: hotelEntryDetails.nights,
        partySize: hotelEntryDetails.partySize,
        roomsCount: hotelEntryDetails.roomsCount,
      })
      .from(entries)
      .innerJoin(hotelEntryDetails, eq(hotelEntryDetails.entryId, entries.id))
      .leftJoin(guests, eq(guests.id, entries.guestId))
      .where(and(eq(entries.id, checkinId), eq(entries.venueId, venueId)))
      .limit(1)

    if (!stay) throw notFound('No such check-in here.')

    let bookingId = stay.bookingId

    if (wanted.length && !bookingId) {
      const arrival = (stay.checkedInAt ?? new Date()).toISOString().slice(0, 10)
      // The guest's own answer decides the departure date. One night only when
      // they weren't asked — every check-in taken before that screen existed.
      const departure = new Date(`${arrival}T00:00:00Z`)
      departure.setUTCDate(departure.getUTCDate() + Math.max(stay.nights ?? 1, 1))

      const [booking] = await tx
        .insert(entitlements)
        .values({
          venueId,
          kind: 'booking',
          // Not a PMS reference and shouldn't look like one: WI marks a stay
          // this system created, and the check-in's own id keeps it unique
          // per venue without a counter to race on.
          ref: `WI-${stay.id.slice(-6).toUpperCase()}`,
          guestId: stay.guestId,
          status: 'used',
        })
        .returning({ id: entitlements.id })

      await tx.insert(hotelBookings).values({
        entitlementId: booking.id,
        guestName: stay.guestName ?? 'Walk-in guest',
        arrivalDate: arrival,
        departureDate: departure.toISOString().slice(0, 10),
        partySize: stay.partySize,
        roomsCount: stay.roomsCount,
        status: 'checked_in',
      })

      bookingId = booking.id
    }

    if (bookingId) {
      // Replaced wholesale: the list the desk sent is the answer, and working
      // out which rows to add and which to remove is the same two statements.
      await tx.delete(hotelBookingRooms).where(eq(hotelBookingRooms.bookingId, bookingId))
      if (wanted.length) {
        await tx.insert(hotelBookingRooms).values(wanted.map((roomId) => ({ bookingId, roomId })))
      }
    }

    // The entry's room is where *this guest* sleeps; a party with two rooms
    // still has one first room, and the guest's own stay screen shows it.
    await tx
      .update(hotelEntryDetails)
      .set({ roomId: wanted[0] ?? null })
      .where(eq(hotelEntryDetails.entryId, checkinId))
    await tx.update(entries).set({ entitlementId: bookingId }).where(eq(entries.id, checkinId))

    // A guest who gave their number on the stay screen is told which room they
    // got. Only then: that opt-in is the consent to message them, and it was
    // given for this stay, so it lives on this stay's session.
    if (wanted.length) {
      const [opted] = await tx
        .select({ sessionId: entrySessions.id, phone: sql`${entrySessions.state}->>'stayPhone'`, hotel: venues.name })
        .from(entries)
        .innerJoin(entrySessions, eq(entrySessions.id, entries.sessionId))
        .innerJoin(venues, eq(venues.id, entries.venueId))
        .where(eq(entries.id, checkinId))
      if (opted?.phone) {
        await enqueue(tx, [
          roomReady(venueId, decrypt(Buffer.from(opted.phone, 'base64')), {
            guest: stay.guestName,
            hotel: opted.hotel,
            room: found.map((r) => r.number).sort().join(', '),
            sessionId: opted.sessionId,
          }),
        ])
      }
    }

    return {
      id: checkinId,
      roomIds: wanted,
      rooms: found.map((r) => r.number).sort(),
      bookingId,
    }
  })
}

/**
 * Add rooms, skipping any number the property already has.
 *
 * A duplicate is what happens when someone adds "101-110" twice, and the
 * unique index would turn the whole batch into an error rather than adding the
 * eight that were new. Skipping says what happened instead.
 */
export async function addRooms(venueId, list) {
  const added = await db
    .insert(hotelRooms)
    .values(list.map(({ number, type }) => ({ venueId, number, roomType: type ?? null })))
    .onConflictDoNothing({ target: [hotelRooms.venueId, hotelRooms.number] })
    .returning({ id: hotelRooms.id, number: hotelRooms.number })

  return { added, skipped: list.length - added.length }
}

/**
 * Remove a room, unless someone is in it.
 *
 * A stay points at its room, so deleting one out from under a guest would
 * either fail on the constraint or erase where they are. Refusing with the
 * reason is the only answer that helps the person at the desk.
 */
export async function removeRoom(venueId, roomId) {
  const [room] = await db
    .select({ id: hotelRooms.id })
    .from(hotelRooms)
    .where(and(eq(hotelRooms.id, roomId), eq(hotelRooms.venueId, venueId)))
    .limit(1)

  if (!room) throw notFound('No such room here.')

  const [occupied] = await db
    .select({ id: entries.id })
    .from(hotelEntryDetails)
    .innerJoin(entries, eq(entries.id, hotelEntryDetails.entryId))
    .where(
      and(eq(hotelEntryDetails.roomId, roomId), sql`${entries.enteredAt}::date >= CURRENT_DATE - 1`),
    )
    .limit(1)

  if (occupied) {
    throw conflict('room_occupied', 'Someone is in that room. Move them first.')
  }

  await db.delete(hotelRooms).where(and(eq(hotelRooms.id, roomId), eq(hotelRooms.venueId, venueId)))
  return { id: roomId }
}
