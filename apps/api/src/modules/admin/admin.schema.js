import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  index,
  inet,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { bytea } from '../identity/identity.schema.js'
import { uuidv7 } from '../../shared/lib/ids.js'

/**
 * ChqIn Admin — the team that runs the platform, not anyone at a venue.
 *
 * Deliberately not staff_users with a flag: a different table, cookie and
 * middleware mean a bug in one can't hand out the other's access. A person who
 * is both an admin and a venue's staff member is two unrelated rows.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

export const adminUsers = pgTable(
  'admin_users',
  {
    id: id(),
    emailHmac: bytea('email_hmac').notNull(),
    emailEnc: bytea('email_enc'),
    displayName: text('display_name').notNull(),
    // Null until an invite is accepted.
    passwordHash: text('password_hash'),
    role: text('role').notNull(),
    status: text('status').notNull().default('invited'),
    // Encrypted with ENCRYPTION_KEY: a database dump alone must not be a
    // working second factor.
    totpSecretEnc: bytea('totp_secret_enc'),
    // The last step a code was accepted for, so no code works twice.
    totpLastStep: bigint('totp_last_step', { mode: 'number' }),
    totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
    failedAttempts: integer('failed_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('admin_users_email').on(table.emailHmac),
    check('admin_users_role', sql`${table.role} IN ('owner','support','read_only')`),
    check('admin_users_status', sql`${table.status} IN ('invited','active','disabled')`),
  ],
)

/** One row per signed-in browser. Same shape and reasoning as staff_sessions. */
export const adminSessions = pgTable(
  'admin_sessions',
  {
    id: id(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    // Null while only the password has been given: such a session can reach
    // the TOTP screen and nothing else.
    mfaAt: timestamp('mfa_at', { withTimezone: true }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('admin_sessions_token').on(table.tokenHash),
    index('admin_sessions_admin').on(table.adminId),
  ],
)

/** Invite and 2FA-reset links. One table, as with staff_tokens. */
export const adminTokens = pgTable(
  'admin_tokens',
  {
    id: id(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(),
    tokenHash: bytea('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('admin_tokens_token').on(table.tokenHash),
    check('admin_tokens_purpose', sql`${table.purpose} IN ('invite','totp_reset')`),
  ],
)

/**
 * Every change an admin makes, and every reveal and export.
 *
 * Append-only, and no foreign keys, for the reasons auth_events has none: the
 * row must outlive the venue, guest or admin it names, and must never wait on
 * another table's lock. Unlike auth_events it is written inside the change's
 * own transaction — a change that cannot be audited does not happen.
 */
export const adminAuditLog = pgTable(
  'admin_audit_log',
  {
    id: uuid('id').primaryKey().$defaultFn(uuidv7),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    adminId: uuid('admin_id'),
    adminName: text('admin_name'),
    role: text('role'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    venueId: uuid('venue_id'),
    reason: text('reason'),
    // { field: { before, after } } for what changed; free-form for reveals.
    changes: jsonb('changes').notNull().default({}),
    ip: inet('ip'),
    userAgent: text('user_agent'),
  },
  (table) => [
    index('admin_audit_log_time').on(table.occurredAt),
    index('admin_audit_log_target').on(table.targetType, table.targetId, table.occurredAt),
    index('admin_audit_log_admin').on(table.adminId, table.occurredAt),
  ],
)
