import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { config, sslFor } from '../config.js'

/**
 * Applies everything in drizzle/ that hasn't run yet, tracked in
 * drizzle.__drizzle_migrations. Forward only — rolling back a schema with real
 * guests in it is a restore, not a down-migration.
 */
const folder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle')

// Its own connection, not the app pool: migrations want session mode, and a
// transaction pooler would drop the locks the runner relies on.
const url = config.DIRECT_URL ?? config.DATABASE_URL
const pool = new pg.Pool({ connectionString: url, max: 1, ssl: sslFor(url) })

await migrate(drizzle(pool), { migrationsFolder: folder })
console.log('migrations up to date')
await pool.end()
