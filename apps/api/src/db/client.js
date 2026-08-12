import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { config } from '../config.js'
import * as schema from './schema/index.js'

/**
 * One pool for the process. Check-in traffic is bursty — everyone arrives
 * between 2 and 6pm — but low volume, so a modest pool with a short connect
 * timeout fails fast instead of queueing a lobby full of guests.
 */
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.PG_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })

/**
 * Run a unit of work in a transaction. Every route that writes more than one
 * row goes through this — a ceremony that half-completes is worse than one
 * that fails.
 */
export const transaction = (fn) => db.transaction(fn)
