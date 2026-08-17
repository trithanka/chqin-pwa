import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'

// Load .env before anything reads process.env. Every entry point — the server,
// the migration scripts, drizzle.config.js — comes through this module, so this
// is the one place it has to happen.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url))
} catch {
  /* no .env file: the defaults below apply */
}

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
  // Hosts that don't ship the repo's files (serverless bundles) can pass the
  // database's CA certificate directly instead.
  PG_CA_CERT: z.string().optional(),

  /**
   * The staff session cookie's SameSite attribute.
   *
   * 'Lax' is right when the API shares a site with the dashboard
   * (api.chqin.in ↔ business.chqin.in). If the API lives somewhere else —
   * onrender.com, say — the cookie is third-party and Lax means the browser
   * never sends it: login succeeds and every request after it is 401.
   * 'None' allows that, at the cost of relying on third-party cookies, which
   * Safari already blocks and Chrome is phasing out.
   */
  COOKIE_SAMESITE: z.enum(['Lax', 'Strict', 'None']).default('Lax'),

  CHALLENGE_TTL_MS: z.coerce.number().default(120_000),
  SESSION_TTL_MS: z.coerce.number().default(300_000),

  /**
   * Sandbox (sandbox.co.in) — the KUA behind the Aadhaar OKYC check.
   *
   * Absent, identity verification falls back to a simulation, which is why the
   * guard at the bottom of this file refuses to start production without them:
   * a missing env var must not quietly turn invented demographics into a
   * `passed` verification.
   *
   * Live keys only work against the production host; test keys only against
   * test-api. A mismatched pair fails at /authenticate, looking like a bad key.
   */
  SANDBOX_API_KEY: z.string().optional(),
  SANDBOX_API_SECRET: z.string().optional(),
  SANDBOX_BASE_URL: z.string().default('https://api.sandbox.co.in'),
  // Sent to UIDAI and shown in Sandbox's transaction log; keep it truthful.
  SANDBOX_KYC_REASON: z.string().default('Hotel guest check-in identity verification'),
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
const ca =
  process.env.PG_CA_CERT ?? (existsSync(CA_PATH) ? readFileSync(CA_PATH, 'utf8') : undefined)

export const sslFor = (url) =>
  isRemote(url) ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false

if (config.HASH_PEPPER.startsWith('dev-only') && process.env.NODE_ENV === 'production') {
  console.error('HASH_PEPPER is still the development default. Refusing to start.')
  process.exit(1)
}

if (
  process.env.NODE_ENV === 'production' &&
  !(config.SANDBOX_API_KEY && config.SANDBOX_API_SECRET)
) {
  console.error('SANDBOX_API_KEY/SANDBOX_API_SECRET are missing, so identity checks would be simulated. Refusing to start.')
  process.exit(1)
}
