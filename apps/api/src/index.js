import { serve } from '@hono/node-server'
import { app } from './app.js'
import { config, isRemote, simulateAadhaarSource } from './config.js'
import { liveAadhaar } from './lib/sandbox.js'
import { pool } from './db/client.js'

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  // The database line is here because .env is toggled by hand: knowing which
  // one you're on should not require reading a config file.
  const { host } = new URL(config.DATABASE_URL)
  console.log(`ChqIn API on http://localhost:${info.port}  (RP ID: ${config.RP_ID})`)
  console.log(`database → ${host}${isRemote() ? '  ⚠︎ remote' : '  (local)'}`)
  // Which world identity checks are running in, on the same line of sight as
  // the database — both are toggled by hand and both are easy to be wrong about.
  console.log(
    liveAadhaar()
      ? 'aadhaar  → sandbox (live UIDAI calls)'
      : `aadhaar  → simulated (${simulateAadhaarSource() ?? 'no sandbox credentials'}) — any 6-digit code passes`,
  )

  if (config.COOKIE_SAMESITE === 'None') {
    console.warn(
      'cookies  → SameSite=None: staff sessions rely on third-party cookies, ' +
        'which Safari blocks by default. Put the API on the same site as the ' +
        'dashboard (api.chqin.in) to fix this properly.',
    )
  }
})

// Drain in-flight requests and close the pool, so `node --watch` restarts and
// container stops don't leave half-finished transactions holding locks.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await pool.end()
      process.exit(0)
    })
  })
}
