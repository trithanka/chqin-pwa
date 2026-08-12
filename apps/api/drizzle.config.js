import { defineConfig } from 'drizzle-kit'

/**
 * The schema files are the source of truth; SQL under drizzle/ is generated.
 *
 * `db:generate` writes a migration, `db:migrate` applies it — that pair is
 * what production uses. `db:push` skips the migration file and syncs the
 * database directly, which is fine while iterating locally and never on a
 * database with real guests in it.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.js',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://chqin:chqin@localhost:5439/chqin',
  },
  verbose: true,
  strict: true,
})
