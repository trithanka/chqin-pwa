import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, FlaskConical, Plus, Upload } from 'lucide-react'
import { api } from '../api'
import { isOwner, useSession } from '../session'
import { useApi } from '../useApi'
import { Async, Button, Field, Input, Json, Mono, PageHeader, Panel, Pill, Status, Table, Textarea, useAction, when } from '../ui'

const DEFAULT_NOTE =
  'New venues get the newest version of this key when they are created (register picks the latest). Existing gates stay on the version they point at until someone repoints them.'

const Back = ({ to = '/flows', label = 'Flows' }) => (
  <Link to={to} className="mb-2 inline-flex items-center gap-1 text-[12px] text-stone-500 hover:text-stone-300">
    <ArrowLeft size={13} /> {label}
  </Link>
)

/** `when: { purpose: ['meeting','office'] }` → "only if purpose is meeting or office". */
const whenText = (when) =>
  when
    ? `only if ${Object.entries(when)
        .map(([k, v]) => `${k} is ${Array.isArray(v) ? v.join(' or ') : v}`)
        .join(' and ')}`
    : null

/** A flow as a person reads it: numbered steps, conditions, form fields. */
export function StepList({ steps }) {
  return (
    <ol className="space-y-2">
      {steps.map((step, i) => {
        const { type, when: cond, fields, ...options } = step
        return (
          <li key={i} className="flex gap-3 rounded-md border border-line bg-ink p-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-semibold text-stone-300">{i + 1}</span>
            <div className="min-w-0 space-y-1 text-[13px]">
              <p>
                <Mono className="text-amber-300">{type}</Mono>
                {cond && <span className="ml-2 text-stone-400">{whenText(cond)}</span>}
              </p>
              {fields && (
                <ul className="space-y-0.5 text-stone-400">
                  {fields.map((f) => (
                    <li key={f.key}>
                      <Mono>{f.key}</Mono> · {f.label ?? f.key} · {f.kind ?? 'text'}
                      {f.source && <> from <Mono>{f.source}</Mono></>}
                      {f.options && <> ({f.options.map((o) => (typeof o === 'string' ? o : o.value)).join(', ')})</>}
                    </li>
                  ))}
                </ul>
              )}
              {Object.keys(options).length > 0 && <p className="text-stone-500">options: <Mono>{JSON.stringify(options)}</Mono></p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export default function Flows() {
  const { admin } = useSession()
  const navigate = useNavigate()
  const list = useApi(() => api.get('/flows'))
  return (
    <>
      <PageHeader
        title="Flows"
        subtitle="Gate → Flow → Admit. Every version ever published; published versions never change."
        actions={
          <>
            <Button icon={BookOpen} onClick={() => navigate('/flows/steps')}>Step library</Button>
            <Button icon={FlaskConical} onClick={() => navigate('/flows/simulate')}>Simulator</Button>
            {isOwner(admin) && <Button tone="primary" icon={Plus} onClick={() => navigate('/flows/publish')}>New flow</Button>}
          </>
        }
      />
      <Async loading={list.loading} error={list.error} onRetry={list.reload}>
        <div className="space-y-4">
          {list.data?.flows.map((f) => (
            <Panel key={f.key}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                <p className="text-[14px] font-semibold text-white">
                  <Mono className="text-[14px] text-white">{f.key}</Mono> {f.default && <Pill tone="info">default for new venues</Pill>}
                </p>
                {isOwner(admin) && (
                  <Button size="sm" icon={Upload} onClick={() => navigate(`/flows/publish?from=${f.versions[0].id}`)}>
                    Publish v{f.versions[0].version + 1}
                  </Button>
                )}
              </div>
              <Table
                rows={f.versions}
                onRow={(v) => navigate(`/flows/${v.id}`)}
                columns={[
                  { label: 'Version', render: (v) => <>v{v.version} {v === f.versions[0] && <Pill tone="good">latest</Pill>}</> },
                  { label: 'Steps', render: (v) => v.stepCount },
                  { label: 'Gates on it', render: (v) => v.gates },
                  { label: 'Sessions in flight', render: (v) => v.inFlight },
                  { label: 'Published', render: (v) => when(v.publishedAt) },
                ]}
              />
            </Panel>
          ))}
        </div>
      </Async>
    </>
  )
}

export function FlowDetail() {
  const { id } = useParams()
  const { admin } = useSession()
  const navigate = useNavigate()
  const flow = useApi(() => api.get(`/flows/${id}`), [id])
  const f = flow.data
  return (
    <>
      <Back />
      <Async loading={flow.loading} error={flow.error} onRetry={flow.reload}>
        {f && (
          <>
            <PageHeader
              title={<><Mono className="text-[20px] text-white">{f.key}</Mono> v{f.version}</>}
              subtitle={<>Published {when(f.publishedAt)} · {f.version === f.latest ? 'latest' : `v${f.latest} is newer`} · immutable</>}
              actions={
                <>
                  <Button icon={FlaskConical} onClick={() => navigate(`/flows/simulate?from=${f.id}`)}>Simulate</Button>
                  {isOwner(admin) && <Button tone="primary" icon={Upload} onClick={() => navigate(`/flows/publish?from=${f.id}`)}>Publish v{f.latest + 1} from this</Button>}
                </>
              }
            />
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-[13px] font-semibold text-white">Steps</h3>
                <StepList steps={f.steps} />
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold text-white">Gates running this version</h3>
                  <Panel>
                    <Table
                      rows={f.gates}
                      empty="No gate points at this version."
                      onRow={(g) => navigate(`/venues/${g.venueId}`)}
                      columns={[
                        { label: 'Venue', render: (g) => g.venue },
                        { label: 'Gate', render: (g) => g.name },
                        { label: 'In flight', render: (g) => g.inFlight },
                        { label: 'Status', render: (g) => <Status value={g.status} /> },
                      ]}
                    />
                  </Panel>
                </div>
                <div>
                  <h3 className="mb-2 text-[13px] font-semibold text-white">Raw JSON</h3>
                  <Json value={f.steps} className="max-h-[420px]" />
                </div>
              </div>
            </div>
          </>
        )}
      </Async>
    </>
  )
}

/** Publishing is the only "edit": a new version, validated live against the real step library. */
export function PublishFlow() {
  const [params] = useSearchParams()
  const from = params.get('from')
  const navigate = useNavigate()
  const [key, setKey] = useState('')
  const [text, setText] = useState('[\n  { "type": "identify" },\n  { "type": "admit" }\n]')
  const [verdict, setVerdict] = useState(null)
  const [dialog, act] = useAction()

  useEffect(() => {
    if (from) api.get(`/flows/${from}`).then((f) => (setKey(f.key), setText(JSON.stringify(f.steps, null, 2))))
  }, [from])

  let parsed = null
  let parseError = null
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    parseError = err.message
  }

  useEffect(() => {
    if (parseError) return setVerdict({ ok: false, error: `JSON: ${parseError}` })
    const timer = setTimeout(() => api.post('/flows/validate', { steps: parsed }).then(setVerdict).catch((e) => setVerdict({ ok: false, error: e.message })), 250)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  const isDefault = ['hotel', 'visitor.host_approval'].includes(key)

  const doPublish = () =>
    act({
      title: `Publish ${key}`,
      description: (
        <>
          A new version of <Mono>{key}</Mono> is created; no existing version changes and no gate moves to it on its own.
          {isDefault && <p className="mt-2 text-amber-300">{DEFAULT_NOTE}</p>}
        </>
      ),
      reason: 'required',
      submitLabel: 'Publish',
      onSubmit: async ({ reason }) => {
        const row = await api.post('/flows', { key, steps: parsed, reason })
        navigate(`/flows/${row.id}`)
      },
    })

  return (
    <>
      <Back />
      <PageHeader title="Publish a flow version" subtitle="Validated as you type with the same check the API runs before publishing." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Key" hint="An existing key publishes its next version; a new key starts at v1.">
            <Input value={key} onChange={(e) => setKey(e.target.value.trim())} placeholder="visitor.host_approval" className="font-mono" />
          </Field>
          <Field label="Steps (JSON)">
            <Textarea rows={24} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </Field>
          {verdict && (
            <p className={`text-[13px] ${verdict.ok ? 'text-emerald-300' : 'text-red-300'}`}>{verdict.ok ? 'Valid. The runner can walk this flow.' : verdict.error}</p>
          )}
          {isDefault && <p className="text-[12.5px] text-amber-300">{DEFAULT_NOTE}</p>}
          <div className="flex gap-2">
            <Button tone="primary" icon={Upload} disabled={!verdict?.ok || !key} onClick={doPublish}>Publish</Button>
            <Button icon={FlaskConical} disabled={!parsed} onClick={() => navigate('/flows/simulate', { state: { steps: parsed } })}>Simulate this</Button>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-[13px] font-semibold text-white">Preview</h3>
          {Array.isArray(parsed) ? <StepList steps={parsed} /> : <p className="text-[13px] text-stone-500">Steps must be a JSON list.</p>}
        </div>
      </div>
      {dialog}
    </>
  )
}

export function StepLibrary() {
  const lib = useApi(() => api.get('/steps'))
  return (
    <>
      <Back />
      <PageHeader title="Step library" subtitle="Generated from the step implementations in the API. A new format is a new list of these, not new code." />
      <Async loading={lib.loading} error={lib.error}>
        <div className="grid gap-3 lg:grid-cols-2">
          {lib.data?.steps.map((s) => (
            <Panel key={s.type} className="space-y-2 p-4 text-[13px]">
              <p>
                <Mono className="text-[14px] text-amber-300">{s.type}</Mono>{' '}
                {s.takesInput && <Pill tone="info">takes input</Pill>} {s.hasView && <Pill>draws a screen</Pill>}
              </p>
              <p className="text-stone-300">{s.summary}</p>
              <dl className="space-y-1 text-stone-400">
                <div><dt className="inline text-stone-500">Options: </dt><dd className="inline">{Object.keys(s.options ?? {}).length ? Object.entries(s.options).map(([k, v]) => <span key={k} className="block"><Mono>{k}</Mono> — {v}</span>) : 'none'}</dd></div>
                <div><dt className="inline text-stone-500">Input: </dt><dd className="inline">{s.input}</dd></div>
                <div><dt className="inline text-stone-500">Waits for: </dt><dd className="inline">{s.waitsFor?.length ? s.waitsFor.join(', ') : 'never waits'}</dd></div>
                <div><dt className="inline text-stone-500">Emits: </dt><dd className="inline">{s.emits?.length ? s.emits.join('; ') : 'nothing'}</dd></div>
              </dl>
            </Panel>
          ))}
        </div>
        <Panel className="mt-4 p-4 text-[13px] text-stone-400">
          Any step can carry <Mono>when</Mono>: a map of state keys to a value or a list of values (“any of these”). The step runs only if every pair matches,
          and is skipped otherwise. <Mono>admit</Mono> must be last and never conditional.
        </Panel>
      </Async>
    </>
  )
}

/** Step a flow through the real runner with sample answers. Nothing is written anywhere. */
export function Simulator() {
  const [params] = useSearchParams()
  const from = params.get('from')
  const initial = window.history.state?.usr?.steps
  const [text, setText] = useState(initial ? JSON.stringify(initial, null, 2) : '')
  const [inputs, setInputs] = useState('{ "values": { "purpose": "meeting" } }\n{ "values": { "host": "hosts-1" } }\n{ "approval": "confirm" }')
  const [state, setState] = useState('{}')
  const [guest, setGuest] = useState(true)
  const [booking, setBooking] = useState(false)
  const [result, setResult] = useState(null)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    if (from) api.get(`/flows/${from}`).then((f) => setText(JSON.stringify(f.steps, null, 2)))
    else if (!initial) api.get('/flows').then(({ flows }) => flows[0] && api.get(`/flows/${flows.at(-1).versions[0].id}`).then((f) => setText(JSON.stringify(f.steps, null, 2))))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from])

  const run = async () => {
    setProblem(null)
    try {
      const body = {
        steps: JSON.parse(text),
        state: JSON.parse(state || '{}'),
        guest,
        booking,
        inputs: inputs.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l)),
      }
      setResult(await api.post('/flows/simulate', body))
    } catch (err) {
      setProblem(err.message)
    }
  }

  return (
    <>
      <Back />
      <PageHeader title="Flow simulator" subtitle="The real runner, with no database: admit returns a fake entry and venue choices get sample options." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <Field label="Steps (JSON)">
            <Textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </Field>
          <Field label="Inputs, one JSON object per line" hint='Guest answers are { "values": {...} }; staff decisions are { "approval": "confirm" | "hold" | "decline" }.'>
            <Textarea rows={5} value={inputs} onChange={(e) => setInputs(e.target.value)} spellCheck={false} />
          </Field>
          <Field label="Starting state (JSON)">
            <Input value={state} onChange={(e) => setState(e.target.value)} className="font-mono" />
          </Field>
          <div className="flex flex-wrap gap-4 text-[13px] text-stone-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={guest} onChange={(e) => setGuest(e.target.checked)} /> Guest already identified</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={booking} onChange={(e) => setBooking(e.target.checked)} /> Booking attached</label>
          </div>
          <Button tone="primary" icon={FlaskConical} onClick={run}>Run</Button>
          {problem && <p className="text-[13px] text-red-300">{problem}</p>}
        </div>
        <div className="space-y-2">
          {result && !result.ok && <p className="text-[13px] text-red-300">{result.error}</p>}
          {result?.frames.map((f, i) => (
            <Panel key={i} className="space-y-1.5 p-3 text-[13px]">
              <p className="text-stone-500">{i === 0 ? 'On scan' : <>After input <Mono>{JSON.stringify(f.input)}</Mono></>}</p>
              {f.error ? (
                <p className="text-red-300">Refused: {f.error}</p>
              ) : (
                <p>
                  <Status value={f.status} /> {f.step && <>at step {f.cursor + 1} <Mono className="text-amber-300">{f.step}</Mono></>}
                  {f.waitingFor && <span className="text-stone-400"> waiting for {f.waitingFor}</span>}
                  {f.reason && <span className="text-red-300"> ({f.reason})</span>}
                </p>
              )}
              {f.view?.fields && <p className="text-stone-400">Guest sees: {f.view.fields.map((x) => `${x.label}${x.options ? ` [${x.options.map((o) => o.value).join(', ')}]` : ''}`).join(' · ')}</p>}
              {f.emits?.length > 0 && <p className="text-sky-300">Emits: {f.emits.map((e) => e.kind).join(', ')} → outbox</p>}
              <p className="text-stone-500">state <Mono>{JSON.stringify(f.state)}</Mono></p>
            </Panel>
          ))}
          {result?.trail && (
            <div>
              <p className="mb-1 mt-3 text-[12px] text-stone-500">Trail</p>
              <Json value={result.trail} />
            </div>
          )}
        </div>
      </div>
    </>
  )
}
