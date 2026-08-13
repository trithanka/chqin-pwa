import { relations, sql } from 'drizzle-orm'
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
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
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('staff_users_email').on(table.emailHmac),
    check('staff_users_status', sql`${table.status} IN ('active','suspended')`),
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
