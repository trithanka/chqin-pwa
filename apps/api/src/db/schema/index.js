/**
 * The schema is the source of truth. `npm run db:generate` turns it into SQL
 * migrations, `npm run db:migrate` applies them.
 *
 * Split by domain rather than by table so the identity/property boundary the
 * data model depends on is visible in the file tree:
 *
 *   identity.js — guests, credentials, KYC events   (global)
 *   property.js — hotels, rooms, bookings, sessions (tenanted by hotel)
 *   checkin.js  — the join between them
 *   auth.js     — challenges and the audit log
 */

export * from './identity.js'
export * from './property.js'
export * from './checkin.js'
export * from './auth.js'
