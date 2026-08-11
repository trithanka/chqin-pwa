import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool, query } from './db.js'

/**
 * Deliberately minimal: apply every .sql file in migrations/ once, in name
 * order, each in its own transaction, recording what ran. No down-migrations —
 * rolling forward is the only safe direction on a database with real guests in
 * it.
 */

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

await query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`)

const { rows } = await query('SELECT name FROM schema_migrations')
const applied = new Set(rows.map((r) => r.name))
const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()

let ran = 0
for (const file of files) {
  if (applied.has(file)) continue
  const sql = await readFile(join(migrationsDir, file), 'utf8')
  const client = await pool.connect()
  try {
    // The migration files carry their own BEGIN/COMMIT, so the bookkeeping
    // insert runs after the file's own transaction closes.
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
    console.log(`applied ${file}`)
    ran++
  } catch (err) {
    console.error(`failed ${file}: ${err.message}`)
    process.exitCode = 1
    break
  } finally {
    client.release()
  }
}

console.log(ran ? `${ran} migration(s) applied` : 'up to date')
await pool.end()
