import { sql } from 'drizzle-orm'
import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { uuidv7 } from '../../lib/ids.js'

/**
 * Venue domain — tenanted by venue, and where the volume lives.
 *
 * A venue is anywhere someone arrives: a hotel today, an apartment block, a
 * temple or a station later. The identity domain is already agnostic about
 * this; keeping the vocabulary neutral here is what stops a second vertical
 * from needing a migration across live properties.
 *
 * `entitlements.guestId` is the one link back to identity from a reservation,
 * and it is nullable on purpose: a reservation exists before anyone knows who
 * ChqIn thinks the guest is. Filling it in is what new-device recovery does.
 */

const id = () => uuid('id').primaryKey().$defaultFn(uuidv7)

export const venues = pgTable(
  'venues',
  {
    id: id(),
    // Groups venues under one operator — a hotel chain, a housing society, a
    // temple trust.
    operatorId: uuid('operator_id'),
    // What kind of arrival this venue has. Entry is reservation-led at a hotel,
    // membership-led at an apartment, and open at a temple — the kind is what
    // tells the rest of the system which of those rules apply.
    kind: text('kind').notNull().default('hotel'),
    name: text('name').notNull(),
    location: text('location'),
    // Cut-offs run on the venue's local time, not the arriving guest's.
    timezone: text('timezone').notNull().default('UTC'),
    address: jsonb('address').notNull().default({}),
    // Everything onboarding collects that nothing queries by yet: services
    // offered, guest-facing essentials (wifi, breakfast, check-out), the
    // business registration, and per-service contact numbers.
    settings: jsonb('settings').notNull().default({}),
    // How long entry history is kept. Null = the default for the kind.
    retentionDays: integer('retention_days'),
    // Set by ChqIn Admin. Suspended: gates refuse scans and staff can't sign
    // in. Closed: what "deleting" a venue with history leaves behind.
    status: text('status').notNull().default('active'),
    statusReason: text('status_reason'),
    statusChangedAt: timestamp('status_changed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('venues_status', sql`${table.status} IN ('active','suspended','closed')`),
    check(
      'venues_kind',
      sql`${table.kind} IN ('hotel','apartment','temple','station','office','monument','park','museum','event','other')`,
    ),
  ],
)
