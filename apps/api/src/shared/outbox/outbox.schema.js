import { sql } from 'drizzle-orm'
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { venues } from '../../modules/venues/venues.schema.js'
import { uuidv7 } from '../lib/ids.js'

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

/**
 * Notifications waiting to go out, for every kind of gate. Written in the same
 * transaction as whatever caused them and sent by a worker afterwards, so a slow
 * or failing provider can never hold a guest at a gate.
 */
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('outbox_pending')
      .on(table.runAfter)
      .where(sql`status = 'pending'`),
    index('outbox_status_id').on(table.status, table.id),
    index('outbox_venue_id').on(table.venueId, table.id),
    check('outbox_status', sql`${table.status} IN ('pending','sent','failed','cancelled')`),
  ],
)
