/**
 * The schema is the source of truth. `npm run db:generate` turns it into SQL
 * migrations, `npm run db:migrate` applies them.
 *
 * Split by domain rather than by table so the identity/property boundary the
 * data model depends on is visible in the file tree:
 *
 *   identity.js — guests, credentials, KYC events   (global)
 *   property.js — venues (tenanted by venue)
 *   entry.js    — gates, flows, sessions, entitlements, entries (the engine)
 *   hotel.js    — rooms, bookings, arrivals: what only a hotel gate needs
 *   visit.js    — hosts and visitor arrivals: any venue that hosts visitors
 *   event.js    — events and attendance: any venue that runs events
 *   staff.js    — the people who run a venue (not the guests)
 *   auth.js     — challenges and the audit log
 *   admin.js    — ChqIn Admin: the team that runs the platform
 */

export * from './identity.js'
export * from './property.js'
export * from './entry.js'
export * from './hotel.js'
export * from './visit.js'
export * from './event.js'
export * from './staff.js'
export * from './auth.js'
export * from './admin.js'
