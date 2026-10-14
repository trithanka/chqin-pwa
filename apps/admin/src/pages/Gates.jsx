import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { Download, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { canWrite, useSession } from '../session'
import { useApi, usePaged } from '../useApi'
import { Button, Id, Input, Json, Mono, PageHeader, PagedTable, Panel, Pill, Rows, Select, Status, useAction, when } from '../ui'

export const GUEST_APP = import.meta.env.VITE_GUEST_APP_URL ?? `http://${location.hostname}:5173`
export const gateLink = (token) => `${GUEST_APP}/c/${token}`

const GATE_KINDS = ['qr', 'desk', 'turnstile', 'kiosk'].map((k) => ({ value: k, label: k }))
const IDENTITY = [
  { value: 'basic', label: 'basic — name and mobile' },
  { value: 'aadhaar', label: 'aadhaar — Aadhaar OTP' },
]

/** The flow versions a gate can run, newest first within each key. */
export function useFlowChoices() {
  const { data } = useApi(() => api.get('/flow-choices'))
  const flows = data?.flows ?? []
  return {
    flows,
    kinds: data?.kinds ?? [],
    options: flows.map((f) => ({ value: f.id, label: `${f.key} v${f.version}${f.latest ? ' (latest)' : ''}` })),
  }
}

export const flowLabel = (g) => (
  <span>
    <Mono>{g.flowKey}</Mono> v{g.flowVersion}{' '}
    {g.flowVersion < g.flowLatest && <Pill tone="warn">v{g.flowLatest} exists</Pill>}
  </span>
)

/** Opens the "new gate" dialog for one venue. */
export function useNewGate(onDone) {
  const [dialog, act] = useAction(onDone)
  const { options } = useFlowChoices()
  const open = (venue) =>
    act({
      title: `New gate at ${venue.name}`,
      fields: [
        { name: 'name', label: 'Name', required: true, placeholder: 'Main entrance' },
        { name: 'kind', label: 'Kind', type: 'select', options: GATE_KINDS, defaultValue: 'qr' },
        { name: 'flowId', label: 'Flow', type: 'select', options, defaultValue: options[0]?.value },
        { name: 'identity', label: 'Identity', type: 'select', options: IDENTITY, defaultValue: venue.kind === 'hotel' ? 'aadhaar' : 'basic' },
      ],
      reason: 'optional',
      submitLabel: 'Create gate',
      onSubmit: (v) => api.post(`/venues/${venue.id}/gates`, v),
    })
  return [dialog, open]
}

/** Every action a gate has, as buttons. Used on the gates list and the venue page. */
export function GateActions({ gate, onDone }) {
  const { admin } = useSession()
  const [dialog, act] = useAction(onDone)
  const { options } = useFlowChoices()
  if (!canWrite(admin)) return null

  const edit = () =>
    act({
      title: `Edit ${gate.name}`,
      description: 'The flow and identity method are what a guest at this gate lives through. Sessions already started keep the version they began on.',
      fields: [
        { name: 'name', label: 'Name', defaultValue: gate.name },
        { name: 'kind', label: 'Kind', type: 'select', options: GATE_KINDS, defaultValue: gate.kind },
        { name: 'flowId', label: 'Flow version', type: 'select', options, defaultValue: gate.flowId },
        { name: 'identity', label: 'Identity method', type: 'select', options: IDENTITY, defaultValue: gate.config?.identity ?? 'basic' },
        { name: 'config', label: 'Other config (JSON)', type: 'textarea', rows: 4, defaultValue: JSON.stringify(gate.config ?? {}, null, 2) },
      ],
      reason: 'required',
      submitLabel: 'Save gate',
      onSubmit: ({ config, identity, reason, ...rest }) => {
        let parsed
        try {
          parsed = JSON.parse(config || '{}')
        } catch {
          throw new Error('Config is not valid JSON.')
        }
        return api.post(`/gates/${gate.id}`, { ...rest, config: { ...parsed, identity }, reason })
      },
    })

  const status = () =>
    act({
      title: gate.status === 'active' ? `Revoke ${gate.name}` : `Restore ${gate.name}`,
      danger: gate.status === 'active',
      description: gate.status === 'active' ? 'Scans of this gate stop working at once.' : 'The printed card starts working again.',
      reason: 'required',
      submitLabel: gate.status === 'active' ? 'Revoke' : 'Restore',
      onSubmit: ({ reason }) => api.post(`/gates/${gate.id}/status`, { status: gate.status === 'active' ? 'revoked' : 'active', reason }),
    })

  const rotate = () =>
    act({
      title: `Rotate the QR of ${gate.name}`,
      danger: true,
      description: 'The printed card stops working immediately. Only do this when the card is lost or compromised, and have a new card ready to print.',
      reason: 'required',
      submitLabel: 'Rotate token',
      onSubmit: async ({ reason }) => {
        const { token } = await api.post(`/gates/${gate.id}/rotate`, { reason })
        return { show: <>The new link is <Mono className="break-all">{gateLink(token)}</Mono>. Print the card again from the gate.</> }
      },
    })

  return (
    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" onClick={edit}>Edit</Button>
      <Button size="sm" onClick={status}>{gate.status === 'active' ? 'Revoke' : 'Restore'}</Button>
      <Button size="sm" icon={RefreshCw} onClick={rotate}>Rotate QR</Button>
      {dialog}
    </div>
  )
}

/** QR, link and a print-ready card as a PNG. */
export function GateCard({ gateId }) {
  const { data: gate } = useApi(() => api.get(`/gates/${gateId}`), [gateId])
  const [qr, setQr] = useState(null)
  const link = gate?.token ? gateLink(gate.token) : null

  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr)
  }, [link])

  const download = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 1600
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, 1200, 1600)
    ctx.fillStyle = '#0f172a'
    ctx.textAlign = 'center'
    ctx.font = 'bold 72px system-ui, sans-serif'
    ctx.fillText(gate.venue, 600, 200)
    ctx.font = '48px system-ui, sans-serif'
    ctx.fillStyle = '#475569'
    ctx.fillText(gate.name, 600, 280)
    const code = document.createElement('canvas')
    await QRCode.toCanvas(code, link, { margin: 1, width: 800 })
    ctx.drawImage(code, 200, 360)
    ctx.fillStyle = '#0f172a'
    ctx.font = 'bold 56px system-ui, sans-serif'
    ctx.fillText('Scan to check in', 600, 1300)
    ctx.font = '28px system-ui, sans-serif'
    ctx.fillStyle = '#64748b'
    ctx.fillText('ChqIn', 600, 1380)
    const a = Object.assign(document.createElement('a'), {
      href: canvas.toDataURL('image/png'),
      download: `${gate.venue}-${gate.name}.png`.replace(/[^\w.-]+/g, '-'),
    })
    a.click()
  }

  if (!gate) return null
  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="rounded-md bg-white p-2">{qr ? <img src={qr} alt={`QR for ${gate.name}`} width={160} height={160} /> : <div className="size-40" />}</div>
      <div className="min-w-0 flex-1 space-y-2 text-[13px]">
        <p className="break-all">
          <Mono>{link ?? 'This gate has no printable token.'}</Mono>
        </p>
        {link && (
          <Button size="sm" icon={Download} onClick={download}>
            Download card
          </Button>
        )}
      </div>
    </div>
  )
}

