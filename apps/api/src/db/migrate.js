import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, pool } from './client.js'

/**
 * Applies everything in drizzle/ that hasn't run yet, tracked in
 * drizzle.__drizzle_migrations. Forward only — rolling back a schema with real
 * guests in it is a restore, not a down-migration.
 */
const folder = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'drizzle')

await migrate(db, { migrationsFolder: folder })
console.log('migrations up to date')
await pool.end()
