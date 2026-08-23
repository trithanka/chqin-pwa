import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Copy, Clock, Coffee, LogOut, Wifi } from 'lucide-react'
import { Card, Screen, SecondaryButton } from '../components/ui'
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
 * A tile opens WhatsApp to the number that service routes to, with the room
 * already in the message. That is the whole request mechanism today — there is
 * no in-app ordering, and pretending otherwise would be a button that does
 * nothing.
 */
export default function StayScreen({ checkin, session, onDone, direction }) {
  const venueName = checkin?.venueName ?? session?.venue?.name
  const roomNumber = checkin?.roomNumber ?? session?.booking?.roomNumber

  const services = checkin?.stay?.services ?? []
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
              />
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
            Opens WhatsApp with your room already in the message.
          </p>
        </section>
      )}

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
    </Screen>
  )
}

function ServiceTile({ service, contact, roomNumber, venueName }) {
  const { label, icon: Icon } = SERVICE[service] ?? {}
  const href = whatsappLink({ contact, service, roomNumber, venueName })

  // A number that can't be dialled gets no tile — the server already drops
  // services with no contact, so this is the malformed-number case.
  if (!label || !href) return null

  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={tapped}
      whileTap={{ scale: 0.97 }}
      className="flex flex-col items-center gap-2 rounded-[20px] border border-slate-200/80 bg-white px-2 py-4 text-center shadow-[var(--shadow-soft)]"
    >
      <Icon size={22} strokeWidth={1.9} className="text-blue-600" />
      <span className="text-[12.5px] font-semibold leading-tight text-slate-700">{label}</span>
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
