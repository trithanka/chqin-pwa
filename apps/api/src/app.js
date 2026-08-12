import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db } from './db/client.js'
import { handleError } from './lib/errors.js'
import { checkin } from './routes/checkin.js'
import { detect } from './routes/detect.js'
import { identity } from './routes/identity.js'
import { sessions } from './routes/sessions.js'
import { webauthn } from './routes/webauthn.js'

/**
 * ChqIn API — the WebAuthn relying party and the check-in state machine.
 *
 * The rule this app exists to enforce: the *server* decides the journey and
 * the *server* verifies the passkey. The client holds hints and renders; it
 * never asserts who the guest is.
 *
 * Routes are thin, services hold the rules, and everything that writes more
 * than one row runs in a transaction.
 */

export const app = new Hono()

app.use('/*', cors({ origin: config.ORIGINS, credentials: true }))

app.get('/health', async (c) => {
  const result = await db.execute(sql`select 1 as ok`)
  return c.json({ ok: result.rows[0].ok === 1, rpId: config.RP_ID })
})

app.route('/sessions', sessions)
app.route('/detect', detect)
app.route('/identity', identity)
app.route('/webauthn', webauthn)
app.route('/checkin', checkin)

app.onError(handleError)
