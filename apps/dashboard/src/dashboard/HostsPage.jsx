import { useState } from 'react'
import { UserPlus, Users } from 'lucide-react'
import { Button, EmptyState, Field, Input, PageHeader, Panel, StatusPill } from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'
import { useApi } from '../useApi'

/**
 * The people and teams a visitor can ask to see. The number is where their
 * arrival notice goes; without one the request still shows on Today.
 */
export default function HostsPage() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/hosts'))
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await api.post('/staff/hosts', { name: name.trim(), phone: phone.trim() || null })
      setName('')
      setPhone('')
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (host) => {
    try {
      await api.post(`/staff/hosts/${host.id}`, { active: !host.active })
      reload()
    } catch (err) {
      setProblem(err.message)
    }
  }

  const hosts = data?.hosts ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="People & teams"
        subtitle="Who visitors can ask to see, and where their arrival notice goes."
      />

      <Panel className="p-5">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CEO Office" maxLength={120} />
          </Field>
          <Field label="WhatsApp number (optional)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" />
          </Field>
          <Button type="submit" icon={UserPlus} loading={busy} disabled={!name.trim()}>
            Add
          </Button>
        </form>
        {problem && <p className="mt-3 text-[13px] font-medium text-red-600">{problem}</p>}
      </Panel>

      <Async loading={loading} error={error} onRetry={reload}>
        {hosts.length ? (
          <div className="grid gap-3">
            {hosts.map((h) => (
              <Panel key={h.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-slate-900">{h.name}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">{h.phone ?? 'No number — notices show on Today only'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={h.active ? 'good' : 'muted'}>{h.active ? 'Active' : 'Paused'}</StatusPill>
                  <Button tone="secondary" size="sm" onClick={() => toggle(h)}>
                    {h.active ? 'Pause' : 'Activate'}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyState icon={Users} title="No people or teams yet" body="Add the first one above. Visitors can't pick a host until you do." />
        )}
      </Async>
    </div>
  )
}
