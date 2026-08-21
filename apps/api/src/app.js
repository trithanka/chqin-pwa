import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { sql } from 'drizzle-orm'
import { config } from './config.js'
import { db } from './db/client.js'
import { handleError } from './lib/errors.js'
import { checkin } from './routes/checkin.js'
import { detect } from './routes/detect.js'
import { identity } from './routes/identity.js'
import { places } from './routes/places.js'
import { sessions } from './routes/sessions.js'
import { staff } from './routes/staff.js'
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

/**
 * A private-network address, the kind Vite prints as its "Network" URL.
 *
 * Testing onboarding on an actual phone means opening the dashboard at
 * http://10.x.x.x:5174, and that origin is not in ORIGINS — the request is
 * refused at the preflight and looks like the API is broken. Allowing it in
 * development is the difference between testing on a phone and not.
 */
const privateOrigin = (origin) => {
  let host
  try {
    ;({ hostname: host } = new URL(origin))
  } catch {
    return false
  }
  return (
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host.endsWith('.local')
  )
}

app.use(
  '/*',
  cors({
    // Never in production: there the allowed origin is exactly what ORIGINS
    // says, because a wildcard with credentials is how a session gets read by
    // a site that isn't ours.
    origin: (origin) =>
      config.ORIGINS.includes(origin)
        ? origin
        : process.env.NODE_ENV !== 'production' && privateOrigin(origin)
          ? origin
          : null,
    credentials: true,
  }),
)

/**
 * Health, with enough detail to diagnose a deploy.
 *
 * A bare 500 says "something is wrong" and nothing else — the two failures
 * that actually happen are "DATABASE_URL was never set, so it's dialling
 * localhost" and "TLS won't verify", and both are obvious the moment the host
 * and the error code are visible. Neither reveals a credential: `URL.host`
 * drops any user and password.
 */
app.get('/health', async (c) => {
  const database = { host: new URL(config.DATABASE_URL).host, connected: false, error: null }

  try {
    const result = await db.execute(sql`select 1 as ok`)
    database.connected = result.rows[0].ok === 1
  } catch (err) {
    // Drizzle wraps driver errors, so the useful part (ECONNREFUSED,
    // SELF_SIGNED_CERT_IN_CHAIN, 28P01) is on the cause, not the top level.
    database.error = err.cause?.code ?? err.cause?.message ?? err.code ?? err.message
  }

  return c.json(
    { ok: database.connected, rpId: config.RP_ID, database },
    database.connected ? 200 : 503,
  )
})

app.route('/sessions', sessions)
app.route('/detect', detect)
app.route('/identity', identity)
app.route('/webauthn', webauthn)
app.route('/checkin', checkin)

// Place lookup for onboarding. Public: it runs before an account exists.
app.route('/places', places)

// The venue-facing surface. Guest routes are semi-public — a QR token is the
// entry ticket; these need an account, and every read filters by venue.
app.route('/staff', staff)

app.onError(handleError)
