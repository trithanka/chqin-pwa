import { motion } from 'framer-motion'
import { ArrowRight, Building2, Fingerprint, Lock, QrCode, UserCheck } from 'lucide-react'
import { IconButton, PrimaryButton, Screen } from '../components/ui'
import { GUEST, HOTEL } from '../data'

/**
 * The WELCOME beat. `activeMode` arrives already decided by detection — this
 * screen only phrases it. There is nothing here for the guest to choose.
 */

const COPY = {
  returning: {
    headline: 'Welcome back.',
    lines: ['Hotel Aurora', 'Your room is ready.'],
    cta: 'Check in',
    note: 'Recognised on this device',
  },
  firstTime: {
    headline: 'Welcome.',
    lines: ["Let's get you checked in.", 'A one-time setup, then never again.'],
    cta: 'Check in',
    note: 'First check-in with ChqIn',
  },
  newDevice: {
    headline: 'Welcome back.',
    lines: ['We found your ChqIn Identity.', "Let's set up this device."],
    cta: 'Continue',
    note: 'New device · quick re-verification',
  },
}

export default function HotelWelcomeScreen({ next, activeMode, onRescan }) {
  const mode = activeMode || 'firstTime'
  const copy = COPY[mode]

  return (
    <Screen className="justify-between pt-safe pb-7 px-6 bg-white sm:pt-6">
      <div>
        {/* Brand header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-slate-900 font-extrabold tracking-tight text-[18px]">
            <span className="grid size-7 place-items-center rounded-xl bg-blue-600 text-white text-[12px] font-black shadow-sm">
              C
            </span>
            ChqIn
          </div>

          {onRescan && (
            <IconButton icon={QrCode} label="Scan another QR" onClick={onRescan} subtle />
          )}
        </div>

        {/* Eyebrow header & thin divider */}
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-600">
            {HOTEL.name.toUpperCase()}
          </p>
          <div className="h-[1px] w-full bg-slate-100 my-1.5" />
          <p className="text-[12.5px] font-semibold text-slate-400">
            Your stay · Today
          </p>
        </div>

        <div className="pt-5 space-y-1.5 pb-2">
          <motion.h1
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[34px] font-extrabold leading-[1.12] tracking-[-0.04em] text-slate-900"
          >
            {copy.headline}
          </motion.h1>

          <motion.div
            key={`sub-${mode}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="text-[16.5px] font-medium leading-snug text-slate-500 space-y-0.5"
          >
            <p className="text-slate-800 font-semibold">{copy.lines[0]}</p>
            {copy.lines[1] && <p className="text-slate-500">{copy.lines[1]}</p>}
          </motion.div>
        </div>

        {/* Hotel card */}
        <div className="mt-3 overflow-hidden rounded-[24px] border border-slate-200/80 shadow-sm bg-white">
          <div className="relative h-36 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-4 flex flex-col justify-between overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_70%)]" />

            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-md">
                <Building2 size={11} strokeWidth={2} />
                {HOTEL.location}
              </span>
              {mode !== 'firstTime' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-md">
                  <UserCheck size={11} /> {GUEST.name}
                </span>
              )}
            </div>

            <div className="relative z-10">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-blue-200">Assigned Room</p>
              <h2 className="text-[19px] font-extrabold text-white tracking-tight">
                Deluxe Room · {HOTEL.roomNumber}
              </h2>
            </div>
          </div>
        </div>
      </div>

      {/* Primary action */}
      <div className="pt-5 space-y-4">
        <PrimaryButton
          onClick={next}
          icon={mode === 'returning' ? Fingerprint : ArrowRight}
          tone="brand"
        >
          {copy.cta}
        </PrimaryButton>

        <div className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-400">
          <Lock size={12} strokeWidth={2.2} className="text-slate-400" />
          <span>{copy.note}</span>
        </div>
      </div>
    </Screen>
  )
}
