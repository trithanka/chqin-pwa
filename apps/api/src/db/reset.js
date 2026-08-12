import { sql } from 'drizzle-orm'
import { db, pool } from './client.js'

/**
 * Development only: drop everything and start clean.
 *
 * Drizzle records applied migrations in its own `drizzle` schema, so dropping
 * `public` alone leaves the bookkeeping behind and the next migrate reports
 * "up to date" against an empty database. Both have to go.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to reset a production database.')
  process.exit(1)
}

await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`)
await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`)
await db.execute(sql`CREATE SCHEMA public`)

console.log('database reset — run db:migrate next')
await pool.end()
