import { useState } from 'react'
import { CalendarPlus, CalendarDays } from 'lucide-react'
import { Button, EmptyState, Field, Input, PageHeader, Panel, Select, StatusPill } from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'
import { useApi } from '../useApi'

/**
 * Events visitors can check in to. An active event appears in the visitor's
 * list at once; the organiser is told when someone checks in.
 */
export default function EventsPage() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/events'))
  const { data: hostData } = useApi(() => api.get('/staff/hosts'))
  const [name, setName] = useState('')
  const [organizerId, setOrganizerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)

  const add = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await api.post('/staff/events', { name: name.trim(), organizerId: organizerId || null })
      setName('')
      reload()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (event) => {
    try {
      await api.post(`/staff/events/${event.id}/active`, { active: !event.active })
      reload()
    } catch (err) {
      setProblem(err.message)
    }
  }

  const events = data?.events ?? []
  const hosts = (hostData?.hosts ?? []).filter((h) => h.active)

  return (
    <div className="space-y-6">
      <PageHeader title="Events" subtitle="Create an event; visitors then see it when they check in for one." />

      <Panel className="p-5">
        <form onSubmit={add} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Event name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Founder Meetup" maxLength={160} />
          </Field>
          <Field label="Organiser (told on each check-in)">
            <Select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)}>
              <option value="">No organiser</option>
              {hosts.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" icon={CalendarPlus} loading={busy} disabled={!name.trim()}>
            Create active event
          </Button>
        </form>
        {problem && <p className="mt-3 text-[13px] font-medium text-red-600">{problem}</p>}
      </Panel>

      <Async loading={loading} error={error} onRetry={reload}>
        {events.length ? (
          <div className="grid gap-3">
            {events.map((ev) => (
              <Panel key={ev.id} className="flex items-center justify-between gap-4 p-4">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-slate-900">{ev.name}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">{ev.organizer ?? 'No organiser'}</p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusPill tone={ev.active ? 'good' : 'muted'}>{ev.active ? 'Active' : 'Paused'}</StatusPill>
                  <Button tone="secondary" size="sm" onClick={() => toggle(ev)}>
                    {ev.active ? 'Pause' : 'Activate'}
                  </Button>
                </div>
              </Panel>
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} title="No events yet" body="Create the first one above." />
        )}
      </Async>
    </div>
  )
}
