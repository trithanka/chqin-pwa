/**
 * Every table in one place, for drizzle-kit and for queries that join across
 * domains. The tables themselves are defined next to the domain that owns them:
 *
 *   modules/identity/    guests, credentials, KYC events, challenges, auth events (global)
 *   modules/venues/      venues, and the staff who run them
 *   modules/entry/       flows, gates, entitlements, sessions, entries (the engine)
 *   modules/hotel/       rooms, bookings, arrivals
 *   modules/visitors/    hosts, events, visitor and event arrivals
 *   modules/admin/       ChqIn Admin: the team that runs the platform
 *   shared/outbox/       notifications waiting to be sent, for every domain
 *
 * `npm run db:generate` turns this into SQL migrations, `npm run db:migrate`
 * applies them.
 */

export * from '../../modules/identity/identity.schema.js'
export * from '../../modules/venues/venues.schema.js'
export * from '../../modules/entry/entry.schema.js'
export * from '../outbox/outbox.schema.js'
export * from '../../modules/hotel/hotel.schema.js'
export * from '../../modules/visitors/visit.schema.js'
export * from '../../modules/visitors/event.schema.js'
export * from '../../modules/venues/staff.schema.js'
export * from '../../modules/identity/auth.schema.js'
export * from '../../modules/admin/admin.schema.js'
