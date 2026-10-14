import { api } from '../api'
import { useApi } from '../useApi'
import { Async, PageHeader, Panel, Pill, Rows, Stat, Status, when } from '../ui'

const age = (seconds) =>
  seconds == null ? 'none waiting' : seconds < 120 ? `${seconds}s` : seconds < 7200 ? `${Math.round(seconds / 60)} min` : `${Math.round(seconds / 3600)} h`

export default function Overview() {
  const stats = useApi(() => api.get('/overview'))
  const health = useApi(() => api.get('/health'))
  const o = stats.data
  const h = health.data

  return (
    <>
      <PageHeader title="Overview" subtitle="Every venue, every gate, right now." />
      <Async loading={stats.loading} error={stats.error} onRetry={stats.reload}>
        {o && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Venues" value={o.venues.total} sub={o.venues.byKind.map((k) => `${k.count} ${k.kind}`).join(' · ') || 'none yet'} />
              <Stat label="Gates" value={o.gates.active} sub={`${o.gates.revoked} revoked`} />
              <Stat label="Live sessions" value={o.sessions.active} sub={`${o.sessions.waiting} waiting`} tone={o.sessions.waiting ? 'warn' : undefined} />
              <Stat label="Entries today" value={o.entries.today} sub={`${o.entries.last7Days} in 7 days · ${o.entries.last30Days} in 30`} />
              <Stat label="Outbox pending" value={o.outbox.pending} sub={o.outbox.oldestPendingAt ? `oldest ${when(o.outbox.oldestPendingAt)}` : 'nothing queued'} tone={o.outbox.pending ? 'warn' : undefined} />
              <Stat label="Outbox failed" value={o.outbox.failed} tone={o.outbox.failed ? 'bad' : undefined} />
              <Stat label="Guests" value={o.guests} />
              <Stat label="Passkeys" value={o.passkeys} sub="not revoked" />
            </div>
          </div>
        )}
      </Async>

      <h2 className="mb-2 mt-8 text-[14px] font-semibold text-white">Health</h2>
      <Async loading={health.loading} error={health.error} onRetry={health.reload}>
        {h && (
          <Panel className="p-4">
            <Rows
              items={[
                ['API', <Status key="a" value={h.ok ? 'ok' : 'failed'} />],
                ['Database', <span key="d">{h.database.host} {h.database.remote ? <Pill tone="bad">remote</Pill> : <Pill>local</Pill>}</span>],
                ['Migrations', `${h.migrations.applied} of ${h.migrations.total} applied · last ${h.migrations.last ?? '—'}`],
                ['Outbox sender', h.outbox.sender ?? 'none (messages wait in the table)'],
                ['Outbox backlog age', age(h.outbox.oldestPendingAgeSeconds)],
                ['Aadhaar', <Pill key="aa" tone={h.environment.aadhaar === 'live' ? 'good' : 'warn'}>{h.environment.aadhaar}</Pill>],
                ['Environment', `${h.environment.nodeEnv} · RP ID ${h.environment.rpId}`],
              ]}
            />
          </Panel>
        )}
      </Async>
    </>
  )
}
