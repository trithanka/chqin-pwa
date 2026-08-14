import { relations, sql } from 'drizzle-orm'
import {
  check,
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
 * Venue domain — tenanted by venue, and where the volume lives.
 *
 * A venue is anywhere someone arrives: a hotel today, an apartment block, a
 * temple or a station later. The identity domain is already agnostic about
 * this; keeping the vocabulary neutral here is what stops a second vertical
 * from needing a migration across live properties.
 *
 * `bookings.guestId` is the one link back to identity, and it is nullable on
 * purpose: a reservation exists before anyone knows who ChqIn thinks the guest
 * is. Filling it in is what new-device recovery does.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

export const venues = pgTable(
  'venues',
  {
    id: id(),
    // Groups venues under one operator — a hotel chain, a housing society, a
    // temple trust.
    operatorId: uuid('operator_id'),
    // What kind of arrival this venue has. Entry is reservation-led at a hotel,
    // membership-led at an apartment, and open at a temple — the kind is what
    // tells the rest of the system which of those rules apply.
    kind: text('kind').notNull().default('hotel'),
    name: text('name').notNull(),
    location: text('location'),
    // Cut-offs run on the venue's local time, not the arriving guest's.
    timezone: text('timezone').notNull().default('UTC'),
    address: jsonb('address').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'venues_kind',
      sql`${table.kind} IN ('hotel','apartment','temple','station','office','other')`,
    ),
  ],
)

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    roomType: text('room_type'),
  },
  (table) => [uniqueIndex('rooms_venue_number_key').on(table.venueId, table.number)],
)

export const bookings = pgTable(
  'bookings',
  {
    id: id(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
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
    uniqueIndex('bookings_venue_ref_key').on(table.venueId, table.bookingRef),
    index('bookings_arrivals')
      .on(table.venueId, table.arrivalDate)
      .where(sql`status = 'confirmed'`),
    index('bookings_guest').on(table.guestId).where(sql`guest_id IS NOT NULL`),
    check('bookings_status', sql`${table.status} IN ('confirmed','checked_in','checked_out','cancelled')`),
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
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    bookingId: uuid('booking_id').references(() => bookings.id),
    // A desk QR is the parent of every session it mints.
    parentId: uuid('parent_id').references(() => checkinSessions.id),
    // Hashed, so a database leak isn't a ring of working keys.
    tokenHash: bytea('token_hash').notNull(),
    // Desk QRs only, and deliberately in the clear: the card sits on a counter
    // where anyone can photograph it, so its secrecy was never the control —
    // and a card you can't reprint because the server forgot the token is a
    // card you have to replace. Booking and kiosk tokens stay hash-only.
    token: text('token'),
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
      .on(table.venueId, table.expiresAt)
      .where(sql`status = 'open'`),
    check('checkin_sessions_kind', sql`${table.kind} IN ('desk','booking','kiosk')`),
    check('checkin_sessions_status', sql`${table.status} IN ('open','consumed','expired','revoked')`),
    check(
      'checkin_sessions_journey',
      sql`${table.journey} IS NULL OR ${table.journey} IN ('returning','newDevice','firstTime','desk')`,
    ),
  ],
)

export const venuesRelations = relations(venues, ({ many }) => ({
  rooms: many(rooms),
  bookings: many(bookings),
}))

export const bookingsRelations = relations(bookings, ({ one }) => ({
  venue: one(venues, { fields: [bookings.venueId], references: [venues.id] }),
  room: one(rooms, { fields: [bookings.roomId], references: [rooms.id] }),
  guest: one(guests, { fields: [bookings.guestId], references: [guests.id] }),
}))

export const checkinSessionsRelations = relations(checkinSessions, ({ one }) => ({
  venue: one(venues, { fields: [checkinSessions.venueId], references: [venues.id] }),
  booking: one(bookings, { fields: [checkinSessions.bookingId], references: [bookings.id] }),
}))
