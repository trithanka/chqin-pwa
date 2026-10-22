import { useEffect, useState } from 'react'
import { IdCard, Plus, Trash2, UserRound } from 'lucide-react'
import { Button, PageHeader, Panel } from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'
import { useApi } from '../useApi'

const OPTIONS = [
  {
    value: 'basic',
    icon: UserRound,
    title: 'Ask for details',
    body: 'People fill in a short form you design below. Quick; nothing is checked against a government record.',
  },
  {
    value: 'aadhaar',
    icon: IdCard,
    title: 'Aadhaar verification',
    body: 'Everyone verifies once with an OTP to their Aadhaar-linked mobile. Use this where you need a verified identity.',
  },
]

const CORE = [
  ['dateOfBirth', 'Date of birth'],
  ['address', 'Address'],
  ['phone', 'Mobile number'],
]
const MODES = [
  ['required', 'Required'],
  ['optional', 'Optional'],
  ['off', 'Don’t ask'],
]

const keyOf = (label, taken) => {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'field'
  let key = base
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`
  return key
}

const inputClass =
  'h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15'

/** How people are identified at this venue, and what the form asks when it isn't Aadhaar. */
export default function EntrySettingsPage() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/entry-settings'))
  const [identity, setIdentity] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    if (data) {
      setIdentity(data.identity)
      setForm(data.identityForm)
    }
  }, [data])

  const change = (fn) => {
    setSaved(false)
    fn()
  }
  const setMode = (key, mode) => change(() => setForm((f) => ({ ...f, [key]: mode })))
  const setExtra = (i, patch) =>
    change(() => setForm((f) => ({ ...f, extra: f.extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) })))
  const addExtra = () =>
    change(() =>
      setForm((f) => ({ ...f, extra: [...f.extra, { key: '', label: '', kind: 'text', options: [], required: false }] })),
    )
  const removeExtra = (i) => change(() => setForm((f) => ({ ...f, extra: f.extra.filter((_, j) => j !== i) })))

  const save = async () => {
    setBusy(true)
    setProblem(null)
    try {
      // A key is made from the question once and then kept, so a renamed
      // question still lines up with the guest's answer on this screen.
      const taken = form.extra.map((x) => x.key).filter(Boolean)
      const extra = form.extra
        .filter((x) => x.label.trim())
        .map((x) => {
          const key = x.key || keyOf(x.label, taken)
          taken.push(key)
          return {
            key,
            label: x.label.trim(),
            kind: x.kind,
            required: x.required,
            ...(x.kind === 'choice' ? { options: (x.options ?? []).map((o) => o.trim()).filter(Boolean) } : {}),
          }
        })
      await api.post('/staff/entry-settings', {
        ...(data.canChoose ? { identity } : {}),
        identityForm: { ...form, extra },
      })
      setSaved(true)
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Identification" subtitle="How people prove who they are when they scan your entrance code." />
      <Async loading={loading} error={error} onRetry={reload}>
        {data && form && (
          <>
            {!data.aadhaarAccess && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-medium text-amber-800 ring-1 ring-amber-200">
                Aadhaar verification isn’t enabled for this venue. Contact ChqIn to turn it on.
              </p>
            )}
            {data.canChoose ? (
              <div className="grid gap-3">
                {OPTIONS.map(({ value, icon: Icon, title, body }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => change(() => setIdentity(value))}
                    className={`flex items-start gap-4 rounded-2xl border p-5 text-left transition-colors ${
                      identity === value ? 'border-brand bg-brand-soft' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200">
                      <Icon size={18} />
                    </span>
                    <span>
                      <span className="block text-[15px] font-bold text-slate-900">{title}</span>
                      <span className="mt-1 block text-[13px] leading-relaxed text-slate-500">{body}</span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              data.aadhaarAccess && (
                <Panel className="p-4 text-[13px] text-slate-600">
                  Every guest verifies with <b>Aadhaar</b> once. After that, their passkey is enough.
                </Panel>
              )
            )}

            {identity === 'basic' && (
              <Panel className="space-y-5 p-5">
                <div>
                  <p className="text-[15px] font-bold text-slate-900">What the form asks</p>
                  <p className="mt-1 text-[13px] text-slate-500">Full name is always asked.</p>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {CORE.map(([key, label]) => (
                    <div key={key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <span className="text-[13.5px] font-semibold text-slate-800">{label}</span>
                      <div className="flex rounded-lg bg-slate-100 p-0.5">
                        {MODES.map(([mode, text]) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setMode(key, mode)}
                            className={`rounded-md px-2.5 py-1 text-[12px] font-bold ${
                              form[key] === mode ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
                            }`}
                          >
                            {text}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-3">
                  <p className="text-[13.5px] font-bold text-slate-800">Your own questions</p>
                  {form.extra.length === 0 && (
                    <p className="text-[13px] text-slate-400">None yet. Add one for anything else you need, like company or vehicle number.</p>
                  )}
                  {form.extra.map((x, i) => (
                    <div key={x.key || `new-${i}`} className="space-y-2.5 rounded-xl border border-slate-200 p-3.5">
                      <div className="flex gap-2">
                        <input
                          value={x.label}
                          onChange={(e) => setExtra(i, { label: e.target.value })}
                          placeholder="Question, e.g. Company"
                          maxLength={80}
                          className={inputClass}
                        />
                        <select
                          value={x.kind}
                          onChange={(e) => setExtra(i, { kind: e.target.value })}
                          className={`${inputClass} w-40 shrink-0`}
                        >
                          <option value="text">Text answer</option>
                          <option value="choice">Pick from a list</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeExtra(i)}
                          aria-label="Remove question"
                          className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      {x.kind === 'choice' && (
                        <input
                          value={(x.options ?? []).join(',')}
                          onChange={(e) => setExtra(i, { options: e.target.value.split(',') })}
                          placeholder="Options, separated by commas: Yes, No"
                          className={inputClass}
                        />
                      )}
                      <label className="flex items-center gap-2 text-[12.5px] font-medium text-slate-600">
                        <input type="checkbox" checked={x.required} onChange={(e) => setExtra(i, { required: e.target.checked })} />
                        Required
                      </label>
                    </div>
                  ))}
                  {form.extra.length < 10 && (
                    <Button tone="ghost" size="sm" icon={Plus} onClick={addExtra}>
                      Add a question
                    </Button>
                  )}
                </div>
              </Panel>
            )}

            <Panel className="flex items-center justify-between gap-4 p-4">
              <p className="text-[13px] font-medium text-slate-500">
                {saved ? 'Saved. New arrivals see this straight away.' : 'People already in the middle of a check-in keep what they started with.'}
              </p>
              <Button onClick={save} loading={busy}>
                Save
              </Button>
            </Panel>
            {problem && <p className="text-[13px] font-medium text-red-600">{problem}</p>}
          </>
        )}
      </Async>
    </div>
  )
}
