import { serve } from '@hono/node-server'
import { app } from './app.js'
import { pool } from './db.js'

const port = Number(process.env.PORT ?? 8787)

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`ChqIn API on http://localhost:${info.port}  (RP ID: ${process.env.RP_ID ?? 'localhost'})`)
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
