import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

/**
 * Load env before anything reads it. Every entry point — the server, the
 * migration scripts, drizzle.config.js — comes through this module, so this is
 * the one place it has to happen.
 *
 * `CHQIN_ENV=supabase` loads .env.supabase *first*, and neither loadEnvFile nor
 * the shell overwrites a variable that is already set — so first write wins and
 * .env fills in whatever the named file didn't say. That matters because
 * DATABASE_URL and DIRECT_URL have to move together: switching one and not the
 * other points the app at one database while migrations hit another.
 */
const load = (file) => {
  try {
    process.loadEnvFile(new URL(file, import.meta.url))
  } catch {
    /* absent: the next file, or the defaults below, apply */
  }
}

if (process.env.CHQIN_ENV) load(`../.env.${process.env.CHQIN_ENV}`)
load('../.env')

/**
 * Env, parsed once at boot. A missing RP ID or a typo'd origin should stop the
 * process here, not surface as a failed ceremony in a lobby.
 */

const schema = z.object({
  DATABASE_URL: z.string().default('postgres://chqin:chqin@localhost:5439/chqin'),
  // Migrations need a session-mode connection: transaction pooling breaks
  // anything spanning statements, which is what a migration runner does.
  // Falls back to DATABASE_URL, which is correct for a direct local Postgres.
  DIRECT_URL: z.string().optional(),
  PORT: z.coerce.number().default(8787),
  PG_POOL_MAX: z.coerce.number().default(10),

  // Credentials bind to the RP ID, which is a hostname. Changing it in
  // production invalidates every enrolled passkey.
  RP_ID: z.string().default('localhost'),
  RP_NAME: z.string().default('ChqIn'),
  // Several in dev because Vite moves ports; exactly one in production.
  ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5174')
    .transform((value) => value.split(',').map((o) => o.trim()).filter(Boolean)),

  HASH_PEPPER: z.string().default('dev-only-pepper-change-me'),

  CHALLENGE_TTL_MS: z.coerce.number().default(120_000),
  SESSION_TTL_MS: z.coerce.number().default(300_000),
})

/**
 * node-postgres lets `sslmode` in the connection string override the `ssl`
 * object passed alongside it, which silently discards the pinned CA and then
 * fails with SELF_SIGNED_CERT_IN_CHAIN. TLS is decided by `sslFor` below, so
 * the parameter is stripped here rather than fought with at each call site.
 */
const stripSslMode = (url) => url?.replace(/([?&])sslmode=[^&]*&?/, '$1').replace(/[?&]$/, '')

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const config = {
  ...parsed.data,
  DATABASE_URL: stripSslMode(parsed.data.DATABASE_URL),
  DIRECT_URL: stripSslMode(parsed.data.DIRECT_URL),
}

/** True for anything that isn't a Postgres on this machine. */
export const isRemote = (url = config.DATABASE_URL) =>
  !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)

/**
 * Hosted Postgres speaks TLS; a local container doesn't.
 *
 * Supabase signs its pooler certificates with its own root, which isn't in
 * Node's trust store — so the chain is verified against that CA rather than
 * turning verification off. `rejectUnauthorized: false` would encrypt the
 * connection while accepting any certificate, which is the half of TLS that
 * doesn't stop anyone.
 */
const CA_PATH = new URL('../certs/supabase-ca.crt', import.meta.url)
const ca = existsSync(CA_PATH) ? readFileSync(CA_PATH, 'utf8') : undefined

export const sslFor = (url) =>
  isRemote(url) ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false

if (config.HASH_PEPPER.startsWith('dev-only') && process.env.NODE_ENV === 'production') {
  console.error('HASH_PEPPER is still the development default. Refusing to start.')
  process.exit(1)
}
