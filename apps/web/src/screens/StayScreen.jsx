import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Clock, Coffee, LogOut, MessageCircle, Wifi } from 'lucide-react'
import { BottomSheet, Card, PrimaryButton, Screen, SecondaryButton } from '../components/ui'
import { sendServiceRequest, sendStayDetails } from '../checkin'
import { tapped } from '../lib/haptics'
import { SERVICE, whatsappLink } from '../services'

/**
 * What the hotel provides, shown once the guest is checked in.
 *
 * Everything here is the property's own answers from onboarding — the services
 * it switched on, and the four facts guests otherwise phone the desk about.
 * Nothing is invented to fill the screen: a property that turned on two
 * services shows two tiles, and one that never set a Wi-Fi password shows no
 * Wi-Fi card.
 *
 * A tile sends the request to the team that service routes to. Where this
 * server sends WhatsApp (`stay.whatsapp`) it is sent from here, with an optional
 * note; everywhere else the tile opens the guest's own WhatsApp with the room
 * already in the message, which is what it always did.
 */
export default function StayScreen({ checkin, session, onDone, direction }) {
  const venueName = checkin?.venueName ?? session?.venue?.name
  const roomNumber = checkin?.roomNumber ?? session?.booking?.roomNumber

  const services = checkin?.stay?.services ?? []
  const sends = Boolean(checkin?.stay?.whatsapp)
  const [asking, setAsking] = useState(null) // the service being requested
  const essentials = checkin?.stay?.essentials ?? {}
  const { wifiSsid, wifiPassword, breakfastFrom, breakfastTo, checkoutTime, notes } = essentials

  const facts = [
    breakfastFrom && {
      icon: Coffee,
      label: 'Breakfast',
      value: breakfastTo ? `${breakfastFrom} – ${breakfastTo}` : `From ${breakfastFrom}`,
    },
    checkoutTime && { icon: LogOut, label: 'Check-out', value: checkoutTime },
    notes && { icon: Clock, label: 'Also good to know', value: notes },
  ].filter(Boolean)

  return (
    <Screen direction={direction} className="pt-safe px-6 pb-8 sm:pt-6">
      <header className="pt-2">
        <p className="text-[12.5px] font-semibold text-slate-400">{venueName}</p>
        <h1 className="mt-0.5 text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-slate-900">
          {roomNumber ? `You're in room ${roomNumber}` : "You're checked in"}
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
          {services.length
            ? 'Anything you need, ask from here.'
            : 'Enjoy your stay. Ask at the desk if you need anything.'}
        </p>
      </header>

      {services.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            What can we get you?
          </h2>
          <div className="grid grid-cols-3 gap-2.5">
            {services.map(({ key, contact }) => (
              <ServiceTile
                key={key}
                service={key}
                contact={contact}
                roomNumber={roomNumber}
                venueName={venueName}
                onAsk={sends ? setAsking : null}
              />
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
            {sends
              ? 'Goes straight to the team, with your room.'
              : 'Opens WhatsApp with your room already in the message.'}
          </p>
        </section>
      )}

      {sends && <DetailsOnWhatsApp sessionId={session?.sessionId} />}

      {(wifiSsid || facts.length > 0) && (
        <section className="mt-7">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Good to know
          </h2>

          {wifiSsid && <WifiCard ssid={wifiSsid} password={wifiPassword} />}

          {facts.length > 0 && (
            <Card className="mt-2.5 divide-y divide-slate-100">
              {facts.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3 px-4 py-3">
                  <Icon size={16} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-slate-400">{label}</p>
                    <p className="text-[14.5px] font-semibold text-slate-800">{value}</p>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      <div className="mt-8">
        <SecondaryButton onClick={onDone}>Done</SecondaryButton>
      </div>

      <RequestSheet
        service={asking}
        sessionId={session?.sessionId}
        onClose={() => setAsking(null)}
      />
    </Screen>
  )
}

function ServiceTile({ service, contact, roomNumber, venueName, onAsk }) {
  const { label, icon: Icon } = SERVICE[service] ?? {}
  const href = whatsappLink({ contact, service, roomNumber, venueName })

  // A number that can't be dialled gets no tile — the server already drops
  // services with no contact, so this is the malformed-number case.
  if (!label || !href) return null

  const face = (
    <>
      <Icon size={22} strokeWidth={1.9} className="text-blue-600" />
      <span className="text-[12.5px] font-semibold leading-tight text-slate-700">{label}</span>
    </>
  )
  const tile =
    'flex flex-col items-center gap-2 rounded-[20px] border border-slate-200/80 bg-white px-2 py-4 text-center shadow-[var(--shadow-soft)]'

  if (onAsk) {
    return (
      <motion.button
        type="button"
        onClick={() => {
          tapped()
          onAsk(service)
        }}
        whileTap={{ scale: 0.97 }}
        className={tile}
      >
        {face}
      </motion.button>
    )
  }

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={tapped}
      whileTap={{ scale: 0.97 }}
      className={tile}
    >
      {face}
    </motion.a>
  )
}

/**
 * The Wi-Fi password, copyable.
 *
 * Copying is the point: a guest reading a password off one screen to type it
 * into another is exactly the moment this app exists to remove.
 */
function WifiCard({ ssid, password }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    tapped()
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — the password is on screen to read either way */
    }
  }

  return (
    <Card className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <Wifi size={16} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-slate-400">Wi-Fi</p>
          <p className="truncate text-[14.5px] font-semibold text-slate-800">{ssid}</p>

          {password ? (
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-50 px-2.5 py-1.5 text-[13.5px] font-semibold text-slate-700">
                {password}
              </code>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy Wi-Fi password"
                className="grid size-9 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500"
              >
                {copied ? <Check size={15} strokeWidth={3} className="text-emerald-600" /> : <Copy size={15} />}
              </button>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-slate-500">Open network — no password needed.</p>
          )}
        </div>
      </div>
    </Card>
  )
}

/** A request, with an optional note, sent to the team that handles the service. */
function RequestSheet({ service, sessionId, onClose }) {
  const [note, setNote] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)
  const label = SERVICE[service]?.label

  const close = () => {
    setNote('')
    setState('idle')
    setError(null)
    onClose()
  }

  const send = async () => {
    if (state === 'sending') return
    setState('sending')
    setError(null)
    try {
      await sendServiceRequest(sessionId, service, note.trim())
      setState('sent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  return (
    <BottomSheet open={Boolean(service)} onClose={close} title={label ? `${label} request` : ''}>
      {state === 'sent' ? (
        <div className="pb-5">
          <p className="text-[14.5px] leading-relaxed text-slate-600">
            Sent. The team has been messaged and will be with you shortly.
          </p>
          <div className="mt-4">
            <SecondaryButton onClick={close}>Close</SecondaryButton>
          </div>
        </div>
      ) : (
        <div className="pb-5">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={140}
            rows={3}
            placeholder="Anything we should know? (optional)"
            className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-3.5 text-[16px] text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/12"
          />
          {error && <p className="mt-2 text-[13px] font-medium text-red-600">{error}</p>}
          <div className="mt-4">
            <PrimaryButton onClick={send} loading={state === 'sending'}>
              Send request
            </PrimaryButton>
          </div>
        </div>
      )}
    </BottomSheet>
  )
}

/**
 * Stay details, and later the room, on the guest's own WhatsApp. Entirely
 * optional: submitting a number is the opt-in, and the line under the field
 * says what it will be used for.
 */
function DetailsOnWhatsApp({ sessionId }) {
  const [digits, setDigits] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  const send = async () => {
    if (digits.length !== 10 || state === 'sending') return
    setState('sending')
    setError(null)
    try {
      await sendStayDetails(sessionId, `+91 ${digits}`)
      setState('sent')
    } catch (err) {
      setError(err.message)
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <Card className="mt-7 flex items-start gap-3 px-4 py-3.5">
        <Check size={16} className="mt-0.5 shrink-0 text-emerald-600" strokeWidth={3} />
        <p className="text-[14px] font-semibold text-slate-700">
          On its way to your WhatsApp. We'll message you again when your room is ready.
        </p>
      </Card>
    )
  }

  return (
    <Card className="mt-7 px-4 py-4">
      <div className="flex items-start gap-3">
        <MessageCircle size={16} className="mt-0.5 shrink-0 text-slate-400" strokeWidth={2} />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold text-slate-800">Keep these details on WhatsApp</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-slate-400">
            We'll send your Wi-Fi and check-out time, and your room number when it's assigned. Nothing else.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center overflow-hidden rounded-xl border border-slate-200 bg-white focus-within:border-blue-600">
              <span className="border-r border-slate-200 bg-slate-50 px-2.5 py-2.5 text-[13px] font-bold text-slate-600">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                value={digits}
                onChange={(e) => setDigits(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="9876543210"
                aria-label="Your 10-digit WhatsApp number"
                className="h-10 min-w-0 flex-1 bg-transparent px-2.5 text-[16px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={send}
              disabled={digits.length !== 10 || state === 'sending'}
              className="h-10 shrink-0 rounded-xl bg-blue-600 px-4 text-[13.5px] font-bold text-white disabled:opacity-40"
            >
              {state === 'sending' ? '…' : 'Send'}
            </button>
          </div>
          {error && <p className="mt-2 text-[13px] font-medium text-red-600">{error}</p>}
        </div>
      </div>
    </Card>
  )
}
