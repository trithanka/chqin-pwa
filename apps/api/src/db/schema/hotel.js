import { sql } from 'drizzle-orm'
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { entitlements, entries } from './entry.js'
import { venues } from './property.js'
import { uuidv7 } from '../../lib/ids.js'

/**
 * Hotel-only tables. Everything a hotel gate needs that no other kind of gate
 * does: rooms, what a booking adds to an entitlement, and what an arrival adds
 * to an entry. A temple or a zoo never touches these.
 */

export const hotelRooms = pgTable(
  'hotel_rooms',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    roomType: text('room_type'),
  },
  (table) => [uniqueIndex('hotel_rooms_venue_number_key').on(table.venueId, table.number)],
)

/**
 * What a hotel booking has that no other entitlement does. The reservation
 * itself is an `entitlements` row of kind 'booking' with the same id.
 */
export const hotelBookings = pgTable(
  'hotel_bookings',
  {
    entitlementId: uuid('entitlement_id')
      .primaryKey()
      .references(() => entitlements.id, { onDelete: 'cascade' }),
    pmsRef: text('pms_ref'),
    guestName: text('guest_name').notNull(), // as booked; not an identity
    arrivalDate: date('arrival_date').notNull(),
    departureDate: date('departure_date').notNull(),
    // What the stay was asked for, as opposed to what has been given: a party
    // of four wanting two rooms is a fact about the booking before the desk has
    // decided which rooms. The rooms themselves live in hotel_booking_rooms.
    partySize: integer('party_size'),
    roomsCount: integer('rooms_count'),
    // The stay's own lifecycle, finer than the entitlement's active/used.
    status: text('status').notNull().default('confirmed'),
  },
  (table) => [
    index('hotel_bookings_arrivals')
      .on(table.arrivalDate)
      .where(sql`status = 'confirmed'`),
    check(
      'hotel_bookings_status',
      sql`${table.status} IN ('confirmed','checked_in','checked_out','cancelled')`,
    ),
  ],
)

/**
 * The rooms a booking actually holds.
 *
 * A row per room rather than a column on the booking, because a party can take
 * two rooms and a column can only ever name one. This is the only record of
 * which rooms are given out — `rooms_count` says how many were asked for, and
 * the two are allowed to disagree while the desk is still working.
 */
export const hotelBookingRooms = pgTable(
  'hotel_booking_rooms',
  {
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => hotelBookings.entitlementId, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => hotelRooms.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('hotel_booking_rooms_key').on(table.bookingId, table.roomId),
    index('hotel_booking_rooms_room').on(table.roomId),
  ],
)

/** What a hotel arrival has that no other entry does. */
export const hotelEntryDetails = pgTable(
  'hotel_entry_details',
  {
    entryId: uuid('entry_id')
      .primaryKey()
      .references(() => entries.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id').references(() => hotelRooms.id),
    // What the guest said about their own stay on the way in. A statement of
    // intent, not the property's record: the desk confirms it when it assigns
    // rooms, and the booking is written from the confirmed numbers.
    journey: text('journey').notNull(), // returning | newDevice | firstTime | desk
    nights: integer('nights'),
    partySize: integer('party_size'),
    roomsCount: integer('rooms_count'),
  },
  (table) => [
    check(
      'hotel_entry_details_journey',
      sql`${table.journey} IN ('returning','newDevice','firstTime','desk')`,
    ),
  ],
)
