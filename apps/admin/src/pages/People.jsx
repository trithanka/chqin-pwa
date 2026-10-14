import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye } from 'lucide-react'
import { api } from '../api'
import { canWrite, isOwner, useSession } from '../session'
import { useApi, usePaged } from '../useApi'
import { Async, Button, Id, Input, Json, Mono, PageHeader, PagedTable, Panel, Pill, Rows, Select, Status, Table, useAction, when } from '../ui'

const Back = ({ to, label }) => (
  <Link to={to} className="mb-2 inline-flex items-center gap-1 text-[12px] text-stone-500 hover:text-stone-300">
    <ArrowLeft size={13} /> {label}
  </Link>
)

/** Filters that live in the URL, so a link from a venue opens the list already filtered. */
export function useFilters(keys) {
  const [params, setParams] = useSearchParams()
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? '']))
  const set = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  return [values, set]
}

/** Text that updates the URL only when submitted, so a search doesn't fire per keystroke. */
function SearchBox({ placeholder, value, onSubmit, className = 'max-w-xs' }) {
  const [text, setText] = useState(value)
  return (
    <form onSubmit={(e) => (e.preventDefault(), onSubmit(text.trim()))} className={`flex-1 ${className}`}>
      <Input placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
    </form>
  )
}

/* ------------------------------------------------------------------ */
/* Staff                                                               */
/* ------------------------------------------------------------------ */

export function StaffList() {
  const navigate = useNavigate()
  const [f, set] = useFilters(['email', 'q'])
  const page = usePaged('/staff', f)
  return (
    <>
      <PageHeader title="Staff accounts" subtitle="Venue staff, not admins. Search by exact email (keyed-hash lookup) or by name." />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox placeholder="Exact email" value={f.email} onSubmit={(v) => set('email', v)} />
        <SearchBox placeholder="Name contains" value={f.q} onSubmit={(v) => set('q', v)} />
      </div>
      <PagedTable
        page={page}
        onRow={(s) => navigate(`/staff/${s.id}`)}
        columns={[
          { label: 'Name', render: (s) => <><p className="text-white">{s.name}</p><Id value={s.id} /></> },
          { label: 'Email', render: (s) => <Mono>{s.email ?? '—'}</Mono> },
          { label: 'Venues', render: (s) => s.venueNames ?? '—' },
          { label: 'Verified', render: (s) => (s.emailVerifiedAt ? 'yes' : 'no') },
          { label: 'Status', render: (s) => <Status value={s.status} /> },
          { label: 'Last sign-in', render: (s) => when(s.lastLoginAt) },
        ]}
      />
    </>
  )
}

