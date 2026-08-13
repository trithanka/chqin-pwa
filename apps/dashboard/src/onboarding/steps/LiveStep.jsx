import { useState } from 'react'
import { ArrowRight, Building2, Check, RotateCcw, Users } from 'lucide-react'
import { Button, Panel, Pill } from '../../components/ui'
import StepHeader from '../../components/StepHeader'

/**
 * The summary, and the only stand-in in this flow: "Go live" has nothing to
 * post to yet.
 */
export default function LiveStep({ data, onRestart, onComplete }) {
  const [live, setLive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const goLive = async () => {
    setBusy(true)
    setError(null)
    try {
      await onComplete?.(data)
      setLive(true)
    } catch (err) {
      // Most likely "that email already has an account" — recoverable, and the
      // wizard's answers are still on screen to fix.
      setError(err.message ?? 'Could not finish setup.')
    } finally {
      setBusy(false)
    }
  }

  if (live) {
    return (
      <div className="flex flex-col items-center pt-6 text-center">
        <span className="mb-6 grid size-16 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_12px_32px_rgba(5,150,105,0.32)]">
          <Check size={32} strokeWidth={3} />
        </span>
        <h1 className="text-[28px] font-extrabold tracking-[-0.03em] text-slate-900">
          {data.property.name} is live
        </h1>
        <p className="mt-2.5 max-w-[42ch] text-[14.5px] leading-relaxed text-slate-500">
          Put the printed card on the desk and scan it with your own phone to
          walk through what a guest sees. Today's arrivals will appear on your
          dashboard as they check in.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Button iconRight={ArrowRight} onClick={() => window.location.assign('/app')}>
            Go to dashboard
          </Button>
          <Button tone="ghost" icon={RotateCcw} onClick={onRestart}>
            Start over
          </Button>
        </div>

        <p className="mt-10 text-[12px] text-slate-400">
          Your property, rooms and account are saved. Guests can check in as
          soon as the card is on the desk.
        </p>
      </div>
    )
  }

  return (
    <div>
      <StepHeader
        eyebrow="Last step"
        title="Ready to go live"
        body="Check it over. Everything here can be changed later from settings."
      />

      <div className="flex flex-col gap-3">
        <Summary
          icon={Building2}
          title={data.property.name || 'Unnamed property'}
          lines={[
            [data.property.address, data.property.city].filter(Boolean).join(', ') ||
              data.property.city,
            data.property.timezone,
          ]}
          badge={<Pill tone="brand">{data.rooms.length} rooms</Pill>}
        />

        <Summary
          icon={Users}
          title={`${data.team.length + 1} person${data.team.length ? 's' : ''} with access`}
          lines={[
            `${data.account.name || 'You'} · owner`,
            data.team.length
              ? data.team.map((m) => m.email).join(', ')
              : 'No one else invited yet',
          ]}
        />
      </div>

      {error && (
        <p className="mt-6 rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-8">
        <Button iconRight={ArrowRight} onClick={goLive} loading={busy}>
          Go live
        </Button>
        <p className="mt-3 text-[12.5px] text-slate-500">
          Invitations go out now. Guests can check in as soon as the card is on
          the desk.
        </p>
      </div>
    </div>
  )
}

function Summary({ icon: Icon, title, lines, badge }) {
  return (
    <Panel className="flex items-start gap-3.5 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <Icon size={17} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[14.5px] font-bold tracking-[-0.01em] text-slate-900">
            {title}
          </p>
          {badge}
        </div>
        {lines.filter(Boolean).map((line) => (
          <p key={line} className="truncate text-[13px] text-slate-500">
            {line}
          </p>
        ))}
      </div>
    </Panel>
  )
}
