import { handle } from 'hono/vercel'
import { app } from '../src/app.js'

/**
 * Vercel entry point.
 *
 * `src/index.js` starts a long-running Node server for local work; Vercel
 * wants a request handler instead, so this wraps the same Hono app. Both use
 * the identical routes — there is no second copy of the API to keep in sync.
 *
 * Node runtime, not Edge: the Postgres driver needs TCP sockets.
 */
export const config = { runtime: 'nodejs' }

export default handle(app)
