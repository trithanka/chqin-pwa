import { useEffect, useState } from 'react'
import { IdCard, UserRound } from 'lucide-react'
import { Button, PageHeader, Panel } from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'
import { useApi } from '../useApi'

const OPTIONS = [
  {
    value: 'basic',
    icon: UserRound,
    title: 'Name and mobile number',
    body: 'Visitors type who they are and a number to reach them. Quick, nothing is checked against a government record.',
  },
  {
    value: 'aadhaar',
    icon: IdCard,
    title: 'Aadhaar verification',
    body: 'Every visitor verifies once with an OTP to their Aadhaar-linked mobile. Use this where you need a verified identity.',
  },
]

/** How visitors are identified at this venue's entrance — meetings and events alike. */
export default function EntrySettingsPage() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/entry-settings'))
  const [identity, setIdentity] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    if (data) setIdentity(data.identity)
  }, [data])

  const save = async () => {
    setBusy(true)
    setProblem(null)
    try {
      await api.post('/staff/entry-settings', { identity })
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
      <PageHeader
        title="Visitor identification"
        subtitle="Applies to everyone who scans the entrance code, for meetings and events."
      />
      <Async loading={loading} error={error} onRetry={reload}>
        <div className="grid gap-3">
          {OPTIONS.map(({ value, icon: Icon, title, body }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setIdentity(value)
                setSaved(false)
              }}
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
        <Panel className="mt-4 flex items-center justify-between gap-4 p-4">
          <p className="text-[13px] font-medium text-slate-500">
            {saved ? 'Saved. New visitors see this straight away.' : 'Visitors already in the middle of a check-in keep what they started with.'}
          </p>
          <Button onClick={save} loading={busy} disabled={!identity || identity === data?.identity}>
            Save
          </Button>
        </Panel>
        {problem && <p className="mt-3 text-[13px] font-medium text-red-600">{problem}</p>}
      </Async>
    </div>
  )
}
