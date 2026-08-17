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
  /**
   * Discard idle connections before the network does.
   *
   * A NAT on the path — a phone hotspot, a hotel's own router — drops idle TCP
   * flows in well under a minute, and neither end is told. The socket looks fine
   * from here, so the pool hands it to the next query and that query dies with
   * "Connection terminated unexpectedly" inside a connect timeout, usually the
   * first request after a quiet spell. Retiring remote connections sooner than
   * any such device would means we close them rather than discover them dead.
   */
  idleTimeoutMillis: isRemote() ? 10_000 : 30_000,
  // Keepalives on the ones still in use, for the same reason.
  keepAlive: true,
  keepAliveInitialDelayMillis: 5_000,
  connectionTimeoutMillis: 10_000,
})

/**
 * A pool with no error listener crashes the process when an *idle* client
 * errors, which is exactly what the dropped flow above looks like. The pool
 * discards the client either way; the request that finds it is where the failure
 * belongs, not the whole API.
 */
pool.on('error', (err) => console.error('pg pool: idle client error —', err.message))

export const db = drizzle(pool, { schema })

/**
 * Run a unit of work in a transaction. Every route that writes more than one
 * row goes through this — a ceremony that half-completes is worse than one
 * that fails.
 */
export const transaction = (fn) => db.transaction(fn)
