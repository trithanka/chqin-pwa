import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from '../../lib/ids.js'

/**
 * Identity domain — global, belongs to the guest, not to a property.
 *
 * Nothing in here references the property tables. That boundary is what lets
 * identity split into its own service later without a rewrite; see
 * docs/data-model.md.
 */

/** Postgres bytea ↔ Node Buffer. */
export const bytea = customType({
  dataType: () => 'bytea',
  toDriver: (value) => (Buffer.isBuffer(value) ? value : Buffer.from(value)),
  fromDriver: (value) => value,
})

/** Time-ordered ids: v7 keeps B-tree inserts append-only where v4 scatters them. */
const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

export const guests = pgTable(
  'guests',
  {
  id: id(),
  displayName: text('display_name').notNull(),
  // HMAC rather than a bare digest: emails and phone numbers are guessable, so
  // an unkeyed hash is offline-attackable. Encrypted columns hold the value
  // itself — hash to find, decrypt to read.
  emailHmac: bytea('email_hmac').unique(),
  phoneHmac: bytea('phone_hmac').unique(),
  emailEnc: bytea('email_enc'),
  phoneEnc: bytea('phone_enc'),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
},
  // Enumerations live in the database, not only in a comment: an unexpected
  // value should fail the write, not surface later as a journey nobody handles.
  (table) => [check('guests_status', sql`${table.status} IN ('active','suspended','erased')`)],
)

/** One row per passkey. This table is the login system. */
export const credentials = pgTable(
  'credentials',
  {
    id: id(),
    guestId: uuid('guest_id')
      .notNull()
      .references(() => guests.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: bytea('public_key').notNull(),
    alg: integer('alg').notNull(), // -7 ES256, -257 RS256
    // A counter that goes backwards means the credential was cloned.
    signCount: bigint('sign_count', { mode: 'number' }).notNull().default(0),
    aaguid: uuid('aaguid'),
    transports: text('transports').array(),
    backupEligible: boolean('backup_eligible').notNull().default(false),
    backedUp: boolean('backed_up').notNull().default(false),
    deviceLabel: text('device_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    // THE hot path: a discoverable-credential login arrives carrying only this.
    uniqueIndex('credentials_credential_id_key').on(table.credentialId),
    index('credentials_guest_active').on(table.guestId).where(sql`revoked_at IS NULL`),
  ],
)

/** KYC events, never the document itself. */
export const identityVerifications = pgTable(
  'identity_verifications',
  {
    id: id(),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'cascade' }),
    // Unconstrained on purpose: the record outlives the session it happened in.
    sessionId: uuid('session_id'),
    method: text('method').notNull(), // document | manual_desk | simulated
    provider: text('provider'),
    providerRef: text('provider_ref'),
    documentType: text('document_type'),
    documentHmac: bytea('document_hmac'),
    documentLast4: text('document_last4'),
    artifactUri: text('artifact_uri'),
    result: text('result').notNull(), // passed | failed | manual_review
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('identity_verifications_guest').on(table.guestId, table.createdAt),
    check('identity_verifications_method', sql`${table.method} IN ('document','manual_desk','simulated')`),
    check('identity_verifications_result', sql`${table.result} IN ('passed','failed','manual_review')`),
  ],
)

export const guestsRelations = relations(guests, ({ many }) => ({
  credentials: many(credentials),
  verifications: many(identityVerifications),
}))

export const credentialsRelations = relations(credentials, ({ one }) => ({
  guest: one(guests, { fields: [credentials.guestId], references: [guests.id] }),
}))
