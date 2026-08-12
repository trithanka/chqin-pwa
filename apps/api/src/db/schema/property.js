import { relations, sql } from 'drizzle-orm'
import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { bytea } from './identity.js'
import { guests } from './identity.js'
import { uuidv7 } from '../../lib/ids.js'

/**
 * Property domain — tenanted by hotel, and where the volume lives.
 *
 * `bookings.guestId` is the one link back to identity, and it is nullable on
 * purpose: a reservation exists before anyone knows who ChqIn thinks the guest
 * is. Filling it in is what new-device recovery does.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

export const hotels = pgTable('hotels', {
  id: id(),
  chainId: uuid('chain_id'),
  name: text('name').notNull(),
  location: text('location'),
  // Check-in and check-out cut-offs run on the property's local time.
  timezone: text('timezone').notNull().default('UTC'),
  address: jsonb('address').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    roomType: text('room_type'),
  },
  (table) => [uniqueIndex('rooms_hotel_number_key').on(table.hotelId, table.number)],
)

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    bookingRef: text('booking_ref').notNull(),
    pmsRef: text('pms_ref'),
    guestName: text('guest_name').notNull(), // as booked; not an identity
    guestId: uuid('guest_id').references(() => guests.id),
    roomId: uuid('room_id').references(() => rooms.id),
    arrivalDate: date('arrival_date').notNull(),
    departureDate: date('departure_date').notNull(),
    status: text('status').notNull().default('confirmed'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bookings_hotel_ref_key').on(table.hotelId, table.bookingRef),
    index('bookings_arrivals')
      .on(table.hotelId, table.arrivalDate)
      .where(sql`status = 'confirmed'`),
    index('bookings_guest').on(table.guestId).where(sql`guest_id IS NOT NULL`),
  ],
)

/**
 * What a QR resolves to. A printed desk card is a 'desk' row that mints
 * short-lived children on scan, so the card identifies the property rather
 * than one check-in and never has to be reprinted.
 */
export const checkinSessions = pgTable(
  'checkin_sessions',
  {
    id: id(),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id),
    parentId: uuid('parent_id'),
    // Hashed, so a database leak isn't a ring of working keys.
    tokenHash: bytea('token_hash').notNull(),
    kind: text('kind').notNull(), // desk | booking | kiosk
    status: text('status').notNull().default('open'),
    // Recorded at detection, because enrolment changes the state it was
    // decided from — see services/detection.js.
    journey: text('journey'),
    guestId: uuid('guest_id').references(() => guests.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('checkin_sessions_token').on(table.tokenHash),
    index('checkin_sessions_open')
      .on(table.hotelId, table.expiresAt)
      .where(sql`status = 'open'`),
  ],
)

export const hotelsRelations = relations(hotels, ({ many }) => ({
  rooms: many(rooms),
  bookings: many(bookings),
}))

export const bookingsRelations = relations(bookings, ({ one }) => ({
  hotel: one(hotels, { fields: [bookings.hotelId], references: [hotels.id] }),
  room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
  guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
}))

export const checkinSessionsRelations = relations(checkinSessions, ({ one }) => ({
  hotel: one(hotels, { fields: [checkinSessions.hotelId], references: [hotels.id] }),
  booking: one(bookings, { fields: [checkinSessions.bookingId], references: [bookings.id] }),
}))
