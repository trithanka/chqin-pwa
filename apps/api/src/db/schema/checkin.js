import { sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { credentials, guests } from './identity.js'
import { bookings, checkinSessions, rooms, venues } from './property.js'
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
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    // Optional: a walk-in has no reservation, and a venue without rooms never
    // will. The check-in stands on its own.
    bookingId: uuid('booking_id').references(() => bookings.id),
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
    // A double-tapped button must not produce two check-ins. Keyed on the
    // client's per-session UUID alone, because NULL booking ids are distinct
    // in Postgres and would let a walk-in retry through.
    uniqueIndex('checkins_idempotency')
      .on(table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index('checkins_venue_day').on(table.venueId, table.checkedInAt),
    check('checkins_journey', sql`${table.journey} IN ('returning','newDevice','firstTime','desk')`),
  ],
)
