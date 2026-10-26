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
      await api.post('/staff/hosts', { name: name.trim(), phone: phone || null })
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
            <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
              <span className="shrink-0 select-none border-r border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-bold text-slate-700">
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                aria-label="10-digit WhatsApp number"
                className="h-10 w-full bg-transparent px-3 text-[14px] font-semibold tabular-nums text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </Field>
          <Button type="submit" icon={UserPlus} loading={busy} disabled={!name.trim() || (phone.length > 0 && phone.length < 10)}>
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
                  <p className="mt-0.5 text-[13px] text-slate-500">{h.phone ? `+91 ${h.phone.replace(/\D/g, '').slice(-10)}` : 'No number — notices show on Today only'}</p>
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
