import { relations, sql } from 'drizzle-orm'
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { bytea } from './identity.js'
import { venues } from './property.js'
import { uuidv7 } from '../../lib/ids.js'

/**
 * Staff — the people who run a venue, as opposed to the guests who arrive at
 * one. Deliberately a separate table from `guests`: different credentials
 * (password vs passkey), different threat model (a shared desk terminal vs a
 * stranger's phone), and a staff member who is also a guest somewhere is two
 * unrelated records.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

export const staffUsers = pgTable(
  'staff_users',
  {
    id: id(),
    // Same convention as guests: keyed hash to find, encrypted to read.
    emailHmac: bytea('email_hmac').notNull(),
    emailEnc: bytea('email_enc'),
    displayName: text('display_name').notNull(),
    // scrypt$N$r$p$salt$hash — the prefix is what lets a later move to
    // argon2id rehash on next login instead of locking everyone out.
    passwordHash: text('password_hash').notNull(),
    status: text('status').notNull().default('active'),
    // Recorded, not enforced: an unverified owner can still run their
    // property. It exists so the day you want to gate something on a real
    // address, the data is already there rather than starting from empty.
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('staff_users_email').on(table.emailHmac),
    check('staff_users_status', sql`${table.status} IN ('active','suspended')`),
  ],
)

/**
 * One row per signed-in browser.
 *
 * This replaces a self-contained signed cookie. The cookie now carries an
 * opaque random token and nothing else, so the row is the session: revoking
 * it ends access on the next request rather than at the next expiry. That is
 * what makes logout mean logout, and what lets a password reset throw out
 * every session an attacker might be holding.
 *
 * The token is stored as a SHA-256 digest. A leaked database backup then
 * yields no usable cookies.
 */
export const staffSessions = pgTable(
  'staff_sessions',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // The hot path: every authenticated request is this lookup.
    uniqueIndex('staff_sessions_token').on(table.tokenHash),
    index('staff_sessions_staff').on(table.staffId),
  ],
)

/**
 * Single-use links sent by email: password reset, and address verification.
 *
 * One table rather than two because the shape is identical — a hashed token,
 * an expiry, and a used-at stamp — and `purpose` is the only thing that
 * differs. Two tables would be two migrations and two cleanup jobs for the
 * same three columns.
 */
export const staffTokens = pgTable(
  'staff_tokens',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('staff_tokens_token').on(table.tokenHash),
    // Answers both "is there a live link already" (the resend throttle) and
    // "invalidate the others" in one index.
    index('staff_tokens_staff').on(table.staffId, table.purpose),
    check('staff_tokens_purpose', sql`${table.purpose} IN ('password_reset','email_verify')`),
  ],
)

/** Which venues a person can see, and what they may do there. */
export const staffMemberships = pgTable(
  'staff_memberships',
  {
    id: id(),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffUsers.id, { onDelete: 'cascade' }),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('staff_memberships_unique').on(table.staffId, table.venueId),
    check('staff_memberships_role', sql`${table.role} IN ('owner','manager','frontdesk')`),
  ],
)

export const staffUsersRelations = relations(staffUsers, ({ many }) => ({
  memberships: many(staffMemberships),
}))

export const staffMembershipsRelations = relations(staffMemberships, ({ one }) => ({
  staff: one(staffUsers, { fields: [staffMemberships.staffId], references: [staffUsers.id] }),
  venue: one(venues, { fields: [staffMemberships.venueId], references: [venues.id] }),
}))
