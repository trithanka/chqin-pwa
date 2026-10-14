import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Clock, DoorOpen, Users, X } from 'lucide-react'
import {
  Button,
  EmptyState,
  PageHeader,
  Panel,
  StatTile,
  StatusPill,
  TableWrap,
  Td,
  Th,
} from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'

const POLL_MS = 5000

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

const TONE = { Pending: 'warn', Waiting: 'warn', Confirmed: 'good', 'Checked in': 'good' }

/**
 * Today at a venue that hosts visitors: who is waiting for a decision, and who
 * has come in. Polls quietly — a visitor is standing at reception, so a request
 * should appear without anyone pressing refresh.
 */
export default function VisitorsPage() {
  const [state, setState] = useState({ waiting: null, day: null, error: null })
  const [busy, setBusy] = useState(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    try {
      const [{ waiting }, day] = await Promise.all([
        api.get('/staff/visits/waiting'),
        api.get('/staff/visits/arrivals'),
      ])
      if (alive.current) setState({ waiting, day, error: null })
    } catch (error) {
      if (alive.current) setState((s) => ({ ...s, error }))
    }
  }, [])

  useEffect(() => {
    alive.current = true
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [load])

  const decide = async (sessionId, decision) => {
    setBusy(sessionId)
    try {
      await api.post(`/staff/visits/${sessionId}/decision`, { decision })
    } catch (error) {
      setState((s) => ({ ...s, error }))
    } finally {
      setBusy(null)
      load()
    }
  }

  const { waiting, day, error } = state
  const loading = !day && !error

  return (
    <div className="space-y-6">
      <PageHeader title="Today" subtitle="Visitors at the entrance, updated as they arrive." />

      <Async loading={loading} error={!day ? error : null} onRetry={load}>
        {day && (
          <>
            {error && <p className="text-[13px] font-medium text-red-600">{error.message}</p>}

            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile label="Total arrivals" value={day.counts.arrivals} icon={Users} />
              <StatTile label="Waiting" value={day.counts.waiting} icon={Clock} tone="warn" />
              <StatTile label="Event check-ins" value={day.counts.events} icon={DoorOpen} tone="good" />
            </div>

            <section className="space-y-3">
              <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-slate-900">
                Waiting for a decision
              </h2>
              {waiting.length ? (
                <div className="grid gap-3">
                  {waiting.map((w) => (
                    <Panel key={w.sessionId} className="flex flex-wrap items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-bold text-slate-900">{w.visitor}</p>
                        <p className="mt-0.5 text-[13px] text-slate-500">
                          {w.purposeLabel} · to see {w.host ?? 'a host'} · since {time(w.since)}
                          {w.held ? ' · asked to wait' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          icon={Check}
                          loading={busy === w.sessionId}
                          onClick={() => decide(w.sessionId, 'confirm')}
                        >
                          Confirm
                        </Button>
                        <Button
                          tone="secondary"
                          size="sm"
                          icon={Clock}
                          disabled={busy === w.sessionId || w.held}
                          onClick={() => decide(w.sessionId, 'hold')}
                        >
                          Keep waiting
                        </Button>
                        <Button
                          tone="danger"
                          size="sm"
                          icon={X}
                          disabled={busy === w.sessionId}
                          onClick={() => decide(w.sessionId, 'decline')}
                        >
                          Decline
                        </Button>
                      </div>
                    </Panel>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Clock}
                  title="Nobody is waiting"
                  body="A visitor who needs a host's approval will appear here the moment they send a request."
                />
              )}
            </section>

            <section className="space-y-3">
              <h2 className="text-[15px] font-extrabold tracking-[-0.02em] text-slate-900">
                Arrivals today
              </h2>
              {day.rows.length ? (
                <TableWrap>
                  <thead>
                    <tr>
                      <Th>Visitor</Th>
                      <Th>Purpose</Th>
                      <Th>Person / event</Th>
                      <Th>Time</Th>
                      <Th>Status</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {day.rows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100 last:border-0">
                        <Td className="font-semibold text-slate-900">
                          {r.visitor}
                          {r.company && (
                            <div className="text-[12px] font-medium text-slate-400">
                              {r.company} · {r.designation}
                            </div>
                          )}
                        </Td>
                        <Td>{r.purpose}</Td>
                        <Td>{r.destination ?? '—'}</Td>
                        <Td>{time(r.at)}</Td>
                        <Td>
                          <StatusPill tone={TONE[r.status] ?? 'neutral'}>{r.status}</StatusPill>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </TableWrap>
              ) : (
                <EmptyState icon={Users} title="No arrivals yet" body="Visitors who scan the entrance code show up here." />
              )}
            </section>
          </>
        )}
      </Async>
    </div>
  )
}
