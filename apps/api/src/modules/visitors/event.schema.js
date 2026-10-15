import { sql } from 'drizzle-orm'
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { entries } from '../entry/entry.schema.js'
import { venues } from '../venues/venues.schema.js'
import { visitHosts } from './visit.schema.js'
import { uuidv7 } from '../../shared/lib/ids.js'

/** Event tables: any venue that runs events a visitor can attend. */

export const eventEvents = pgTable(
  'event_events',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Told when someone checks in. A host row, since organisers are the same
    // people and teams a visitor can be sent to.
    organizerId: uuid('organizer_id').references(() => visitHosts.id, { onDelete: 'set null' }),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('event_events_venue').on(table.venueId).where(sql`active`)],
)

/** What an event arrival adds to an entry. */
export const eventEntryDetails = pgTable(
  'event_entry_details',
  {
    entryId: uuid('entry_id')
      .primaryKey()
      .references(() => entries.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => eventEvents.id, { onDelete: 'set null' }),
    company: text('company').notNull(),
    designation: text('designation').notNull(),
  },
  (table) => [index('event_entry_details_event').on(table.eventId)],
)
