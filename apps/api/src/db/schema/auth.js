import { sql } from 'drizzle-orm'
import { index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { guests } from './identity.js'
import { checkinSessions } from './property.js'
import { uuidv7 } from '../../lib/ids.js'

/**
 * WebAuthn challenges. Postgres for now; they're write-once, read-once and
 * dead in two minutes, so Redis is the right home once volume justifies a
 * second store.
 */
export const webauthnChallenges = pgTable(
  'webauthn_challenges',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    sessionId: uuid('session_id').references(() => checkinSessions.id, { onDelete: 'cascade' }),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'cascade' }),
    // A ceremony needs a user handle before a guest row exists. Minting it here
    // means an abandoned registration leaves nothing behind.
    pendingUserHandle: uuid('pending_user_handle'),
    pendingDisplayName: text('pending_display_name'),
    purpose: text('purpose').notNull(), // registration | authentication
    challenge: text('challenge').notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('webauthn_challenges_expiry')
      .on(table.expiresAt)
      .where(sql`consumed_at IS NULL`),
  ],
)

/**
 * Append-only. Deliberately carries no foreign keys: it must still record an
 * attempt against a credential that was just deleted, and must never block a
 * write on another table's lock.
 *
 * This is the table that grows without bound. When it does, convert it to
 * monthly range partitions with a hand-written migration and keep
 * `drizzle-kit push` away from it — Drizzle can't express PARTITION BY, so
 * partitioning is an ops migration, not a schema change.
 */
export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    guestId: uuid('guest_id'),
    credentialId: text('credential_id'),
    hotelId: uuid('hotel_id'),
    sessionId: uuid('session_id'),
    event: text('event').notNull(),
    outcome: text('outcome').notNull(), // ok | failed
    detail: jsonb('detail').notNull().default({}),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (table) => [index('auth_events_guest').on(table.guestId, table.occurredAt)],
)
