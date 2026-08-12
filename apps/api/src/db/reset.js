import { sql } from 'drizzle-orm'
import { config, isRemote } from '../config.js'
import { db, pool } from './client.js'

/**
 * Development only: drop everything and start clean.
 *
 * Drizzle records applied migrations in its own `drizzle` schema, so dropping
 * `public` alone leaves the bookkeeping behind and the next migrate reports
 * "up to date" against an empty database. Both have to go.
 */
// NODE_ENV is a promise; the host name is a fact. This script drops schemas,
// so it only ever runs against a Postgres on this machine.
if (process.env.NODE_ENV === 'production' || isRemote()) {
  console.error('Refusing to reset a database that is not local.')
  console.error(`DATABASE_URL points at ${new URL(config.DATABASE_URL).host}.`)
  process.exit(1)
}

await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
await db.execute(sql`CREATE SCHEMA public`)

console.log('database reset — run db:migrate next')
await pool.end()
