import { z } from 'zod'

/**
 * Env, parsed once at boot. A missing RP ID or a typo'd origin should stop the
 * process here, not surface as a failed ceremony in a lobby.
 */

const schema = z.object({
  DATABASE_URL: z.string().default('postgres://chqin:chqin@localhost:5439/chqin'),
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

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment:', z.treeifyError(parsed.error))
  process.exit(1)
}

export const config = parsed.data

if (config.HASH_PEPPER.startsWith('dev-only') && process.env.NODE_ENV === 'production') {
  console.error('HASH_PEPPER is still the development default. Refusing to start.')
  process.exit(1)
}
