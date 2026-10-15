import { sql } from 'drizzle-orm'
import { boolean, check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { entries } from '../entry/entry.schema.js'
import { venues } from '../venues/venues.schema.js'
import { uuidv7 } from '../../shared/lib/ids.js'

/**
 * Visitor tables: any venue that hosts visitors — an office, a coworking
 * building, an apartment block. Not named after the first customer; a second
 * building using the same flow needs no new table.
 */

/** A person or team a visitor can be sent to. Also who an event's organiser is. */
export const visitHosts = pgTable(
  'visit_hosts',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Where the arrival notice goes (WhatsApp). Null: the dashboard still shows it.
    phone: text('phone'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('visit_hosts_venue').on(table.venueId).where(sql`active`)],
)

/** What a visitor's arrival adds to an entry. Events have their own table. */
export const visitEntryDetails = pgTable(
  'visit_entry_details',
  {
    entryId: uuid('entry_id')
      .primaryKey()
      .references(() => entries.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(), // meeting | office
    hostId: uuid('host_id').references(() => visitHosts.id, { onDelete: 'set null' }),
  },
  (table) => [check('visit_entry_details_purpose', sql`${table.purpose} IN ('meeting','office')`)],
)
