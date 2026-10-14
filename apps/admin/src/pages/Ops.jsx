import { useState } from 'react'
import { AlertTriangle, Download, Trash2 } from 'lucide-react'
import { api } from '../api'
import { canWrite, isOwner, useSession } from '../session'
import { useApi } from '../useApi'
import { Async, Button, Input, Mono, PageHeader, Panel, Pill, Rows, Status, Table, useAction } from '../ui'
import { useFilters } from './People'

const secs = (s) => (s == null ? '—' : s < 120 ? `${s}s` : s < 7200 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`)
const pct = (a, b) => (a + b ? `${Math.round((100 * a) / (a + b))}%` : '—')

function Section({ title, table, filters, children, write }) {
  const [problem, setProblem] = useState(null)
  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-white">{title}</h3>
        {write && (
          <Button
            size="sm"
            icon={Download}
            onClick={() => api.download('/reports.csv', { ...filters, table }, `chqin-${table}.csv`).catch((e) => setProblem(e.message))}
          >
            CSV
          </Button>
        )}
      </div>
      {problem && <p className="mb-2 text-[13px] text-red-300">{problem}</p>}
      <Panel>{children}</Panel>
    </div>
  )
}

export function Reports() {
  const { admin } = useSession()
  const [f, set] = useFilters(['from', 'to', 'venueId'])
  const report = useApi(() => api.get('/reports', f), [f.from, f.to, f.venueId])
  const r = report.data
  const write = canWrite(admin)
  const filters = { from: r?.range.from, to: r?.range.to, venueId: f.venueId }

  return (
    <>
      <PageHeader title="Reports" subtitle="Across every venue, for a date range (venue local days, IST). Defaults to the last 30 days." />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px] text-stone-400">
        <Input type="date" value={f.from || r?.range.from || ''} onChange={(e) => set('from', e.target.value)} className="max-w-[160px]" />
        to
        <Input type="date" value={f.to || r?.range.to || ''} onChange={(e) => set('to', e.target.value)} className="max-w-[160px]" />
        {f.venueId && <Pill tone="info">one venue <button onClick={() => set('venueId', '')} className="ml-1">×</button></Pill>}
      </div>
      <Async loading={report.loading && !r} error={report.error} onRetry={report.reload}>
        {r && (
          <>
            <Section title="By venue" table="venues" filters={filters} write={write}>
              <Table
                rows={r.venues}
                empty="No entries in this range."
                onRow={(v) => set('venueId', v.venueId)}
                columns={[
                  { label: 'Venue', render: (v) => v.venue },
                  { label: 'Kind', render: (v) => v.kind },
                  { label: 'Entries', render: (v) => v.entries },
                  { label: 'Avg scan → admit', render: (v) => secs(v.avgScanToAdmitSeconds) },
                  { label: 'Without a person', render: (v) => v.withoutGuest },
                ]}
              />
            </Section>

            <Section title="Host approval" table="approvals" filters={filters} write={write}>
              <Table
                rows={r.approvals}
                empty="No visits waited for a host in this range."
                columns={[
                  { label: 'Venue', render: (a) => a.venue },
                  { label: 'Approved', render: (a) => a.approved },
                  { label: 'Declined', render: (a) => a.declined },
                  { label: 'Undecided', render: (a) => a.undecided },
                  { label: 'Approval rate', render: (a) => pct(a.approved, a.declined) },
                  { label: 'Avg wait', render: (a) => secs(a.avgWaitSeconds) },
                ]}
              />
            </Section>

            <div className="grid gap-x-4 lg:grid-cols-2">
              <Section title="Hotel journeys" table="journeys" filters={filters} write={write}>
                <Table
                  rows={r.journeys}
                  empty="No hotel arrivals in this range."
                  columns={[
                    { label: 'Journey', render: (j) => ({ returning: 'returning', newDevice: 'new device', firstTime: 'first time', desk: 'at the desk' })[j.journey] ?? j.journey },
                    { label: 'Entries', render: (j) => j.entries },
                  ]}
                />
              </Section>
              <Section title="Identity methods" table="identity" filters={filters} write={write}>
                <Table
                  rows={r.identity}
                  empty="No identity checks in this range."
                  columns={[
                    { label: 'Method', render: (i) => <Mono>{i.method}</Mono> },
                    { label: 'Result', render: (i) => <Status value={i.result} /> },
                    { label: 'Checks', render: (i) => i.checks },
                  ]}
                />
              </Section>
            </div>

            <Section title="Entries per venue per day" table="daily" filters={filters} write={write}>
              <Table
                rows={r.daily}
                empty="No entries in this range."
                columns={[
                  { label: 'Day', render: (d) => d.day },
                  { label: 'Venue', render: (d) => d.venue },
                  { label: 'Entries', render: (d) => d.entries },
                ]}
              />
            </Section>
          </>
        )}
      </Async>
    </>
  )
}

export function Operations() {
  const { admin } = useSession()
  const ops = useApi(() => api.get('/ops'))
  const [dialog, act] = useAction(ops.reload)
  const o = ops.data

  const purge = () =>
    act({
      title: 'Purge expired rows',
      description: 'Open sessions past their expiry are marked expired. Used or expired challenges are deleted, and so are revoked or expired staff and admin sessions and links older than a week. Entries and audit logs are never touched.',
      reason: 'required',
      submitLabel: 'Purge',
      onSubmit: async (v) => {
        const out = await api.post('/ops/purge', v)
        return { show: <Rows items={Object.entries(out).map(([k, n]) => [k, n])} /> }
      },
    })

  return (
    <>
      <PageHeader title="Operations" subtitle="The environment this API runs in, its migrations, and housekeeping. Read-only except the purge." />
      <Async loading={ops.loading} error={ops.error} onRetry={ops.reload}>
        {o && (
          <div className="space-y-6">
            {o.warnings.map((w) => (
              <Panel key={w} className="flex items-center gap-2 border-red-500/50 bg-red-950/40 p-3 text-[13px] text-red-200">
                <AlertTriangle size={16} /> {w}
              </Panel>
            ))}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <p className="mb-2 text-[12px] font-semibold text-stone-400">Environment</p>
                <Rows
                  items={[
                    ['NODE_ENV', o.environment.nodeEnv],
                    ['Database', <span key="d">{o.environment.database} {o.environment.remote ? <Pill tone="bad">remote</Pill> : <Pill>local</Pill>}</span>],
                    ['RP_ID', <Mono key="r">{o.environment.rpId}</Mono>],
                    ['OUTBOX_SENDER', o.environment.outboxSender ?? 'unset'],
                    ['SIMULATE_AADHAAR', o.environment.simulateAadhaar ? <Pill key="s" tone={o.environment.remote ? 'bad' : 'warn'}>on ({o.environment.simulateAadhaarSource})</Pill> : 'off'],
                    ['ADMIN_ALLOW_DESTRUCTIVE', o.environment.adminAllowDestructive ? 'on' : 'off'],
                    ['ADMIN_IP_ALLOWLIST', o.environment.adminIpAllowlist ? `${o.environment.adminIpAllowlist} entries` : 'empty'],
                    ['ADMIN_CLIENT_IP_HEADER', o.environment.adminClientIpHeader ?? 'unset (socket address)'],
                  ]}
                />
              </Panel>
              <Panel className="p-4">
                <p className="mb-2 text-[12px] font-semibold text-stone-400">Aadhaar provider</p>
                <Rows
                  items={[
                    ['Mode', <Pill key="m" tone={o.aadhaar.mode === 'live' ? 'good' : 'warn'}>{o.aadhaar.mode}</Pill>],
                    ['Provider', o.aadhaar.provider],
                    ['Credentials', o.aadhaar.credentials ? 'present' : 'missing'],
                    ['Base URL', <Mono key="b">{o.aadhaar.baseUrl}</Mono>],
                  ]}
                />
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[12px] font-semibold text-stone-400">Cleanup</p>
                  {isOwner(admin) && <Button size="sm" icon={Trash2} onClick={purge}>Purge expired</Button>}
                </div>
                <Rows items={Object.entries(o.cleanup).map(([k, n]) => [k, n])} />
              </Panel>
            </div>
            <Panel>
              <p className="border-b border-line px-3 py-2 text-[12px] font-semibold text-stone-400">
                Migrations · {o.migrations.filter((m) => m.applied).length} of {o.migrations.length} applied
              </p>
              <Table
                rows={o.migrations.map((m) => ({ ...m, id: m.tag }))}
                columns={[
                  { label: 'Migration', render: (m) => <Mono>{m.tag}</Mono> },
                  { label: 'State', render: (m) => <Status value={m.applied ? 'applied' : 'pending'} /> },
                ]}
              />
            </Panel>
          </div>
        )}
      </Async>
      {dialog}
    </>
  )
}
