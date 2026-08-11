import { createHash, createHmac, randomBytes } from 'node:crypto'
import pg from 'pg'

/**
 * One pool for the process. Check-in traffic is bursty (everyone arrives
 * between 2 and 6pm) but low volume — a modest pool with a short connect
 * timeout fails fast instead of queueing a lobby full of guests.
 */
export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://chqin:chqin@localhost:5439/chqin',
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const query = (text, params) => pool.query(text, params)

/** Run a unit of work in a transaction, releasing the client either way. */
export async function transaction(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

const PEPPER = process.env.HASH_PEPPER ?? 'dev-only-pepper-change-me'

/**
 * Keyed hash for lookup columns. A bare SHA-256 of an email or phone number is
 * offline-attackable — the input space is small and guessable — so the digest
 * is keyed with a server-side secret the database itself never holds.
 */
export const lookupHash = (value) =>
  value ? createHmac('sha256', PEPPER).update(value.trim().toLowerCase()).digest() : null

/** Session tokens are high-entropy already, so a plain digest is enough. */
export const tokenHash = (token) => createHash('sha256').update(token).digest()

export const newSessionToken = () => randomBytes(32).toString('base64url')
