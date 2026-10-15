import { Hono } from 'hono'
import { z } from 'zod'
import { invalid } from '../../../shared/lib/errors.js'
import { body } from '../../../shared/lib/validate.js'
import { adminRecord, adminWrite } from '../services/audit.js'
import { toCsv } from '../services/logs.js'
import { opsInfo, purge, reports } from '../services/ops.js'
import { OWNER, WRITE } from './guard.js'

/** Reports and platform operations. */
export const opsRoutes = new Hono()

const DATE = /^\d{4}-\d{2}-\d{2}$/
const params = (c) => {
  const { from, to, venueId } = c.req.query()
  for (const d of [from, to]) if (d && !DATE.test(d)) throw invalid('Dates are YYYY-MM-DD.')
  return { from, to, venueId }
}

opsRoutes.get('/reports', async (c) => c.json(await reports(params(c))))

const TABLES = {
  daily: ['day', 'venue', 'entries'],
  venues: ['venue', 'kind', 'entries', 'avgScanToAdmitSeconds', 'withoutGuest'],
  approvals: ['venue', 'approved', 'declined', 'undecided', 'avgWaitSeconds'],
  journeys: ['journey', 'entries'],
  identity: ['method', 'result', 'checks'],
}

opsRoutes.get('/reports.csv', WRITE, async (c) => {
  const table = c.req.query('table') ?? 'venues'
  if (!TABLES[table]) return c.json({ error: 'invalid_request', message: 'Unknown table.' }, 400)
  const filters = params(c)
  const data = await reports(filters)
  await adminRecord(c, { action: 'reports.export', targetType: 'reports', changes: { table, ...data.range, venueId: filters.venueId ?? null } })
  return c.body(toCsv(data[table], TABLES[table]), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="chqin-${table}-${data.range.from}-${data.range.to}.csv"`,
  })
})

opsRoutes.get('/ops', async (c) => c.json(await opsInfo()))

opsRoutes.post('/ops/purge', OWNER, body(z.object({ reason: z.string().max(500) })), async (c) =>
  c.json(await adminWrite(c, { action: 'ops.purge', targetType: 'ops', reason: c.get('body').reason, needsReason: true }, (tx) => purge(tx))),
)