export function StaffDetail() {
  const { id } = useParams()
  const { admin } = useSession()
  const staff = useApi(() => api.get(`/staff/${id}`), [id])
  const [dialog, act] = useAction(staff.reload)
  const s = staff.data
  const write = canWrite(admin)

  const simple = (title, path, extra = {}, opts = {}) =>
    act({ title, reason: opts.reason ?? 'required', danger: opts.danger, description: opts.description, submitLabel: opts.submitLabel ?? 'Confirm', onSubmit: (v) => api.post(path, { ...extra, ...v }) })

  const changeRole = (m) =>
    act({
      title: `Role at ${m.venue}`,
      description: 'Their sessions at this venue end, so the new role applies from their next sign-in.',
      fields: [{ name: 'role', label: 'Role', type: 'select', options: ['owner', 'manager', 'frontdesk', 'approver'].map((r) => ({ value: r, label: r })), defaultValue: m.role }],
      reason: 'required',
      onSubmit: (v) => api.post(`/memberships/${m.id}/role`, v),
    })

  return (
    <>
      <Back to="/staff" label="Staff accounts" />
      <Async loading={staff.loading && !s} error={staff.error} onRetry={staff.reload}>
        {s && (
          <>
            <PageHeader
              title={s.name}
              subtitle={<><Mono>{s.email}</Mono> · <Status value={s.status} /></>}
              actions={
                write && (
                  <>
                    <Button onClick={() => simple('End every session', `/staff/${id}/revoke-sessions`, {}, { description: 'Signs them out everywhere, on the next request.' })}>Revoke sessions</Button>
                    <Button onClick={() => simple('Force a password reset', `/staff/${id}/password-reset`, {}, { danger: true, description: 'Their current password stops working now, every session ends, and a reset link goes to their email address through the usual mail service.' })}>Force reset</Button>
                    {!s.emailVerifiedAt && <Button onClick={() => simple('Mark email verified', `/staff/${id}/verify-email`, {}, { reason: 'optional' })}>Mark verified</Button>}
                    <Button
                      tone={s.status === 'active' ? 'danger' : 'secondary'}
                      onClick={() =>
                        simple(s.status === 'active' ? 'Deactivate account' : 'Reactivate account', `/staff/${id}/status`, { status: s.status === 'active' ? 'suspended' : 'active' }, { danger: s.status === 'active', description: s.status === 'active' ? 'They are signed out everywhere and cannot sign in.' : undefined })
                      }
                    >
                      {s.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </>
                )
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <Rows items={[['Id', <Mono key="i">{s.id}</Mono>], ['Email verified', when(s.emailVerifiedAt)], ['Created', when(s.createdAt)], ['Last sign-in', when(s.lastLoginAt)]]} />
              </Panel>
              <Panel>
                <Table
                  rows={s.memberships}
                  columns={[
                    { label: 'Venue', render: (m) => <Link to={`/venues/${m.venueId}`} className="hover:text-amber-300">{m.venue}</Link> },
                    { label: 'Kind', render: (m) => m.kind },
                    { label: 'Venue status', render: (m) => <Status value={m.venueStatus} /> },
                    { label: 'Role', render: (m) => <Pill>{m.role}</Pill> },
                    ...(write ? [{ label: '', render: (m) => <Button size="sm" onClick={() => changeRole(m)}>Change role</Button> }] : []),
                  ]}
                />
              </Panel>
            </div>
            <h3 className="mb-2 mt-6 text-[13px] font-semibold text-white">Sessions</h3>
            <Panel>
              <Table
                rows={s.sessions}
                empty="No sessions."
                columns={[
                  { label: 'Venue', render: (x) => x.venue },
                  { label: 'Role', render: (x) => x.role },
                  { label: 'Signed in', render: (x) => when(x.createdAt) },
                  { label: 'Expires', render: (x) => when(x.expiresAt) },
                  { label: 'State', render: (x) => <Status value={x.active ? 'active' : x.revokedAt ? 'revoked' : 'expired'} /> },
                ]}
              />
            </Panel>
          </>
        )}
      </Async>
      {dialog}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Guests                                                              */
/* ------------------------------------------------------------------ */

export function GuestList() {
  const navigate = useNavigate()
  const [f, set] = useFilters(['name', 'phone', 'email'])
  const page = usePaged('/guests', f)
  return (
    <>
      <PageHeader
        title="Guests"
        subtitle="Global identities. Name search is a prefix match; phone and email must be exact (keyed-hash lookup, there is no plaintext directory)."
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <SearchBox placeholder="Name starts with" value={f.name} onSubmit={(v) => set('name', v)} />
        <SearchBox placeholder="Exact phone" value={f.phone} onSubmit={(v) => set('phone', v)} />
        <SearchBox placeholder="Exact email" value={f.email} onSubmit={(v) => set('email', v)} />
      </div>
      <PagedTable
        page={page}
        onRow={(g) => navigate(`/guests/${g.id}`)}
        columns={[
          { label: 'Guest', render: (g) => <><p className="text-white">{g.name}</p><Id value={g.id} /></> },
          { label: 'Phone', render: (g) => <Mono>{g.phone ?? '—'}</Mono> },
          { label: 'Email', render: (g) => <Mono>{g.email ?? '—'}</Mono> },
          { label: 'Passkeys', render: (g) => g.passkeys },
          { label: 'Entries', render: (g) => g.entries },
          { label: 'Last entry', render: (g) => when(g.lastEntryAt) },
          { label: 'Status', render: (g) => <Status value={g.status} /> },
        ]}
      />
    </>
  )
}

export function GuestDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { admin } = useSession()
  const guest = useApi(() => api.get(`/guests/${id}`), [id])
  const [dialog, act] = useAction(guest.reload)
  const [revealed, setRevealed] = useState({})
  const g = guest.data
  const write = canWrite(admin)

  const reveal = (field) =>
    act({
      title: `Reveal ${field}`,
      description: 'The full value is shown once, here. Your name, the reason and the time go in the audit log before it is sent.',
      reason: 'required',
      submitLabel: 'Reveal',
      onSubmit: async ({ reason }) => {
        const out = await api.post(`/guests/${id}/reveal`, { field, reason })
        setRevealed((r) => ({ ...r, [field]: out[field] ?? '(none stored)' }))
      },
    })

  const erase = () =>
    act({
      title: `Erase ${g.name}`,
      danger: true,
      description: (
        <>
          Deletes the guest, their passkeys and contact details; clears what the identity check returned (name, date of birth, address), what they typed into
          forms, and their name on messages. <b>Entries are kept</b> with no guest attached, for the retention period. Cannot be undone. Refused on a hosted
          database unless the API allows destructive actions.
        </>
      ),
      reason: 'required',
      confirmPhrase: g.name,
      submitLabel: 'Erase guest',
      onSubmit: async (body) => {
        await api.post(`/guests/${id}/erase`, body)
        navigate('/guests')
      },
    })

  const masked = (field) => (
    <span className="inline-flex items-center gap-2">
      <Mono>{revealed[field] ?? g[field] ?? '—'}</Mono>
      {write && g[field] && !revealed[field] && (
        <Button size="sm" tone="ghost" icon={Eye} onClick={() => reveal(field)}>
          Reveal
        </Button>
      )}
    </span>
  )

  return (
    <>
      <Back to="/guests" label="Guests" />
      <Async loading={guest.loading && !g} error={guest.error} onRetry={guest.reload}>
        {g && (
          <>
            <PageHeader
              title={g.name}
              subtitle={<Status value={g.status} />}
              actions={
                write && (
                  <>
                    <Button
                      onClick={() =>
                        act({
                          title: g.status === 'active' ? 'Suspend guest' : 'Reactivate guest',
                          danger: g.status === 'active',
                          description: g.status === 'active' ? 'Their passkeys stop signing them in at every venue.' : undefined,
                          reason: 'required',
                          onSubmit: (v) => api.post(`/guests/${id}/status`, { status: g.status === 'active' ? 'suspended' : 'active', ...v }),
                        })
                      }
                    >
                      {g.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                    {isOwner(admin) && <Button tone="danger" onClick={erase}>Erase</Button>}
                  </>
                )
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <Rows
                  items={[
                    ['Id', <Mono key="i">{g.id}</Mono>],
                    ['Phone', masked('phone')],
                    ['Email', masked('email')],
                    ['Birth year', g.birthYear],
                    ['Gender', g.gender],
                    ['Created', when(g.createdAt)],
                  ]}
                />
              </Panel>
              <Panel>
                <p className="border-b border-line px-3 py-2 text-[12px] font-semibold text-stone-400">Passkeys</p>
                <Table
                  rows={g.credentials}
                  empty="No passkeys."
                  columns={[
                    { label: 'Device', render: (c) => c.deviceLabel ?? 'unnamed' },
                    { label: 'Created', render: (c) => when(c.createdAt) },
                    { label: 'Last used', render: (c) => when(c.lastUsedAt) },
                    { label: 'State', render: (c) => <Status value={c.revokedAt ? 'revoked' : 'active'} /> },
                    ...(write
                      ? [{ label: '', render: (c) => !c.revokedAt && <Button size="sm" onClick={() => act({ title: 'Revoke passkey', danger: true, description: 'This device can no longer sign the guest in.', reason: 'required', onSubmit: (v) => api.post(`/credentials/${c.id}/revoke`, v) })}>Revoke</Button> }]
                      : []),
                  ]}
                />
              </Panel>
            </div>
            <h3 className="mb-2 mt-6 text-[13px] font-semibold text-white">Identity checks</h3>
            <Panel>
              <Table
                rows={g.verifications}
                empty="No identity checks."
                columns={[
                  { label: 'Method', render: (v) => <Mono>{v.method}</Mono> },
                  { label: 'Result', render: (v) => <Status value={v.result} /> },
                  { label: 'Document', render: (v) => <Mono>{v.document ?? '—'}</Mono> },
                  { label: 'Provider', render: (v) => v.provider ?? '—' },
                  { label: 'Verified', render: (v) => when(v.verifiedAt) },
                  { label: 'Consent', render: (v) => (v.consent ? <Json value={v.consent} className="max-w-xs text-[10.5px]" /> : '—') },
                ]}
              />
            </Panel>
            <h3 className="mb-2 mt-6 text-[13px] font-semibold text-white">Entries across venues</h3>
            <Panel>
              <Table
                rows={g.entries}
                onRow={(e) => navigate(`/entries/${e.id}`)}
                empty="No entries."
                columns={[
                  { label: 'When', render: (e) => when(e.enteredAt) },
                  { label: 'Venue', render: (e) => e.venue },
                  { label: 'Gate', render: (e) => e.gate },
                  { label: 'Detail', render: (e) => e.journey ?? e.purpose ?? (e.company ? 'event' : '—') },
                  { label: 'Outcome', render: (e) => <Status value={e.outcome} /> },
                ]}
              />
            </Panel>
          </>
        )}
      </Async>
      {dialog}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Entries                                                             */
/* ------------------------------------------------------------------ */

export function EntryList() {
  const navigate = useNavigate()
  const [f, set] = useFilters(['venueId', 'gateId', 'guestId', 'outcome', 'from', 'to', 'idempotencyKey'])
  const page = usePaged('/entries', f)
  return (
    <>
      <PageHeader title="Entries" subtitle="Who got in, everywhere. The audit record of every admit." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input type="date" value={f.from} onChange={(e) => set('from', e.target.value)} className="max-w-[160px]" title="From" />
        <Input type="date" value={f.to} onChange={(e) => set('to', e.target.value)} className="max-w-[160px]" title="To" />
        <Select value={f.outcome} onChange={(e) => set('outcome', e.target.value)} className="max-w-[140px]">
          <option value="">Any outcome</option>
          <option value="admitted">admitted</option>
          <option value="denied">denied</option>
        </Select>
        <SearchBox placeholder="Idempotency key" value={f.idempotencyKey} onSubmit={(v) => set('idempotencyKey', v)} className="max-w-[220px]" />
        {['venueId', 'gateId', 'guestId'].filter((k) => f[k]).map((k) => (
          <Pill key={k} tone="info">
            {k} <Id value={f[k]} /> <button onClick={() => set(k, '')} className="ml-1">×</button>
          </Pill>
        ))}
      </div>
      <PagedTable
        page={page}
        onRow={(e) => navigate(`/entries/${e.id}`)}
        columns={[
          { label: 'When', render: (e) => when(e.enteredAt) },
          { label: 'Venue', render: (e) => <button className="hover:text-amber-300" onClick={(ev) => (ev.stopPropagation(), set('venueId', e.venueId))}>{e.venue}</button> },
          { label: 'Gate', render: (e) => e.gate },
          { label: 'Guest', render: (e) => e.guest ?? <span className="text-stone-500">none</span> },
          { label: 'Outcome', render: (e) => <Status value={e.outcome} /> },
          { label: 'Id', render: (e) => <Id value={e.id} /> },
        ]}
      />
    </>
  )
}

/** A trail as a timeline, with staff ids turned into names. */
export function Trail({ trail, staff = {} }) {
  if (!trail?.length) return <p className="text-[13px] text-stone-500">No trail.</p>
  return (
    <ol className="space-y-1.5">
      {trail.map((t, i) => {
        const { step, outcome, at, by, ...rest } = t
        return (
          <li key={i} className="flex flex-wrap items-baseline gap-2 text-[13px]">
            <span className="w-36 shrink-0 text-stone-500">{when(at)}</span>
            <Mono className="text-amber-300">{step}</Mono>
            <Status value={outcome === 'next' ? 'done' : outcome === 'wait' ? 'waiting' : outcome === 'reject' ? 'rejected' : outcome} />
            {by && <span className="text-stone-300">by {staff[by] ?? <Id value={by} />}</span>}
            {Object.keys(rest).length > 0 && <Mono className="text-stone-500">{JSON.stringify(rest)}</Mono>}
          </li>
        )
      })}
    </ol>
  )
}

export function EntryDetail() {
  const { id } = useParams()
  const entry = useApi(() => api.get(`/entries/${id}`), [id])
  const e = entry.data
  const d = e?.detail
  return (
    <>
      <Back to="/entries" label="Entries" />
      <Async loading={entry.loading} error={entry.error} onRetry={entry.reload}>
        {e && (
          <>
            <PageHeader title={`Entry at ${e.venue}`} subtitle={<>{when(e.enteredAt)} · <Status value={e.outcome} /></>} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <Rows
                  items={[
                    ['Id', <Mono key="i">{e.id}</Mono>],
                    ['Venue', <Link key="v" to={`/venues/${e.venueId}`} className="hover:text-amber-300">{e.venue}</Link>],
                    ['Gate', `${e.gate} (${e.gateKind})`],
                    ['Guest', e.guestId ? <Link key="g" to={`/guests/${e.guestId}`} className="hover:text-amber-300">{e.guest}</Link> : 'none (open venue or erased)'],
                    ['Passkey', e.credentialDevice],
                    ['Flow', e.flowKey && <span key="f"><Mono>{e.flowKey}</Mono> v{e.flowVersion}</span>],
                    ['Session', e.sessionId && <Link key="s" to={`/sessions/${e.sessionId}`} className="hover:text-amber-300"><Mono>{e.sessionId}</Mono></Link>],
                    ['Scanned', when(e.scannedAt)],
                    ['Idempotency key', <Mono key="k">{e.idempotencyKey}</Mono>],
                  ]}
                />
              </Panel>
              <Panel className="space-y-4 p-4">
                {d.hotel && (
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-stone-400">Hotel</p>
                    <Rows items={[['Journey', d.hotel.journey], ['Room', d.hotel.room], ['Booking', d.hotel.bookingRef], ['Booked as', d.hotel.bookedAs], ['Stay', d.hotel.arrivalDate && `${d.hotel.arrivalDate} → ${d.hotel.departureDate}`], ['Nights', d.hotel.nights], ['Party', d.hotel.partySize]]} />
                  </div>
                )}
                {d.visit && (
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-stone-400">Visit</p>
                    <Rows items={[['Purpose', d.visit.purpose], ['Host', d.visit.host]]} />
                  </div>
                )}
                {d.event && (
                  <div>
                    <p className="mb-1 text-[12px] font-semibold text-stone-400">Event</p>
                    <Rows items={[['Event', d.event.event], ['Company', d.event.company], ['Designation', d.event.designation]]} />
                  </div>
                )}
                {!d.hotel && !d.visit && !d.event && <p className="text-[13px] text-stone-500">No vertical detail for this entry.</p>}
              </Panel>
            </div>
            <h3 className="mb-2 mt-6 text-[13px] font-semibold text-white">Trail</h3>
            <Panel className="p-4">
              <Trail trail={e.trail} staff={e.staff} />
            </Panel>
          </>
        )}
      </Async>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Sessions                                                            */
/* ------------------------------------------------------------------ */

export function SessionList() {
  const navigate = useNavigate()
  const [f, set] = useFilters(['venueId', 'status', 'stuck', 'olderThan'])
  const page = usePaged('/sessions', f)
  return (
    <>
      <PageHeader title="Sessions" subtitle="Journeys through a flow: where each one is, and which are stuck." />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={f.status} onChange={(e) => set('status', e.target.value)} className="max-w-[160px]">
          <option value="">Any status</option>
          {['in_progress', 'waiting', 'done', 'rejected', 'expired', 'revoked'].map((s) => <option key={s}>{s}</option>)}
        </Select>
        <Select value={f.stuck} onChange={(e) => set('stuck', e.target.value)} className="max-w-[240px]">
          <option value="">All sessions</option>
          <option value="waiting">Stuck waiting for staff</option>
          <option value="idle">In progress and idle</option>
        </Select>
        {f.stuck && (
          <label className="flex items-center gap-2 text-[13px] text-stone-400">
            longer than
            <Input type="number" min="1" value={f.olderThan || '15'} onChange={(e) => set('olderThan', e.target.value)} className="w-20" />
            min
          </label>
        )}
        {f.venueId && <Pill tone="info">venue <Id value={f.venueId} /> <button onClick={() => set('venueId', '')} className="ml-1">×</button></Pill>}
      </div>
      <PagedTable
        page={page}
        onRow={(s) => navigate(`/sessions/${s.id}`)}
        columns={[
          { label: 'Started', render: (s) => when(s.createdAt) },
          { label: 'Venue · gate', render: (s) => `${s.venue} · ${s.gate}` },
          { label: 'Flow', render: (s) => <><Mono>{s.flowKey}</Mono> v{s.flowVersion}</> },
          { label: 'At step', render: (s) => (s.step ? <>{s.cursor + 1}/{s.stepCount} <Mono>{s.step}</Mono></> : `${s.stepCount}/${s.stepCount}`) },
          { label: 'Guest', render: (s) => s.guest ?? '—' },
          { label: 'Status', render: (s) => <Status value={s.status} /> },
          { label: 'Last change', render: (s) => when(s.updatedAt) },
        ]}
      />
    </>
  )
}

export function SessionDetail() {
  const { id } = useParams()
  const { admin } = useSession()
  const session = useApi(() => api.get(`/sessions/${id}`), [id])
  const [dialog, act] = useAction(session.reload)
  const s = session.data
  const open = s && ['in_progress', 'waiting'].includes(s.status)

  const end = () =>
    act({
      title: 'End this session',
      danger: true,
      description: 'The guest’s screen stops working and they have to scan again. Nothing is admitted.',
      fields: [{ name: 'status', label: 'End as', type: 'select', options: [{ value: 'expired', label: 'expired' }, { value: 'revoked', label: 'revoked' }], defaultValue: 'expired' }],
      reason: 'required',
      submitLabel: 'End session',
      onSubmit: (v) => api.post(`/sessions/${id}/end`, v),
    })

  return (
    <>
      <Back to="/sessions" label="Sessions" />
      <Async loading={session.loading && !s} error={session.error} onRetry={session.reload}>
        {s && (
          <>
            <PageHeader
              title={`Session at ${s.venue}`}
              subtitle={<><Status value={s.status} /> · step {Math.min(s.cursor + 1, s.steps.length)} of {s.steps.length} · version {s.version}</>}
              actions={open && canWrite(admin) && <Button tone="danger" onClick={end}>End session</Button>}
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <Rows
                  items={[
                    ['Id', <Mono key="i">{s.id}</Mono>],
                    ['Venue · gate', `${s.venue} · ${s.gate}`],
                    ['Flow', <Link key="f" to={`/flows/${s.flowId}`} className="hover:text-amber-300"><Mono>{s.flowKey}</Mono> v{s.flowVersion}</Link>],
                    ['Guest', s.guestId ? <Link key="g" to={`/guests/${s.guestId}`} className="hover:text-amber-300">{s.guest}</Link> : '—'],
                    ['Entry', s.entryId && <Link key="e" to={`/entries/${s.entryId}`} className="hover:text-amber-300"><Mono>{s.entryId}</Mono></Link>],
                    ['Started', when(s.createdAt)],
                    ['Last change', when(s.updatedAt)],
                    ['Expires', when(s.expiresAt)],
                  ]}
                />
              </Panel>
              <div className="space-y-2">
                <p className="text-[12px] text-stone-500">State</p>
                <Json value={s.state} />
                <p className="text-[12px] text-stone-500">Steps (current highlighted)</p>
                <ol className="space-y-1 text-[13px]">
                  {s.steps.map((st, i) => (
                    <li key={i} className={i === s.cursor ? 'text-amber-300' : i < s.cursor ? 'text-stone-500' : 'text-stone-300'}>
                      {i + 1}. <Mono className="text-inherit">{st.type}</Mono>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <h3 className="mb-2 mt-6 text-[13px] font-semibold text-white">Trail</h3>
            <Panel className="p-4">
              <Trail trail={s.trail} staff={s.staff} />
            </Panel>
          </>
        )}
      </Async>
      {dialog}
    </>
  )
}
