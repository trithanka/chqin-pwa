import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { bytea, credentials, guests } from './identity.js'
import { venues } from './property.js'
import { uuidv7 } from '../../lib/ids.js'

/**
 * The entry engine — how anyone gets in anywhere.
 *
 * A gate is one physical way in. It points at a flow, an ordered list of steps
 * (identify, pay, approve, admit…), and a session walks that list. A new kind
 * of entrance is a new flow row, not a new module. See the design page for the
 * table-by-table reasoning.
 *
 * Naming: no prefix means any gate can use it; `hotel_` tables belong to hotel
 * gates only. Later verticals bring their own prefix (`ticket_`, `slot_`).
 *
 * Hotel-only tables live in hotel.js.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

/**
 * One published version of a flow. Immutable: a session pins the row it
 * started on, so editing a flow never changes a guest mid-journey. That is also
 * what makes them safe to cache in memory.
 */
export const flowDefinitions = pgTable(
  'flow_definitions',
  {
    id: id(),
    key: text('key').notNull(), // 'hotel', 'nest.entry', 'open.slot'
    version: integer('version').notNull(),
    // [{ type, when?, ...config }] — see services/flows.js for the shape.
    steps: jsonb('steps').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('flow_definitions_key_version').on(table.key, table.version)],
)

/**
 * One way in. A printed desk QR already identified the property rather than one
 * check-in — that is exactly a gate, so the desk rows of checkin_sessions
 * become these and their tokens carry over (printed cards keep working).
 */
export const gates = pgTable(
  'gates',
  {
    id: id(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('qr'),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flowDefinitions.id),
    // In the clear for the same reason as checkin_sessions.token: the card sits
    // on a counter, so its secrecy was never the control, and a card the server
    // forgot is a card you have to replace.
    token: text('token'),
    tokenHash: bytea('token_hash').notNull(),
    // Per-gate options: price, approvers, whether identify is optional.
    config: jsonb('config').notNull().default({}),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('gates_token').on(table.tokenHash),
    index('gates_venue').on(table.venueId),
    check('gates_kind', sql`${table.kind} IN ('qr','desk','turnstile','kiosk')`),
    check('gates_status', sql`${table.status} IN ('active','revoked')`),
  ],
)

/**
 * The thing that grants entry, if anything: a booking, a ticket, a slot, a
 * permit, a membership. Nullable everywhere it is referenced — an open venue
 * grants entry on arrival alone.
 */
export const entitlements = pgTable(
  'entitlements',
  {
    id: id(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    // Nullable: a reservation exists before anyone knows who the guest is, and
    // a slot at an open venue never does.
    guestId: uuid('guest_id').references(() => guests.id),
    ref: text('ref'),
    status: text('status').notNull().default('active'),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    // Kind-specific detail nothing queries by. Anything that needs counting or
    // filtering gets a satellite table instead (hotel_bookings, slot_windows…).
    data: jsonb('data').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('entitlements_venue_kind_ref')
      .on(table.venueId, table.kind, table.ref)
      .where(sql`ref IS NOT NULL`),
    index('entitlements_guest').on(table.guestId).where(sql`guest_id IS NOT NULL`),
    check(
      'entitlements_kind',
      sql`${table.kind} IN ('booking','ticket','slot','permit','membership','event')`,
    ),
    check('entitlements_status', sql`${table.status} IN ('active','used','cancelled','expired')`),
  ],
)

/**
 * One guest's walk through a flow. Short-lived: once the entry row exists the
 * session is only history, and expired ones can be purged.
 *
 * Progress lives here and nowhere else. Steps that finish instantly are saved
 * together, so only a step that waits costs a write.
 */
export const entrySessions = pgTable(
  'entry_sessions',
  {
    id: id(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id, { onDelete: 'cascade' }),
    gateId: uuid('gate_id')
      .notNull()
      .references(() => gates.id),
    flowId: uuid('flow_id')
      .notNull()
      .references(() => flowDefinitions.id),
    // Hashed, so a database leak isn't a ring of working keys.
    tokenHash: bytea('token_hash').notNull(),
    status: text('status').notNull().default('in_progress'),
    // Index into the flow's steps. Branching is a `when` on a step, so the
    // position stays a single integer.
    cursor: integer('cursor').notNull().default(0),
    // Bumped on every save. Two requests can reach one session at once — a
    // guest's retry and a staff approval — so a save is
    // `UPDATE … WHERE id = $1 AND version = $2` and a loser re-reads and re-runs.
    version: integer('version').notNull().default(0),
    state: jsonb('state').notNull().default({}),
    // Append-only: what each step did and when, including who approved.
    // Copied into entries.data at admit.
    trail: jsonb('trail').notNull().default([]),
    guestId: uuid('guest_id').references(() => guests.id),
    entitlementId: uuid('entitlement_id').references(() => entitlements.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('entry_sessions_token').on(table.tokenHash),
    // The front desk's "waiting for you" list.
    index('entry_sessions_waiting')
      .on(table.venueId, table.updatedAt)
      .where(sql`status = 'waiting'`),
    check(
      'entry_sessions_status',
      sql`${table.status} IN ('in_progress','waiting','done','rejected','expired','revoked')`,
    ),
  ],
)

/**
 * The audit record: someone got in. Generalises checkins.
 *
 * `guestId` is nullable so erasure can tombstone the guest without deleting a
 * record with a retention period — and so an open venue can record that
 * someone entered without recording who.
 */
export const entries = pgTable(
  'entries',
  {
    id: id(),
    venueId: uuid('venue_id')
      .notNull()
      .references(() => venues.id),
    gateId: uuid('gate_id')
      .notNull()
      .references(() => gates.id),
    entitlementId: uuid('entitlement_id').references(() => entitlements.id),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    // Null for rows backfilled from checkins, which predate sessions of this kind.
    sessionId: uuid('session_id').references(() => entrySessions.id),
    credentialId: uuid('credential_id').references(() => credentials.id, {
      onDelete: 'set null',
    }),
    outcome: text('outcome').notNull().default('admitted'),
    idempotencyKey: text('idempotency_key'),
    data: jsonb('data').notNull().default({}),
    enteredAt: timestamp('entered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A double-tapped button must not admit twice.
    uniqueIndex('entries_idempotency')
      .on(table.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
    index('entries_venue_day').on(table.venueId, table.enteredAt),
    check('entries_outcome', sql`${table.outcome} IN ('admitted','denied')`),
  ],
)
