import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus } from 'lucide-react'
import { GUEST_SERVICES, VENUE_KINDS } from '@chqin/shared'
import { api } from '../api'
import { canWrite, isOwner, useSession } from '../session'
import { useApi, usePaged } from '../useApi'
import {
  Async,
  Button,
  Id,
  Input,
  Mono,
  PageHeader,
  PagedTable,
  Panel,
  Pill,
  Rows,
  Select,
  Status,
  Table,
  Tabs,
  useAction,
  when,
} from '../ui'
import { GateDrawer, flowLabel, useFlowChoices, useNewGate } from './Gates'

export default function Venues() {
  const { admin } = useSession()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const page = usePaged('/venues', { q, kind, status })
  const { kinds, flows } = useFlowChoices()
  const [dialog, act] = useAction()

  const create = () =>
    act({
      title: 'New venue',
      description:
        'Creates the venue, its owner account and its first gate. The owner gets an email to choose a password; nobody here ever sees it.',
      fields: [
        { name: 'name', label: 'Venue name', required: true },
        { name: 'kind', label: 'Kind', type: 'select', options: kinds.map((k) => ({ value: k, label: k })), defaultValue: 'office' },
        { name: 'flowKey', label: 'First gate runs', type: 'select', hint: 'Latest version of this flow.', options: [{ value: '', label: 'Default for the kind' }, ...[...new Set(flows.map((f) => f.key))].map((k) => ({ value: k, label: k }))], defaultValue: '' },
        { name: 'city', label: 'City', required: true },
        { name: 'address', label: 'Address' },
        { name: 'timezone', label: 'Timezone', defaultValue: 'Asia/Kolkata' },
        { name: 'ownerName', label: 'Owner name', required: true },
        { name: 'ownerEmail', label: 'Owner email', type: 'email', required: true },
      ],
      reason: 'optional',
      submitLabel: 'Create venue',
      onSubmit: async ({ ownerName, ownerEmail, flowKey, address, ...v }) => {
        const { venueId } = await api.post('/venues', {
          ...v,
          ...(address ? { address } : {}),
          ...(flowKey ? { flowKey } : {}),
          owner: { name: ownerName, email: ownerEmail },
        })
        navigate(`/venues/${venueId}`)
      },
    })

  return (
    <>
      <PageHeader
        title="Venues"
        subtitle="Every place anyone arrives, of every kind."
        actions={canWrite(admin) && <Button tone="primary" icon={Plus} onClick={create}>New venue</Button>}
      />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={kind} onChange={(e) => setKind(e.target.value)} className="max-w-[160px]">
          <option value="">Any kind</option>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[160px]">
          <option value="">Any status</option>
          {['active', 'suspended', 'closed'].map((s) => <option key={s}>{s}</option>)}
        </Select>
      </div>
      <PagedTable
        page={page}
        onRow={(v) => navigate(`/venues/${v.id}`)}
        columns={[
          { label: 'Venue', render: (v) => <><p className="text-white">{v.name}</p><Id value={v.id} /></> },
          { label: 'Kind', render: (v) => <Pill>{v.kind}</Pill> },
          { label: 'City', render: (v) => v.city ?? v.location ?? '—' },
          { label: 'Login email', render: (v) => <Mono>{v.ownerEmail ?? '—'}</Mono> },
          { label: 'Gates', render: (v) => v.gates },
          { label: 'Last entry', render: (v) => when(v.lastEntryAt) },
          { label: 'Status', render: (v) => <Status value={v.status} /> },
          { label: 'Created', render: (v) => when(v.createdAt) },
        ]}
      />
      {dialog}
    </>
  )
}

const TABS = ['profile', 'staff', 'gates', 'visitors', 'rooms', 'entries', 'sessions', 'outbox']

