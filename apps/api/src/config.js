import { existsSync, readFileSync } from 'node:fs'
import { z } from 'zod'
import { SIMULATE_AADHAAR } from './devFlags.js'

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

  /**
   * Key for the encrypted columns — today, staff and guest email addresses.
   * 32 bytes, base64. Separate from HASH_PEPPER on purpose: one finds a row,
   * the other reads it, and a leak of either should not be a leak of both.
   *
   * Generate with: node -e "console.log(crypto.randomBytes(32).toString('base64'))"
   */
  ENCRYPTION_KEY: z.string().default('ZGV2LW9ubHkta2V5LWNoYW5nZS1tZS0zMi1ieXRlcyE='),

  /**
   * Resend, for password reset and address verification. Absent, the mail
   * body is printed to the log instead of sent — which is what you want
   * locally and is refused in production by the guard at the bottom.
   */
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM: z.string().default('ChqIn <no-reply@chqin.in>'),
  /** Where the links inside those emails point. */
  DASHBOARD_URL: z.string().default('http://localhost:5174'),
  /** How long a reset or verification link stays usable. */
  MAIL_TOKEN_TTL_MS: z.coerce.number().default(60 * 60_000),
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
   * Identifies this deployment to Nominatim, whose usage policy asks for a way
   * to contact whoever is making the requests. A shared or absent identity is
   * what gets an application blocked.
   */
  CONTACT_URL: z.string().default('https://chqin.in'),

  /**
   * Google Places (New). Optional: without it, place search falls back to
   * Nominatim, which is free but thin on hotels outside Europe. With it, the
   * key is used server-side only — a browser key would be scraped and billed
   * to us.
   */
  GOOGLE_PLACES_KEY: z.string().optional(),

  /**
   * Forces the Aadhaar simulation even when TrueID credentials are present.
   *
   * The same switch as `SIMULATE_AADHAAR` in devFlags.js — either one turns it
   * on. Flipping the constant is the usual way; this exists for a machine
   * where you would rather not touch the code. Production refuses to start
   * with either on; see the guard at the bottom of this file.
   */
  SIMULATE_AADHAAR: z
    .string()
    .default('false')
    .transform((v) => ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())),

  /**
   * TrueID (truid.one) — the KUA behind the Aadhaar OKYC check.
   *
   * Absent, identity verification falls back to a simulation, which is why the
   * guard at the bottom of this file refuses to start production without them:
   * a missing env var must not quietly turn invented demographics into a
   * `passed` verification.
   *
   * The key decides the environment — a TEST_ key and a live key use the same
   * base URL. Callers are also IP-whitelisted per environment, so a correct key
   * from an unlisted address fails with 403, not 401.
   */
  TRUID_KEY_ID: z.string().optional(),
  TRUID_KEY_SECRET: z.string().optional(),
  TRUID_BASE_URL: z.string().default('https://service-api.truid.one/api/v1'),
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

/**
 * Whether the Aadhaar simulation is on, from either switch: the constant in
 * devFlags.js, or SIMULATE_AADHAAR in .env.
 */
export const simulateAadhaar = () => SIMULATE_AADHAAR || config.SIMULATE_AADHAAR

/** Which of the two turned it on, for the boot line. */
export const simulateAadhaarSource = () =>
  SIMULATE_AADHAAR ? 'src/devFlags.js' : config.SIMULATE_AADHAAR ? '.env' : null

export const sslFor = (url) =>
  isRemote(url) ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : false

if (config.HASH_PEPPER.startsWith('dev-only') && process.env.NODE_ENV === 'production') {
  console.error('HASH_PEPPER is still the development default. Refusing to start.')
  process.exit(1)
}

if (process.env.NODE_ENV === 'production') {
  // Same reasoning as the pepper: the default key is public, so anything
  // written under it is plaintext to anyone holding this repository.
  if (config.ENCRYPTION_KEY.startsWith('ZGV2LW9ubHkt')) {
    console.error('ENCRYPTION_KEY is still the development default. Refusing to start.')
    process.exit(1)
  }
  // Without a mail provider, password reset silently becomes a log line and
  // a locked-out owner has no way back in.
  if (!config.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is missing, so password reset mail cannot be sent. Refusing to start.')
    process.exit(1)
  }
}

if (
  process.env.NODE_ENV === 'production' &&
  !(config.TRUID_KEY_ID && config.TRUID_KEY_SECRET)
) {
  console.error('TRUID_KEY_ID/TRUID_KEY_SECRET are missing, so identity checks would be simulated. Refusing to start.')
  process.exit(1)
}

// Credentials present and simulation forced is the more dangerous shape of the
// same mistake: it looks configured, and every guest passes.
//
// This was briefly a warning rather than a refusal, so the hosted deploy could
// run as a demo without billing UIDAI. It is a refusal again: real guests check
// in against this deploy now, and a flag left on turns the Aadhaar check into
// decoration while the records it writes stay indistinguishable from verified
// ones. A demo that needs simulation can run without credentials instead.
if (process.env.NODE_ENV === 'production' && simulateAadhaar()) {
  console.error(
    `\n${'!'.repeat(72)}\n` +
      `  SIMULATED AADHAAR IN PRODUCTION (${simulateAadhaarSource()})\n` +
      '  No UIDAI call would be made and any six-digit code would pass.\n' +
      '  Refusing to start.\n' +
      `${'!'.repeat(72)}\n`,
  )
  process.exit(1)
}
