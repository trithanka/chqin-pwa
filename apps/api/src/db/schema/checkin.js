import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { credentials, guests } from './identity.js'
import { bookings, checkinSessions, hotels, rooms } from './property.js'
import { uuidv7 } from '../../lib/ids.js'

/**
 * The join between the two domains, and the record a hotel is audited on.
 *
 * `guestId` is nullable so erasure can tombstone the guest without deleting a
 * stay record that has a statutory retention period.
 */
export const checkins = pgTable(
  'checkins',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    hotelId: uuid('hotel_id')
      .notNull()
      .references(() => hotels.id),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    sessionId: uuid('session_id').references(() => checkinSessions.id),
    credentialId: uuid('credential_id').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    journey: text('journey').notNull(), // returning | newDevice | firstTime | desk
    roomId: uuid('room_id').references(() => rooms.id),
    idempotencyKey: text('idempotency_key'),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A double-tapped button must not produce two check-ins.
    uniqueIndex('checkins_idempotency')
      .on(table.bookingId, table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index('checkins_hotel_day').on(table.hotelId, table.checkedInAt),
    check('checkins_journey', sql`${table.journey} IN ('returning','newDevice','firstTime','desk')`),
  ],
)