export function VenueDetail() {
  const { id } = useParams()
  const { admin } = useSession()
  const navigate = useNavigate()
  const detail = useApi(() => api.get(`/venues/${id}`), [id])
  const [tab, setTab] = useState('profile')
  const [gateOpen, setGateOpen] = useState(null)
  const [dialog, act] = useAction(detail.reload)
  const [gateDialog, newGate] = useNewGate(detail.reload)
  const d = detail.data
  const v = d?.venue
  const write = canWrite(admin)

  const editProfile = () => {
    const a = v.address ?? {}
    act({
      title: 'Edit profile',
      description: 'What the venue gave when it registered.',
      fields: [
        { name: 'name', label: 'Property name', defaultValue: v.name, required: true },
        { name: 'kind', label: 'Kind', type: 'select', options: VENUE_KINDS.map((k) => ({ value: k, label: k })), defaultValue: v.kind },
        { type: 'heading', label: 'Address' },
        { name: 'line1', label: 'Street address', defaultValue: a.line1 ?? '' },
        { name: 'city', label: 'City', defaultValue: a.city ?? '', required: true },
        { name: 'country', label: 'Country code', placeholder: 'IN', defaultValue: a.country ?? '' },
        { name: 'lat', label: 'Latitude', type: 'number', defaultValue: a.lat ?? '' },
        { name: 'lng', label: 'Longitude', type: 'number', defaultValue: a.lng ?? '' },
        { type: 'heading', label: 'Operations' },
        { name: 'timezone', label: 'Timezone', defaultValue: v.timezone },
        { name: 'retentionDays', label: 'Entry retention (days, blank = default)', type: 'number', defaultValue: v.retentionDays ?? '' },
      ],
      reason: 'optional',
      submitLabel: 'Save',
      onSubmit: ({ line1, city, country, lat, lng, retentionDays, reason, ...rest }) =>
        api.post(`/venues/${id}`, {
          ...rest,
          reason,
          // Kept beside what registration stored, so keys this form doesn't show survive.
          address: {
            ...a,
            line1: line1.trim(),
            city: city.trim(),
            country: country.trim() || undefined,
            lat: lat === '' ? undefined : Number(lat),
            lng: lng === '' ? undefined : Number(lng),
          },
          location: [line1.trim(), city.trim()].filter(Boolean).join(', ') || null,
          retentionDays: retentionDays === '' ? null : Number(retentionDays),
        }),
    })
  }

  const editSettings = () => {
    const st = v.settings ?? {}
    const b = st.business ?? {}
    const e = st.essentials ?? {}
    const c = st.contacts ?? {}
    const hotel = v.kind === 'hotel'
    const text = (prefix, obj, keys) => keys.map(([k, label, extra]) => ({ name: `${prefix}.${k}`, label, defaultValue: obj[k] ?? '', ...extra }))
    act({
      title: 'Edit settings',
      description: 'What the venue set up at registration. Leave a box empty to clear it.',
      fields: [
        { type: 'heading', label: 'Business registration' },
        ...text('business', b, [
          ['legalName', 'Legal name'],
          ['tradeName', 'Trade name'],
          ['gstin', 'GSTIN'],
          ['pan', 'PAN'],
          ['constitution', 'Constitution'],
          ['registrationType', 'Registration type'],
          ['address', 'Registered address'],
          ['city', 'City'],
          ['state', 'State'],
          ['pincode', 'PIN code'],
        ]),
        { type: 'heading', label: 'Notifications' },
        { name: 'reception', label: 'Reception WhatsApp number', placeholder: '+91 98765 43210', defaultValue: st.reception ?? '' },
        ...(hotel
          ? [
              { type: 'heading', label: 'Guest services' },
              { name: 'services', label: 'Services guests can request', type: 'multi', options: GUEST_SERVICES.map((x) => ({ value: x, label: x })), defaultValue: st.services ?? [] },
              ...GUEST_SERVICES.map((x) => ({ name: `contacts.${x}`, label: `${x} requests go to`, placeholder: '+91 …', defaultValue: c[x] ?? '' })),
              { type: 'heading', label: 'Guest essentials' },
              ...text('essentials', e, [
                ['wifiSsid', 'Wi-Fi name'],
                ['wifiPassword', 'Wi-Fi password'],
                ['breakfastFrom', 'Breakfast from', { type: 'time' }],
                ['breakfastTo', 'Breakfast until', { type: 'time' }],
                ['checkoutTime', 'Checkout time', { type: 'time' }],
                ['notes', 'Notes for guests', { type: 'textarea', rows: 3 }],
              ]),
            ]
          : []),
      ],
      reason: 'optional',
      submitLabel: 'Save settings',
      onSubmit: ({ reason, reception, services, ...flat }) => {
        // "business.gstin" → business: { gstin }. Empty boxes are dropped, not saved as "".
        const group = (prefix) =>
          Object.fromEntries(
            Object.entries(flat)
              .filter(([k, val]) => k.startsWith(`${prefix}.`) && String(val).trim())
              .map(([k, val]) => [k.slice(prefix.length + 1), String(val).trim()]),
          )
        const settings = {
          // Everything this form doesn't show (Aadhaar access, identity fields…) is kept.
          ...st,
          business: { ...group('business'), verified: b.verified ?? false },
          reception: reception.trim() || null,
          ...(hotel ? { services, contacts: group('contacts'), essentials: group('essentials') } : {}),
        }
        return api.post(`/venues/${id}/settings`, { settings, reason })
      },
    })
  }

  const suspend = () =>
    act({
      title: v.status === 'active' ? `Suspend ${v.name}` : `Reactivate ${v.name}`,
      danger: v.status === 'active',
      description:
        v.status === 'active'
          ? 'Every gate refuses scans with a clear message, every staff session ends now, staff cannot sign in, and guests mid-journey are stopped.'
          : 'Staff can sign in again. Revoked gates stay revoked until restored.',
      reason: 'required',
      submitLabel: v.status === 'active' ? 'Suspend' : 'Reactivate',
      onSubmit: ({ reason }) => api.post(`/venues/${id}/status`, { status: v.status === 'active' ? 'suspended' : 'active', reason }),
    })

  // Unset means on: venues that predate the switch keep what they had.
  const aadhaarOn = v?.settings?.aadhaarAccess !== false
  const toggleAadhaar = () =>
    act({
      title: aadhaarOn ? `Turn off Aadhaar for ${v.name}` : `Turn on Aadhaar for ${v.name}`,
      danger: aadhaarOn,
      description: aadhaarOn
        ? 'New guests and visitors give their name, date of birth and address instead of verifying with Aadhaar. This applies to hotels too. Anyone mid check-in keeps the step they are on.'
        : 'The venue can verify people with Aadhaar again. A hotel uses it for every guest; other venues choose it in their dashboard.',
      reason: 'required',
      submitLabel: aadhaarOn ? 'Turn off' : 'Turn on',
      onSubmit: ({ reason }) => api.post(`/venues/${id}/aadhaar`, { enabled: !aadhaarOn, reason }),
    })

  const viewAs = () =>
    act({
      title: `View ${v.name}'s dashboard`,
      description:
        'Opens their business dashboard as the owner sees it, read-only, for 30 minutes. Guest details there are not masked, so this is recorded in the audit log. It replaces any venue dashboard sign-in in this browser.',
      reason: 'required',
      submitLabel: 'Open dashboard',
      onSubmit: async ({ reason }) => {
        const { url } = await api.post(`/venues/${id}/view-as`, { reason })
        window.open(url, '_blank', 'noopener')
        return {
          show: (
            <p className="text-[13px] text-stone-300">
              Opened in a new tab. If it was blocked,{' '}
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-amber-300 hover:underline">
                open the dashboard
              </a>
              .
            </p>
          ),
        }
      },
    })

  const remove = () =>
    act({
      title: `Delete ${v.name}`,
      danger: true,
      description: (
        <>
          A venue with entries or sessions is <b>closed</b>, not deleted: its history has a retention period. Gates are revoked and every
          session ends. A venue with no history is deleted along with staff accounts that belong nowhere else. Refused on a hosted
          database unless the API allows destructive actions.
        </>
      ),
      reason: 'required',
      confirmPhrase: v.name,
      submitLabel: 'Delete venue',
      onSubmit: async (body) => {
        const { mode } = await api.post(`/venues/${id}/delete`, body)
        if (mode === 'deleted') navigate('/venues')
        else return { show: 'The venue had history, so it was closed and kept.' }
      },
    })

  const hostDialog = (host) =>
    act({
      title: host ? `Edit ${host.name}` : 'New host',
      description: 'A person or team visitors can ask to see. The WhatsApp number is where their arrival notice goes.',
      fields: [
        { name: 'name', label: 'Name', required: true, defaultValue: host?.name },
        { name: 'phone', label: 'WhatsApp number', defaultValue: '', placeholder: host ? 'Leave blank to keep the current number' : '+91 98765 43210' },
      ],
      reason: 'optional',
      onSubmit: ({ name, phone, reason }) =>
        api.post(host ? `/venues/${id}/hosts/${host.id}` : `/venues/${id}/hosts`, { name, ...(phone ? { phone } : {}), reason }),
    })

  const eventDialog = () =>
    act({
      title: 'New event',
      fields: [
        { name: 'name', label: 'Event name', required: true },
        { name: 'organizerId', label: 'Organiser', type: 'select', options: [{ value: '', label: 'No organiser' }, ...d.hosts.map((h) => ({ value: h.id, label: h.name }))], defaultValue: '' },
      ],
      reason: 'optional',
      onSubmit: ({ organizerId, ...rest }) => api.post(`/venues/${id}/events`, { ...rest, organizerId: organizerId || null }),
    })

  const toggle = (path, body) => api.post(path, body).then(detail.reload)

  return (
    <>
      <Link to="/venues" className="mb-2 inline-flex items-center gap-1 text-[12px] text-stone-500 hover:text-stone-300">
        <ArrowLeft size={13} /> Venues
      </Link>
      <Async loading={detail.loading && !d} error={detail.error} onRetry={detail.reload}>
        {d && (
          <>
            <PageHeader
              title={v.name}
              subtitle={<>{v.kind} · {v.location ?? '—'} · <Status value={v.status} />{v.statusReason && <span className="ml-2 text-stone-500">“{v.statusReason}”</span>}</>}
              actions={
                write && (
                  <>
                    <Button onClick={editProfile}>Edit profile</Button>
                    <Button onClick={editSettings}>Edit settings</Button>
                    <Button onClick={viewAs}>View dashboard</Button>
                    <Button onClick={toggleAadhaar}>{aadhaarOn ? 'Turn Aadhaar off' : 'Turn Aadhaar on'}</Button>
                    {v.status !== 'closed' && <Button onClick={suspend}>{v.status === 'active' ? 'Suspend' : 'Reactivate'}</Button>}
                    {isOwner(admin) && <Button tone="danger" onClick={remove}>Delete</Button>}
                  </>
                )
              }
            />
            <Tabs tabs={TABS} value={tab} onChange={setTab} />

            {tab === 'profile' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <Panel className="p-4">
                  <Rows
                    items={[
                      ['Id', <Mono key="i">{v.id}</Mono>],
                      ['Login email', <Mono key="le">{(d.staff.find((s) => s.role === 'owner') ?? d.staff[0])?.email ?? '—'}</Mono>],
                      ['Kind', v.kind],
                      ['Timezone', v.timezone],
                      ['Status', <Status key="s" value={v.status} />],
                      ['Aadhaar', aadhaarOn ? 'On — verified with an OTP' : 'Off — name, date of birth and address'],
                      ['Retention', v.retentionDays ? `${v.retentionDays} days` : 'default for the kind'],
                      ['Entries', d.totals.entries],
                      ['Sessions', d.totals.sessions],
                      ['Created', when(v.createdAt)],
                    ]}
                  />
                  <p className="mb-1 mt-4 text-[12px] font-semibold text-stone-400">Address</p>
                  <Rows
                    items={[
                      ['Street', v.address?.line1 || '—'],
                      ['City', v.address?.city || '—'],
                      ['Country', v.address?.country || '—'],
                      ['Map pin', v.address?.lat != null ? `${v.address.lat}, ${v.address.lng}` : '—'],
                    ]}
                  />
                </Panel>
                <SettingsSummary venue={v} />
              </div>
            )}

            {tab === 'staff' && (
              <Panel>
                <Table
                  rows={d.staff}
                  onRow={(s) => navigate(`/staff/${s.staffId}`)}
                  empty="No staff."
                  columns={[
                    { label: 'Name', render: (s) => s.name },
                    { label: 'Email', render: (s) => <Mono>{s.email ?? '—'}</Mono> },
                    { label: 'Role', render: (s) => <Pill>{s.role}</Pill> },
                    { label: 'Account', render: (s) => <Status value={s.status} /> },
                    { label: 'Verified', render: (s) => (s.emailVerifiedAt ? 'yes' : 'no') },
                    { label: 'Sessions', render: (s) => s.activeSessions },
                    { label: 'Last sign-in', render: (s) => when(s.lastLoginAt) },
                  ]}
                />
              </Panel>
            )}

            {tab === 'gates' && (
              <>
                {write && (
                  <div className="mb-3">
                    <Button icon={Plus} onClick={() => newGate(v)}>New gate</Button>
                  </div>
                )}
                <Panel>
                  <Table
                    rows={d.gates}
                    onRow={(g) => setGateOpen(g.id)}
                    columns={[
                      { label: 'Gate', render: (g) => <><p className="text-white">{g.name}</p><Id value={g.id} /></> },
                      { label: 'Kind', render: (g) => g.kind },
                      { label: 'Flow', render: flowLabel },
                      { label: 'Identity', render: (g) => g.config?.identity ?? 'basic' },
                      { label: 'In flight', render: (g) => g.inFlight },
                      { label: 'Status', render: (g) => <Status value={g.status} /> },
                    ]}
                  />
                </Panel>
              </>
            )}

            {tab === 'visitors' && (
              <>
              <h3 className="mb-2 text-[13px] font-semibold text-white">Waiting for a host ({d.waiting.length})</h3>
              <Panel className="mb-4">
                <Table
                  rows={d.waiting.map((w) => ({ ...w, id: w.sessionId }))}
                  onRow={(w) => navigate(`/sessions/${w.sessionId}`)}
                  empty="Nobody is waiting."
                  columns={[
                    { label: 'Visitor', render: (w) => w.visitor },
                    { label: 'Purpose', render: (w) => w.purposeLabel },
                    { label: 'Host', render: (w) => w.host ?? '—' },
                    { label: 'State', render: (w) => <Pill tone="warn">{w.held ? 'asked to wait' : 'waiting'}</Pill> },
                    { label: 'Since', render: (w) => when(w.since) },
                  ]}
                />
              </Panel>
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-white">Hosts</h3>
                    {write && <Button size="sm" icon={Plus} onClick={() => hostDialog(null)}>Add host</Button>}
                  </div>
                  <Panel>
                    <Table
                      rows={d.hosts}
                      empty="No hosts. A visitor venue needs at least one."
                      columns={[
                        { label: 'Name', render: (h) => h.name },
                        { label: 'WhatsApp', render: (h) => <Mono>{h.phone ?? 'none'}</Mono> },
                        { label: 'Status', render: (h) => <Status value={h.active ? 'active' : 'paused'} /> },
                        ...(write
                          ? [{ label: '', render: (h) => (
                              <div className="flex gap-1.5">
                                <Button size="sm" onClick={() => hostDialog(h)}>Edit</Button>
                                <Button size="sm" onClick={() => toggle(`/venues/${id}/hosts/${h.id}`, { active: !h.active })}>{h.active ? 'Pause' : 'Activate'}</Button>
                              </div>
                            ) }]
                          : []),
                      ]}
                    />
                  </Panel>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-[13px] font-semibold text-white">Events</h3>
                    {write && <Button size="sm" icon={Plus} onClick={eventDialog}>Add event</Button>}
                  </div>
                  <Panel>
                    <Table
                      rows={d.events}
                      empty="No events."
                      columns={[
                        { label: 'Event', render: (e) => e.name },
                        { label: 'Organiser', render: (e) => e.organizer ?? '—' },
                        { label: 'Attendance', render: (e) => e.attendance },
                        { label: 'Status', render: (e) => <Status value={e.active ? 'active' : 'paused'} /> },
                        ...(write
                          ? [{ label: '', render: (e) => <Button size="sm" onClick={() => toggle(`/venues/${id}/events/${e.id}/active`, { active: !e.active })}>{e.active ? 'Pause' : 'Activate'}</Button> }]
                          : []),
                      ]}
                    />
                  </Panel>
                </div>
              </div>
              </>
            )}

            {tab === 'rooms' && (
              <Panel>
                <Table
                  rows={d.rooms}
                  empty="No rooms. Only venues that take room bookings have them."
                  columns={[
                    { label: 'Room', render: (r) => r.number },
                    { label: 'Type', render: (r) => r.roomType ?? '—' },
                  ]}
                />
              </Panel>
            )}

            {tab === 'entries' && (
              <Panel>
                <Table
                  rows={d.entries}
                  onRow={(e) => navigate(`/entries/${e.id}`)}
                  empty="No entries yet."
                  columns={[
                    { label: 'When', render: (e) => when(e.enteredAt) },
                    { label: 'Guest', render: (e) => e.guest ?? <span className="text-stone-500">none / erased</span> },
                    { label: 'Gate', render: (e) => e.gate },
                    { label: 'Outcome', render: (e) => <Status value={e.outcome} /> },
                  ]}
                />
                <MoreLink to={`/entries?venueId=${id}`} />
              </Panel>
            )}

            {tab === 'sessions' && (
              <Panel>
                <Table
                  rows={d.sessions}
                  onRow={(s) => navigate(`/sessions/${s.id}`)}
                  empty="No sessions yet."
                  columns={[
                    { label: 'Started', render: (s) => when(s.createdAt) },
                    { label: 'Flow', render: (s) => <><Mono>{s.flowKey}</Mono> v{s.flowVersion}</> },
                    { label: 'Step', render: (s) => s.cursor },
                    { label: 'Status', render: (s) => <Status value={s.status} /> },
                    { label: 'Updated', render: (s) => when(s.updatedAt) },
                  ]}
                />
                <MoreLink to={`/sessions?venueId=${id}`} />
              </Panel>
            )}

            {tab === 'outbox' && (
              <Panel>
                <Table
                  rows={d.outbox}
                  empty="No messages."
                  columns={[
                    { label: 'When', render: (o) => when(o.createdAt) },
                    { label: 'Kind', render: (o) => <Mono>{o.kind}</Mono> },
                    { label: 'To', render: (o) => <Mono>{o.recipient ?? '—'}</Mono> },
                    { label: 'Attempts', render: (o) => o.attempts },
                    { label: 'Status', render: (o) => <Status value={o.status} /> },
                    { label: 'Last error', render: (o) => <span className="text-red-300">{o.lastError ?? ''}</span> },
                  ]}
                />
                <MoreLink to={`/outbox?venueId=${id}`} />
              </Panel>
            )}
          </>
        )}
      </Async>
      {dialog}
      {gateDialog}
      {gateOpen && <GateDrawer id={gateOpen} onClose={() => setGateOpen(null)} onChanged={detail.reload} />}
    </>
  )
}

