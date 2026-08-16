import { motion } from 'framer-motion'
import { ArrowRight, Fingerprint, IdCard, MapPin, QrCode, ShieldCheck } from 'lucide-react'
import { IconButton, PrimaryButton, Screen } from '../components/ui'
import Logo from '../components/Logo'

/**
 * The WELCOME beat. `activeMode` arrives already decided by detection — this
 * screen only phrases it, and there is nothing here for the guest to choose.
 *
 * Two shapes, because a reservation may or may not exist: with one, the room
 * is the most useful thing on the screen; without one, the space goes to what
 * is about to happen, which is what a first-time guest actually wants to know
 * before handing over an ID.
 */

const COPY = {
  returning: {
    headline: (name) => (name ? `Welcome back, ${name.split(' ')[0]}.` : 'Welcome back.'),
    sub: 'Verify with your phone and you’re in.',
    cta: 'Check in',
    note: 'Recognised on this device',
  },
  firstTime: {
    headline: () => 'Welcome.',
    sub: 'A one-time setup, then never again.',
    cta: 'Check in',
    note: 'No app, no forms, no queue',
  },
  newDevice: {
    headline: (name) => (name ? `Welcome back, ${name.split(' ')[0]}.` : 'Welcome back.'),
    sub: 'New phone — a quick check and you’re set.',
    cta: 'Continue',
    note: 'Setting up this device',
  },
}

const STEPS = {
  firstTime: [
    { icon: IdCard, title: 'Show your ID', body: 'Once, and never at this desk again' },
    { icon: Fingerprint, title: 'Set up this phone', body: 'Face ID or fingerprint — it stays on the device' },
    { icon: ShieldCheck, title: 'You’re in', body: 'About thirty seconds from here' },
  ],
  newDevice: [
    { icon: IdCard, title: 'Confirm it’s you', body: 'We already have your ChqIn identity' },
    { icon: Fingerprint, title: 'Set up this phone', body: 'A passkey for the new device' },
    { icon: ShieldCheck, title: 'You’re in', body: 'Your old phone keeps working too' },
  ],
}

const nightsBetween = (from, to) => {
  const days = Math.round((new Date(to) - new Date(from)) / 86_400_000)
  return days > 0 ? `${days} night${days === 1 ? '' : 's'}` : null
}

const shortDate = (value) =>
  new Date(value).toLocaleDateString([], { day: 'numeric', month: 'short' })

export default function HotelWelcomeScreen({ next, activeMode, session, onRescan, direction }) {
  const mode = activeMode || 'firstTime'
  const copy = COPY[mode]
  const venue = session?.venue
  const booking = session?.booking
  const steps = STEPS[mode]

  return (
    <Screen direction={direction} className="justify-between pt-safe pb-8 px-6 bg-white sm:pt-6">
      <div className="flex flex-col gap-7">
        {/* Brand, and the way back to the scanner */}
        <div className="flex items-start justify-between">
          <Logo className="h-6 w-auto text-slate-900" />
          {onRescan && (
            <IconButton icon={QrCode} label="Scan another code" onClick={onRescan} subtle />
          )}
        </div>

        {/* Where you are — said once, at the top, and not repeated below */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-600">
            {venue?.name ?? 'Checking in'}
          </p>
          {venue?.location && (
            <p className="mt-1 flex items-center gap-1 text-[12.5px] font-medium text-slate-400">
              <MapPin size={11} strokeWidth={2.4} />
              {venue.location}
            </p>
          )}

          <h1 className="mt-5 text-[34px] font-extrabold leading-[1.1] tracking-[-0.04em] text-slate-900 text-balance">
            {copy.headline(session?.greetingName)}
          </h1>
          <p className="mt-2 text-[16px] font-medium leading-snug text-slate-500">{copy.sub}</p>
        </motion.div>

        {/* The reservation, when there is one */}
        {booking && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.25, 1, 0.5, 1] }}
            className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 px-5 py-5 text-white shadow-[0_18px_44px_rgba(37,99,235,0.28)]"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_65%)]" />

            <div className="relative z-10 flex items-end justify-between gap-4">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-blue-200">
                  {booking.roomNumber ? 'Your room' : 'Your booking'}
                </p>
                <p className="mt-0.5 text-[30px] font-black leading-none tracking-[-0.03em]">
                  {booking.roomNumber ?? booking.reference}
                </p>
              </div>
              {booking.arrivalDate && booking.departureDate && (
                <p className="pb-1 text-right text-[12.5px] font-semibold text-blue-100">
                  {shortDate(booking.arrivalDate)} → {shortDate(booking.departureDate)}
                  <span className="block text-[11.5px] font-medium text-blue-200/80">
                    {nightsBetween(booking.arrivalDate, booking.departureDate)}
                  </span>
                </p>
              )}
            </div>

            {booking.guestName && (
              <p className="relative z-10 mt-4 border-t border-white/15 pt-3 text-[12.5px] font-medium text-blue-100">
                Booked for <span className="font-bold text-white">{booking.guestName}</span>
                {booking.roomNumber && booking.reference && (
                  <span className="text-blue-200/70"> · {booking.reference}</span>
                )}
              </p>
            )}
          </motion.div>
        )}

        {/* What's about to happen. A first-timer wants this before handing
            over an ID, reservation or not. */}
        {steps ? (
          <ol className="flex flex-col gap-3.5">
            {steps.map(({ icon: Icon, title, body }, i) => (
              <motion.li
                key={title}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.07, duration: 0.35 }}
                className="flex items-start gap-3.5"
              >
                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon size={17} strokeWidth={2.1} />
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[14.5px] font-bold tracking-[-0.01em] text-slate-900">
                    {title}
                  </p>
                  <p className="text-[13px] leading-snug text-slate-500">{body}</p>
                </div>
              </motion.li>
            ))}
          </ol>
        ) : (
          // Returning guests need reassurance, not instructions.
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="flex items-start gap-3.5 rounded-2xl bg-slate-50 px-4 py-3.5"
          >
            <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-xs">
              <Fingerprint size={17} strokeWidth={2.1} />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-[14.5px] font-bold tracking-[-0.01em] text-slate-900">
                Your passkey is on this phone
              </p>
              <p className="text-[13px] leading-snug text-slate-500">
                One tap, one unlock, and you’re done
              </p>
            </div>
          </motion.div>
        )}
      </div>

      {/* Action */}
      <div className="pt-8">
        <PrimaryButton
          onClick={next}
          icon={mode === 'returning' ? Fingerprint : ArrowRight}
          tone="brand"
        >
          {copy.cta}
        </PrimaryButton>

        <p className="mt-3.5 text-center text-[12px] font-medium text-slate-400">{copy.note}</p>
      </div>
    </Screen>
  )
}
