import { useState } from 'react'
import { CalendarPlus, CalendarDays, ChevronDown, Pencil } from 'lucide-react'
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
              <EventRow key={ev.id} event={ev} hosts={hosts} onToggle={() => toggle(ev)} onSaved={reload} />
            ))}
          </div>
        ) : (
          <EmptyState icon={CalendarDays} title="No events yet" body="Create the first one above." />
        )}
      </Async>
    </div>
  )
}

function EventRow({ event, hosts, onToggle, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [showing, setShowing] = useState(false)
  const [name, setName] = useState(event.name)
  const [organizerId, setOrganizerId] = useState(event.organizerId ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)

  const open = () => {
    setName(event.name)
    setOrganizerId(event.organizerId ?? '')
    setProblem(null)
    setEditing(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await api.post(`/staff/events/${event.id}`, { name: name.trim(), organizerId: organizerId || null })
      setEditing(false)
      onSaved()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  // A paused organiser stays selectable here so editing the name doesn't drop them.
  const choices = event.organizerId && !hosts.some((h) => h.id === event.organizerId)
    ? [...hosts, { id: event.organizerId, name: event.organizer ?? 'Current organiser' }]
    : hosts

  if (editing) {
    return (
      <Panel className="p-4">
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Event name">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} autoFocus />
          </Field>
          <Field label="Organiser (told on each check-in)">
            <Select value={organizerId} onChange={(e) => setOrganizerId(e.target.value)}>
              <option value="">No organiser</option>
              {choices.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button tone="ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Save
            </Button>
          </div>
        </form>
        {problem && <p className="mt-3 text-[13px] font-medium text-red-600">{problem}</p>}
      </Panel>
    )
  }

  return (
    <Panel className="p-4">
      <div className="flex items-center justify-between gap-4">
      <button
        type="button"
        onClick={() => setShowing((v) => !v)}
        aria-expanded={showing}
        className="group min-w-0 text-left"
      >
        <p className="flex items-center gap-1.5 truncate text-[15px] font-bold text-slate-900 group-hover:text-brand">
          {event.name}
          <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${showing ? 'rotate-180' : ''}`} />
        </p>
        <p className="mt-0.5 text-[13px] text-slate-500">{event.organizer ?? 'No organiser'}</p>
      </button>
      <div className="flex items-center gap-3">
        <StatusPill tone={event.active ? 'good' : 'muted'}>{event.active ? 'Active' : 'Paused'}</StatusPill>
        <Button tone="secondary" size="sm" icon={Pencil} onClick={open}>
          Edit
        </Button>
        <Button tone="secondary" size="sm" onClick={onToggle}>
          {event.active ? 'Pause' : 'Activate'}
        </Button>
      </div>
      </div>
      {showing && <Attendees eventId={event.id} />}
    </Panel>
  )
}

const when = (iso) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })

/** Everyone who checked in to the event, newest first. */
function Attendees({ eventId }) {
  const { data, error, loading, reload } = useApi(() => api.get(`/staff/events/${eventId}/attendees`), [eventId])
  const people = data?.attendees ?? []
  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      <Async loading={loading} error={error} onRetry={reload}>
        {people.length ? (
          <>
            <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-slate-400">
              {people.length} {people.length === 1 ? 'person' : 'people'} checked in
            </p>
            <ul className="divide-y divide-slate-100">
              {people.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{p.name}</p>
                    <p className="truncate text-[12.5px] text-slate-500">
                      {[p.designation, p.company].filter(Boolean).join(' · ') || '—'}
                    </p>
                  </div>
                  <span className="shrink-0 text-[12.5px] tabular-nums text-slate-500">{when(p.at)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-[13px] text-slate-500">No one has checked in yet.</p>
        )}
      </Async>
    </div>
  )
}