const MoreLink = ({ to }) => (
  <div className="border-t border-line px-3 py-2 text-right text-[12px]">
    <Link to={to} className="text-amber-300 hover:underline">Showing the latest 20 · open the full list</Link>
  </div>
)

/** The settings as the venue entered them, readable. Empty sections are left out. */
function SettingsSummary({ venue }) {
  const st = venue.settings ?? {}
  const b = st.business ?? {}
  const e = st.essentials ?? {}
  const form = st.identityForm
  const rows = (pairs) => pairs.filter(([, val]) => val != null && val !== '')
  const sections = [
    [
      'Business registration',
      rows([
        ['Legal name', b.legalName],
        ['Trade name', b.tradeName],
        ['GSTIN', b.gstin],
        ['PAN', b.pan],
        ['Constitution', b.constitution],
        ['Registered address', [b.address, b.city, b.state, b.pincode].filter(Boolean).join(', ')],
      ]),
    ],
    ['Notifications', rows([['Reception WhatsApp', st.reception]])],
    [
      'Guest services',
      rows([
        ['Services', (st.services ?? []).join(', ')],
        ...Object.entries(st.contacts ?? {}).map(([k, val]) => [`${k} requests`, val]),
      ]),
    ],
    [
      'Guest essentials',
      rows([
        ['Wi-Fi', [e.wifiSsid, e.wifiPassword].filter(Boolean).join(' / ')],
        ['Breakfast', e.breakfastFrom ? `${e.breakfastFrom} – ${e.breakfastTo ?? ''}` : null],
        ['Checkout', e.checkoutTime],
        ['Notes', e.notes],
      ]),
    ],
    [
      'Identity form (without Aadhaar)',
      form
        ? rows([
            ['Date of birth', form.dateOfBirth],
            ['Address', form.address],
            ['Mobile', form.phone],
            ...(form.extra ?? []).map((f) => [f.label, `${f.kind === 'choice' ? `pick: ${f.options.join(', ')}` : 'text'}${f.required ? ' · required' : ''}`]),
          ])
        : [],
    ],
  ].filter(([, items]) => items.length)

  return (
    <Panel className="space-y-4 p-4">
      {sections.length === 0 && <p className="text-[13px] text-stone-500">Nothing set up yet.</p>}
      {sections.map(([title, items]) => (
        <div key={title}>
          <p className="mb-1 text-[12px] font-semibold text-stone-400">{title}</p>
          <Rows items={items} />
        </div>
      ))}
    </Panel>
  )
}
