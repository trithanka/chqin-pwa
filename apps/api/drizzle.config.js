import { defineConfig } from 'drizzle-kit'
import { config } from './src/config.js'

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
  // The same config the server uses — a second hardcoded fallback here is how
  // `db:push` ends up pointed at a different database than the app.
  dbCredentials: { url: config.DATABASE_URL },
  verbose: true,
  strict: true,
})
