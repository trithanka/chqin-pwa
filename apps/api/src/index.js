import { serve } from '@hono/node-server'
import { app } from './app.js'
import { config } from './config.js'
import { pool } from './db/client.js'

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.log(`ChqIn API on http://localhost:${info.port}  (RP ID: ${config.RP_ID})`)
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