export default function Gates() {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('')
  const page = usePaged('/gates', { q, status })
  const [open, setOpen] = useState(null)

  return (
    <>
      <PageHeader title="Gates" subtitle="Every way in, at every venue. A gate runs one pinned flow version." />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input placeholder="Search gate or venue" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[160px]">
          <option value="">Any status</option>
          <option value="active">active</option>
          <option value="revoked">revoked</option>
        </Select>
      </div>
      <PagedTable
        page={page}
        onRow={(g) => setOpen(open === g.id ? null : g.id)}
        columns={[
          { label: 'Gate', render: (g) => <><p className="text-white">{g.name}</p><Id value={g.id} /></> },
          { label: 'Venue', render: (g) => <Link className="hover:text-amber-300" to={`/venues/${g.venueId}`} onClick={(e) => e.stopPropagation()}>{g.venue}</Link> },
          { label: 'Kind', render: (g) => g.kind },
          { label: 'Flow', render: flowLabel },
          { label: 'Identity', render: (g) => g.config?.identity ?? 'basic' },
          { label: 'In flight', render: (g) => g.inFlight },
          { label: 'Status', render: (g) => <Status value={g.status} /> },
          { label: 'Created', render: (g) => when(g.createdAt) },
        ]}
      />
      {open && <GateDrawer id={open} onClose={() => setOpen(null)} onChanged={page.reload} />}
    </>
  )
}

export function GateDrawer({ id, onClose, onChanged }) {
  const gate = useApi(() => api.get(`/gates/${id}`), [id])
  const g = gate.data
  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-2xl">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-[16px] font-semibold text-white">{g?.name ?? 'Gate'}</h2>
        <Button size="sm" tone="ghost" onClick={onClose}>Close</Button>
      </div>
      {g && (
        <div className="space-y-5">
          <Rows
            items={[
              ['Venue', <Link key="v" to={`/venues/${g.venueId}`} className="hover:text-amber-300">{g.venue}</Link>],
              ['Kind', g.kind],
              ['Status', <Status key="s" value={g.status} />],
              ['Flow', flowLabel(g)],
              ['In flight', g.inFlight],
              ['Created', when(g.createdAt)],
              ['Id', <Mono key="i">{g.id}</Mono>],
            ]}
          />
          <GateActions gate={g} onDone={() => (gate.reload(), onChanged?.())} />
          <Panel className="p-3">
            <GateCard gateId={g.id} key={g.token} />
          </Panel>
          <div>
            <p className="mb-1 text-[12px] text-stone-500">Config</p>
            <Json value={g.config} />
          </div>
        </div>
      )}
    </div>
  )
}

