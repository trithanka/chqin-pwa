import { sql } from 'drizzle-orm'
import { config, isRemote } from '../config.js'
import { db, pool } from './client.js'

/**
 * Empties the tables but keeps the schema.
 *
 * `db:reset` drops schemas and refuses anything that isn't localhost, which is
 * right — but a hosted development database still needs a way back to a clean
 * slate. This is that, and it is still destructive: every guest, credential and
 * check-in goes.
 */
/**
 * Refuse a database that isn't on this machine unless told explicitly.
 *
 * These scripts destroy data, and which database they hit depends on whichever
 * URL happens to be uncommented in .env — a state that changes for unrelated
 * reasons, like running a migration. Requiring the flag means a production
 * wipe is always a decision, never a leftover.
 */
if (isRemote()) {
  if (process.env.CHQIN_ALLOW_REMOTE !== 'yes') {
    console.error(`Refusing: DATABASE_URL points at ${new URL(config.DATABASE_URL).host}.`)
    console.error('If you mean it, re-run with CHQIN_ALLOW_REMOTE=yes.')
    process.exit(1)
  }
  console.warn(`⚠︎ operating on REMOTE database ${new URL(config.DATABASE_URL).host}`)
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
