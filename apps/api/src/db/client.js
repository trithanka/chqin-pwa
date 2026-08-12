import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { config, isRemote, sslFor } from '../config.js'
import * as schema from './schema/index.js'

/**
 * One pool for the process. Check-in traffic is bursty — everyone arrives
 * between 2 and 6pm — but low volume, so a modest pool with a short connect
 * timeout fails fast instead of queueing a lobby full of guests.
 */
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  // Behind a transaction pooler every client here is a pooler slot, and the
  // shared tiers count them tightly — a big local pool starves other clients
  // rather than making anything faster.
  max: isRemote() ? Math.min(config.PG_POOL_MAX, 5) : config.PG_POOL_MAX,
  ssl: sslFor(config.DATABASE_URL),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

export const db = drizzle(pool, { schema })

/**
 * Run a unit of work in a transaction. Every route that writes more than one
 * row goes through this — a ceremony that half-completes is worse than one
 * that fails.
 */
export const transaction = (fn) => db.transaction(fn)
