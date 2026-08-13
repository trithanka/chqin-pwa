import { sql } from 'drizzle-orm'
import { config } from '../config.js'
import { db, pool } from './client.js'

/**
 * Empties the tables but keeps the schema.
 *
 * `db:reset` drops schemas and refuses anything that isn't localhost, which is
 * right — but a hosted development database still needs a way back to a clean
 * slate. This is that, and it is still destructive: every guest, credential and
 * check-in goes.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to clear a production database.')
  process.exit(1)
}

// Every table with rows in it. Adding a table to the schema means adding it
// here — otherwise "cleared" quietly leaves data behind, which is worse than
// not clearing at all.
const TABLES = [
  'auth_events',
  'staff_memberships',
  'staff_users',
  'webauthn_challenges',
  'checkins',
  'checkin_sessions',
  'identity_verifications',
  'credentials',
  'bookings',
  'rooms',
  'venues',
  'guests',
]

await db.execute(sql.raw(`TRUNCATE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`))
console.log(`cleared ${TABLES.length} tables on ${new URL(config.DATABASE_URL).host}`)
await pool.end()
