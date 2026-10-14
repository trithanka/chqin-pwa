import { useState } from 'react'
import { Download, UserPlus } from 'lucide-react'
import { api } from '../api'
import { canWrite, isOwner, useSession } from '../session'
import { useApi, usePaged } from '../useApi'
import { Async, Button, Id, Input, Json, Mono, PageHeader, PagedTable, Panel, Pill, Select, Status, Table, useAction, when } from '../ui'
import { useFilters } from './People'

/* ------------------------------------------------------------------ */
/* Outbox                                                              */
/* ------------------------------------------------------------------ */

export function Outbox() {
  const { admin } = useSession()
  const [f, set] = useFilters(['status', 'kind', 'venueId'])
  const page = usePaged('/outbox', f)
  const info = useApi(() => api.get('/outbox-info'))
  const [dialog, act] = useAction(page.reload)
  const [open, setOpen] = useState(null)

  const action = (m, verb) =>
    act({
      title: verb === 'retry' ? 'Retry this message' : 'Cancel this message',
      danger: verb === 'cancel',
      description: verb === 'retry' ? 'It goes back in the queue, due now, with a fresh set of attempts.' : 'It will never be sent. The row stays, marked cancelled.',
      reason: 'required',
      onSubmit: (v) => api.post(`/outbox/${m.id}/${verb}`, v),
    })

  const sender = info.data?.sender
  return (
    <>
      <PageHeader title="Outbox" subtitle="Every notification, written in the same transaction as what caused it and sent afterwards." />
      <Panel className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 p-3 text-[13px]">
        <span>
          Sender: {sender ? <Pill tone={sender === 'log' ? 'warn' : 'good'}>{sender}</Pill> : <Pill tone="bad">none</Pill>}
        </span>
        <span className="text-stone-400">
          {sender === 'log'
            ? 'Development: messages are printed to the API log and marked sent. Never for a real venue.'
            : sender
              ? 'Messages go to the WhatsApp provider; a failure retries with a growing delay, then fails after 5 attempts.'
              : 'Nothing sends. Messages wait here as pending. Set OUTBOX_SENDER on the API to choose a provider.'}
        </span>
      </Panel>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={f.status} onChange={(e) => set('status', e.target.value)} className="max-w-[160px]">
          <option value="">Any status</option>
          {['pending', 'sent', 'failed', 'cancelled'].map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={f.kind} onChange={(e) => set('kind', e.target.value)} className="max-w-[200px]">
          <option value="">Any kind</option>
          {(info.data?.kinds ?? []).map((k) => <option key={k}>{k}</option>)}
        </Select>
        {f.venueId && <Pill tone="info">venue <Id value={f.venueId} /> <button onClick={() => set('venueId', '')} className="ml-1">×</button></Pill>}
      </div>
      <PagedTable
        page={page}
        onRow={(m) => setOpen(open === m.id ? null : m.id)}
        columns={[
          { label: 'Created', render: (m) => when(m.createdAt) },
          { label: 'Venue', render: (m) => m.venue ?? '—' },
          { label: 'Kind', render: (m) => <Mono>{m.kind}</Mono> },
          { label: 'To', render: (m) => <Mono>{m.payload?.to ?? '—'}</Mono> },
          { label: 'Attempts', render: (m) => m.attempts },
          { label: 'Status', render: (m) => <Status value={m.status} /> },
          {
            label: 'Detail',
            render: (m) =>
              open === m.id ? (
                <div className="max-w-md space-y-2">
                  {m.lastError && <p className="text-red-300">{m.lastError}</p>}
                  <Json value={m.payload} />
                  <p className="text-stone-500">Due {when(m.runAfter)} · sent {when(m.sentAt)}</p>
                </div>
              ) : (
                <span className="text-red-300">{m.lastError?.slice(0, 60) ?? ''}</span>
              ),
          },
          {
            label: '',
            render: (m) =>
              canWrite(admin) && (
                <div onClick={(e) => e.stopPropagation()}>
                  {m.status === 'failed' && <Button size="sm" onClick={() => action(m, 'retry')}>Retry</Button>}
                  {m.status === 'pending' && <Button size="sm" onClick={() => action(m, 'cancel')}>Cancel</Button>}
                </div>
              ),
          },
        ]}
      />
      {dialog}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Auth events                                                         */
/* ------------------------------------------------------------------ */

export function AuthEvents() {
  const [f, set] = useFilters(['event', 'outcome', 'venueId', 'guestId', 'ip'])
  const page = usePaged('/auth-events', f)
  const names = useApi(() => api.get('/auth-event-names'))
  const [ip, setIp] = useState(f.ip)
  return (
    <>
      <PageHeader title="Auth events" subtitle="Every guest identity ceremony: passkeys, Aadhaar OTP, basic identity. Failures included." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={f.event} onChange={(e) => set('event', e.target.value)} className="max-w-[240px]">
          <option value="">Any event</option>
          {(names.data?.events ?? []).map((n) => <option key={n}>{n}</option>)}
        </Select>
        <Select value={f.outcome} onChange={(e) => set('outcome', e.target.value)} className="max-w-[140px]">
          <option value="">Any outcome</option>
          <option value="ok">ok</option>
          <option value="failed">failed</option>
        </Select>
        <form onSubmit={(e) => (e.preventDefault(), set('ip', ip.trim()))}>
          <Input placeholder="IP address" value={ip} onChange={(e) => setIp(e.target.value)} className="max-w-[200px]" />
        </form>
        {['venueId', 'guestId'].filter((k) => f[k]).map((k) => (
          <Pill key={k} tone="info">{k} <Id value={f[k]} /> <button onClick={() => set(k, '')} className="ml-1">×</button></Pill>
        ))}
      </div>
      <PagedTable
        page={page}
        columns={[
          { label: 'When', render: (a) => when(a.occurredAt) },
          { label: 'Event', render: (a) => <Mono>{a.event}</Mono> },
          { label: 'Outcome', render: (a) => <Status value={a.outcome} /> },
          { label: 'Venue', render: (a) => (a.venueId ? <button className="hover:text-amber-300" onClick={() => set('venueId', a.venueId)}>{a.venue ?? <Id value={a.venueId} />}</button> : '—') },
          { label: 'Guest', render: (a) => (a.guestId ? <button onClick={() => set('guestId', a.guestId)}><Id value={a.guestId} /></button> : '—') },
          { label: 'IP', render: (a) => <Mono>{a.ip ?? '—'}</Mono> },
          { label: 'Detail', render: (a) => <Mono className="text-stone-400">{JSON.stringify(a.detail).slice(0, 120)}</Mono> },
        ]}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Admin audit log                                                     */
/* ------------------------------------------------------------------ */

export function AuditLog() {
  const { admin } = useSession()
  const [f, set] = useFilters(['action', 'targetType', 'targetId', 'adminId', 'venueId', 'from', 'to'])
  const page = usePaged('/audit', f)
  const actions = useApi(() => api.get('/audit-actions'))
  const [problem, setProblem] = useState(null)

  const exportCsv = () =>
    api.download('/audit.csv', f, `chqin-admin-audit-${new Date().toISOString().slice(0, 10)}.csv`).catch((e) => setProblem(e.message))

  return (
    <>
      <PageHeader
        title="Admin audit log"
        subtitle="Every change, reveal and export made in this panel. Append-only."
        actions={isOwner(admin) && <Button icon={Download} onClick={exportCsv}>Export CSV</Button>}
      />
      {problem && <p className="mb-3 text-[13px] text-red-300">{problem}</p>}
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={f.action} onChange={(e) => set('action', e.target.value)} className="max-w-[220px]">
          <option value="">Any action</option>
          {(actions.data?.actions ?? []).map((a) => <option key={a}>{a}</option>)}
        </Select>
        <Select value={f.targetType} onChange={(e) => set('targetType', e.target.value)} className="max-w-[160px]">
          <option value="">Any target</option>
          {['venue', 'gate', 'flow', 'staff', 'guest', 'session', 'outbox', 'admin', 'host', 'event', 'audit', 'ops'].map((t) => <option key={t}>{t}</option>)}
        </Select>
        <Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} className="max-w-[160px]" />
        <Input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} className="max-w-[160px]" />
        {['targetId', 'adminId', 'venueId'].filter((k) => f[k]).map((k) => (
          <Pill key={k} tone="info">{k} <Id value={f[k]} /> <button onClick={() => set(k, '')} className="ml-1">×</button></Pill>
        ))}
      </div>
      <PagedTable
        page={page}
        columns={[
          { label: 'When', render: (l) => when(l.occurredAt) },
          { label: 'Who', render: (l) => <button className="text-left hover:text-amber-300" onClick={() => l.adminId && set('adminId', l.adminId)}>{l.adminName ?? <Id value={l.adminId} />}<br /><span className="text-stone-500">{l.role}</span></button> },
          { label: 'Action', render: (l) => <Mono className="text-amber-300">{l.action}</Mono> },
          { label: 'Target', render: (l) => (l.targetId ? <button onClick={() => set('targetId', l.targetId)}>{l.targetType} <Id value={l.targetId} /></button> : l.targetType ?? '—') },
          { label: 'Reason', render: (l) => l.reason ?? '—' },
          { label: 'Changes', render: (l) => <Mono className="text-stone-400">{Object.keys(l.changes ?? {}).length ? JSON.stringify(l.changes).slice(0, 160) : '—'}</Mono> },
          { label: 'IP', render: (l) => <Mono>{l.ip ?? '—'}</Mono> },
        ]}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Admin users (owner)                                                 */
/* ------------------------------------------------------------------ */

const ROLE_OPTIONS = ['owner', 'support', 'read_only'].map((r) => ({ value: r, label: r }))

export function Admins() {
  const { admin } = useSession()
  const list = useApi(() => api.get('/admins'))
  const [dialog, act] = useAction(list.reload)
  const [sessionsOf, setSessionsOf] = useState(null)

  const linkShown = (link, what) => ({
    show: (
      <>
        <p className="mb-2">Send this {what} link to them yourself. It works once and expires in 72 hours. It is not stored or shown again.</p>
        <Mono className="block break-all rounded bg-ink p-2">{link}</Mono>
      </>
    ),
  })

  const inviteDialog = () =>
    act({
      title: 'Invite an admin',
      description: 'They set a password and enrol an authenticator app from the link before they can sign in.',
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, defaultValue: 'read_only' },
      ],
      reason: 'optional',
      submitLabel: 'Create invite',
      onSubmit: async (v) => linkShown((await api.post('/admins', v)).link, 'invite'),
    })

  const roleDialog = (a) =>
    act({
      title: `Change ${a.name}`,
      fields: [
        { name: 'role', label: 'Role', type: 'select', options: ROLE_OPTIONS, defaultValue: a.role },
        { name: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'active' }, { value: 'disabled', label: 'disabled (signs them out)' }], defaultValue: a.status === 'disabled' ? 'disabled' : 'active' },
      ],
      reason: 'required',
      onSubmit: (v) => api.post(`/admins/${a.id}`, v),
    })

  const reset2fa = (a) =>
    act({
      title: `Reset two-factor for ${a.name}`,
      danger: true,
      description: 'Their current authenticator stops working and every session they hold ends. They enrol again from a new link.',
      reason: 'required',
      submitLabel: 'Reset 2FA',
      onSubmit: async (v) => linkShown((await api.post(`/admins/${a.id}/reset-2fa`, v)).link, 'two-factor reset'),
    })

  return (
    <>
      <PageHeader title="Admin users" subtitle="The ChqIn team. Owners only." actions={<Button tone="primary" icon={UserPlus} onClick={inviteDialog}>Invite</Button>} />
      <Async loading={list.loading} error={list.error} onRetry={list.reload}>
        <Panel>
          <Table
            rows={list.data?.admins}
            columns={[
              { label: 'Name', render: (a) => <>{a.name} {a.id === admin.adminId && <Pill tone="info">you</Pill>}</> },
              { label: 'Email', render: (a) => <Mono>{a.email}</Mono> },
              { label: 'Role', render: (a) => <Pill tone={a.role === 'owner' ? 'warn' : 'neutral'}>{a.role}</Pill> },
              { label: 'Status', render: (a) => <Status value={a.status} /> },
              { label: '2FA', render: (a) => (a.totpEnabledAt ? 'enrolled' : <span className="text-amber-300">pending</span>) },
              { label: 'Sessions', render: (a) => <button className="hover:text-amber-300" onClick={() => setSessionsOf(a)}>{a.sessions} active</button> },
              { label: 'Last sign-in', render: (a) => when(a.lastLoginAt) },
              {
                label: '',
                render: (a) =>
                  a.id !== admin.adminId && (
                    <div className="flex gap-1.5">
                      <Button size="sm" onClick={() => roleDialog(a)}>Change</Button>
                      <Button size="sm" onClick={() => reset2fa(a)}>Reset 2FA</Button>
                    </div>
                  ),
              },
            ]}
          />
        </Panel>
      </Async>
      {sessionsOf && <AdminSessions admin={sessionsOf} onClose={() => setSessionsOf(null)} />}
      {dialog}
    </>
  )
}

function AdminSessions({ admin, onClose }) {
  const sessions = useApi(() => api.get(`/admins/${admin.id}/sessions`), [admin.id])
  const [dialog, act] = useAction(sessions.reload)
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-lg overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-[16px] font-semibold text-white">{admin.name}: sessions</h2>
        <Button size="sm" tone="ghost" onClick={onClose}>Close</Button>
      </div>
      <Table
        rows={sessions.data?.sessions}
        empty="No sessions."
        columns={[
          { label: 'Signed in', render: (s) => when(s.createdAt) },
          { label: 'Last seen', render: (s) => when(s.lastSeenAt) },
          { label: 'IP', render: (s) => <Mono>{s.ip ?? '—'}</Mono> },
          { label: '2FA', render: (s) => (s.mfaAt ? 'yes' : 'no') },
          { label: 'State', render: (s) => <Status value={s.active ? 'active' : s.revokedAt ? 'revoked' : 'expired'} /> },
          { label: '', render: (s) => s.active && <Button size="sm" onClick={() => act({ title: 'End this session', reason: 'required', onSubmit: (v) => api.post(`/admin-sessions/${s.id}/revoke`, v) })}>End</Button> },
        ]}
      />
      {dialog}
    </div>
  )
}
