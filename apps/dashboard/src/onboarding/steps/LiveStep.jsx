import { useState } from 'react'
import { ArrowRight, Building2, Check, Headphones, RotateCcw, Users } from 'lucide-react'
import { Button, Card, Pill, StepHeader } from '../kit'
import DeskCard from '../DeskCard'
import { serviceLabel } from '../services'

/**
 * The last screen: check it over, then create the account, the property, its
 * rooms and its desk QR in one request.
 *
 * Nothing is posted before this point. A half-created property with no rooms
 * and no owner is worse than one the person can retry.
 */
export default function LiveStep({ data, onRestart, onComplete }) {
  const [token, setToken] = useState(null)
  const [live, setLive] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const goLive = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await onComplete?.(data)
      // The desk code is minted server-side on the first read. If that read
      // fails the property is still live — the card just comes from the
      // dashboard instead, so this doesn't undo the registration.
      setToken(result?.token ?? null)
      setLive(true)
    } catch (err) {
      // Most likely "that email already has an account" — recoverable, and the
      // answers are still on screen to fix.
      setError(err.message ?? 'Could not finish setup.')
    } finally {
      setBusy(false)
    }
  }

  if (live) {
    return (
      <div className="flex flex-col items-center pt-2 text-center">
        {/* Printing drops everything but the card: `.print-card` is fixed to
            the page, so anything still flowing prints underneath it. */}
        <div className="print-hide flex flex-col items-center">
          <span className="mb-6 grid size-16 place-items-center rounded-full bg-onb-green text-onb-ink">
            <Check size={32} strokeWidth={3} />
          </span>
          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-onb-text">
            You're live
          </h1>
          <p className="mt-2 max-w-[38ch] text-[14.5px] leading-relaxed text-onb-muted">
            {data.property.name} is on ChqIn. Put this card where guests arrive,
            then scan it with your own phone to see what they see.
          </p>
        </div>

        <div className="mt-7 w-full">
          <DeskCard propertyName={data.property.name} token={token} />
        </div>

        <div className="print-hide mt-8 flex w-full flex-col gap-2.5">
          <Button
            iconRight={ArrowRight}
            onClick={() => window.location.assign('/app')}
            className="w-full"
          >
            Go to dashboard
          </Button>
          <Button tone="ghost" icon={RotateCcw} onClick={onRestart} className="w-full">
            Start over
          </Button>
        </div>
      </div>
    )
  }

  const contactCount = new Set(
    data.services.map((s) => (data.contacts[s] ?? '').trim()).filter(Boolean),
  ).size

  return (
    <div>
      <StepHeader
        title="You're almost live"
        body="Check it over. Everything here can be changed later from settings."
      />

      <div className="flex flex-col gap-3">
        <Summary
          icon={Building2}
          title={data.property.name || 'Unnamed property'}
          lines={[
            [data.property.address, data.property.city].filter(Boolean).join(', ') ||
              data.property.city,
            data.business.gstin ? `GSTIN ${data.business.gstin}` : null,
          ]}
          badge={<Pill tone="green">{data.rooms.length} rooms</Pill>}
        />

        <Summary
          icon={Headphones}
          title={`${data.services.length} guest services`}
          lines={[data.services.map(serviceLabel).join(', ')]}
          badge={
            <Pill tone="green">
              {contactCount} number{contactCount === 1 ? '' : 's'}
            </Pill>
          }
        />

        <Summary
          icon={Users}
          title={data.account.name || 'You'}
          lines={[data.account.email, 'Property admin']}
        />
      </div>

      {/* A drawn box rather than the platform's: a native checkbox renders
          white on this background and is the one bright rectangle on the
          screen. Same shape as every other tick in the flow. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={confirmed}
        onClick={() => setConfirmed((c) => !c)}
        className="mt-6 flex w-full items-start gap-3 rounded-2xl border border-onb-line bg-onb-surface p-4 text-left"
      >
        <span
          className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
            confirmed ? 'border-onb-green bg-onb-green text-onb-ink' : 'border-onb-line'
          }`}
        >
          {confirmed && <Check size={14} strokeWidth={3.4} />}
        </span>
        <span className="text-[13.5px] leading-relaxed text-onb-muted">
          I confirm I'm authorised to activate ChqIn for this property and agree
          to the terms and privacy policy.
        </span>
      </button>

      {error && (
        <p className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-[13.5px] font-medium text-red-400">
          {error}
        </p>
      )}

      <div className="mt-6">
        <Button
          iconRight={ArrowRight}
          onClick={goLive}
          loading={busy}
          disabled={!confirmed}
          className="w-full"
        >
          {busy ? 'Setting up…' : 'Activate ChqIn'}
        </Button>
        <p className="mt-3 text-center text-[12.5px] text-onb-muted">
          Guests can check in as soon as the card is on the desk.
        </p>
      </div>
    </div>
  )
}

function Summary({ icon: Icon, title, lines, badge }) {
  return (
    <Card className="flex items-start gap-3.5 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-onb-raised text-onb-green">
        <Icon size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-onb-text">{title}</p>
          {badge}
        </div>
        {lines.filter(Boolean).map((line) => (
          <p key={line} className="truncate text-[13px] text-onb-muted">
            {line}
          </p>
        ))}
      </div>
    </Card>
  )
}
