import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, CircleCheck, Clock3, CircleX, RotateCcw } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { visitStep } from '../checkin'
import { succeeded } from '../lib/haptics'

/**
 * Every question and answer after identity, drawn from what the server says the
 * current step is. This screen knows nothing about meetings or events: it draws
 * a form for `collect_details`, a waiting screen when a person has to decide,
 * and a result. A new flow made of the same steps needs no change here.
 */

const POLL_MS = 4000

const inputClass =
  'h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[16px] font-medium text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/12'

export default function VisitScreen({ session, onDone, direction }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [values, setValues] = useState({})
  const busyRef = useRef(false)

  const send = useCallback(
    async (answers) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        setView(await visitStep(session.sessionId, answers))
        setValues({})
      } catch (err) {
        setError(err.message)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [session.sessionId],
  )

  // Ask where we are on arrival, and keep asking while a person decides. A poll
  // that changes nothing writes nothing on the server.
  useEffect(() => {
    send()
  }, [send])

  const waitingOnStaff = view?.status === 'waiting' && view.waitingFor === 'staff'
  useEffect(() => {
    if (!waitingOnStaff) return
    const timer = setInterval(() => {
      visitStep(session.sessionId).then(setView).catch(() => {})
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [waitingOnStaff, session.sessionId])

  const done = view?.status === 'done'
  useEffect(() => {
    if (done) succeeded()
  }, [done])

  if (!view) {
    return (
      <Screen direction={direction} className="justify-center px-7">
        {error ? <Retry message={error} onRetry={() => send()} /> : (
          <p className="text-center text-[14px] font-semibold text-slate-400">One moment…</p>
        )}
      </Screen>
    )
  }

  if (view.status === 'done') {
    const isEvent = view.purpose === 'event'
    return (
      <Result
        direction={direction}
        icon={CircleCheck}
        tone="text-emerald-600 bg-emerald-50"
        title={isEvent ? 'You’re in!' : 'Visit confirmed'}
        body={
          isEvent
            ? `Your attendance at ${view.event ?? 'the event'} is recorded.`
            : `${view.host ?? 'Your host'} confirmed your visit.`
        }
        action={<PrimaryButton onClick={onDone} tone="success">Done</PrimaryButton>}
      />
    )
  }

  if (view.status === 'rejected') {
    return (
      <Result
        direction={direction}
        icon={CircleX}
        tone="text-red-600 bg-red-50"
        title="Not able to see you now"
        body={`${view.host ?? 'Your host'} can’t meet right now. Please check with reception.`}
        action={<PrimaryButton onClick={onDone} tone="dark">Close</PrimaryButton>}
      />
    )
  }

  if (view.status === 'expired' || view.status === 'revoked') {
    return (
      <Result
        direction={direction}
        icon={RotateCcw}
        tone="text-slate-600 bg-slate-100"
        title="This check-in timed out"
        body="Scan the code at the entrance again to start over."
        action={<PrimaryButton onClick={onDone} tone="dark">Scan again</PrimaryButton>}
      />
    )
  }

  if (waitingOnStaff) {
    return (
      <Result
        direction={direction}
        icon={Clock3}
        tone="text-blue-600 bg-blue-50"
        title={view.held ? 'Please wait at reception' : 'Request sent'}
        body={
          view.held
            ? `${view.host ?? 'Your host'} will be with you shortly.`
            : `${view.host ?? 'Your host'} has been notified. This screen updates when they reply.`
        }
        footer={<span className="text-[12.5px] font-semibold text-slate-400">Waiting for a reply…</span>}
      />
    )
  }

  const fields = view.step?.type === 'collect_details' ? view.step.fields : []
  if (!fields.length) {
    return (
      <Screen direction={direction} className="justify-center px-7">
        <Retry message={error ?? 'Something is missing. Try again.'} onRetry={() => send()} />
      </Screen>
    )
  }

  // One multiple-choice question is a list of big buttons: tapping answers it.
  if (fields.length === 1 && fields[0].kind === 'choice') {
    const [field] = fields
    return (
      <Screen direction={direction} className="pt-14 pb-8 px-7">
        <ScreenTitle title={field.label} />
        <div className="grid gap-3">
          {field.options.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={busy}
              onClick={() => send({ [field.key]: o.value })}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-[18px] text-left text-[16px] font-bold text-slate-900 transition-colors hover:border-blue-600 active:scale-[0.99] disabled:opacity-50"
            >
              {o.label}
              <ArrowRight size={18} className="text-slate-400" />
            </button>
          ))}
          {!field.options.length && (
            <p className="text-[14px] font-medium text-slate-500">Nothing to choose from yet. Ask at reception.</p>
          )}
        </div>
        {error && <p className="mt-4 text-[13.5px] font-medium text-red-600">{error}</p>}
      </Screen>
    )
  }

  const ready = fields.every((f) => (values[f.key] ?? '').trim())
  return (
    <Screen direction={direction} className="justify-between pt-14 pb-8 px-7">
      <div>
        <ScreenTitle title="A few details" />
        <div className="grid gap-4">
          {fields.map((f) => (
            <label key={f.key} className="grid gap-1.5">
              <span className="text-[12px] font-bold text-slate-500">{f.label}</span>
              {f.kind === 'choice' ? (
                <select
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">Select</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={values[f.key] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  autoComplete="off"
                  maxLength={120}
                  className={inputClass}
                />
              )}
            </label>
          ))}
        </div>
        {error && <p className="mt-4 text-[13.5px] font-medium text-red-600">{error}</p>}
      </div>
      <div className="pt-6">
        <PrimaryButton onClick={() => send(values)} loading={busy} disabled={!ready} icon={ArrowRight}>
          Confirm arrival
        </PrimaryButton>
      </div>
    </Screen>
  )
}

function Result({ icon: Icon, tone, title, body, action, footer, direction }) {
  return (
    <Screen direction={direction} className="justify-between pt-safe pb-8 px-7 sm:pt-7">
      <div className="grid flex-1 place-content-center justify-items-center gap-4 text-center">
        <span className={`grid size-20 place-items-center rounded-full ${tone}`}>
          <Icon size={38} strokeWidth={2} />
        </span>
        <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-slate-900">{title}</h1>
        <p className="max-w-[280px] text-[14.5px] font-medium leading-relaxed text-slate-500">{body}</p>
        {footer}
      </div>
      {action && <div className="pt-6">{action}</div>}
    </Screen>
  )
}

function Retry({ message, onRetry }) {
  return (
    <div className="grid justify-items-center gap-4 text-center">
      <p className="text-[14px] font-medium text-slate-600">{message}</p>
      <div className="w-full max-w-[220px]">
        <PrimaryButton onClick={onRetry} tone="dark">Try again</PrimaryButton>
      </div>
    </div>
  )
}
