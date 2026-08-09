import { motion } from 'framer-motion'
import { ArrowRight, Building2, Lock, UserCheck } from 'lucide-react'
import { PrimaryButton, Screen } from '../components/ui'
import { GUEST, HOTEL } from '../data'

export default function HotelWelcomeScreen({ onStartFlow, activeMode, setMode }) {
  // Modes: 'returning' | 'firstTime' | 'newDevice'
  const mode = activeMode || 'returning'

  const handleAction = () => {
    onStartFlow(mode)
  }

  const toggleDemoMode = () => {
    if (setMode) {
      setMode(mode === 'returning' ? 'firstTime' : 'returning')
    }
  }

  return (
    <Screen className="justify-between pt-6 pb-7 px-6 bg-white">
      <div>
        {/* Brand Header & Discrete Simulation Toggle */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2 text-slate-900 font-extrabold tracking-tight text-[18px]">
            <span className="grid size-7 place-items-center rounded-xl bg-blue-600 text-white text-[12px] font-black shadow-sm">
              C
            </span>
            ChqIn
          </div>

          {setMode && (
            <button
              type="button"
              onClick={toggleDemoMode}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10.5px] font-semibold text-slate-500 hover:text-slate-900 transition-all border border-slate-200/80"
            >
              <span className="size-1.5 rounded-full bg-blue-600 animate-pulse" />
              Simulate: {mode === 'firstTime' ? 'New Guest' : 'Returning'}
            </button>
          )}
        </div>

        {/* Eyebrow Header & Thin Divider */}
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-600">
            HOTEL AURORA
          </p>
          <div className="h-[1px] w-full bg-slate-100 my-1.5" />
          <p className="text-[12.5px] font-semibold text-slate-400">
            Your stay · Today
          </p>
        </div>

        {/* Welcome Section (Moved ABOVE the Hotel Image Card) */}
        <div className="pt-5 space-y-1.5 pb-2">
          <motion.h1
            key={mode}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[34px] font-extrabold leading-[1.12] tracking-[-0.04em] text-slate-900"
          >
            {mode === 'firstTime' ? 'Welcome.' : 'Welcome back.'}
          </motion.h1>

          <motion.div
            key={`sub-${mode}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 }}
            className="text-[16.5px] font-medium leading-snug text-slate-500 space-y-0.5"
          >
            {mode === 'firstTime' ? (
              <p className="text-slate-800 font-semibold">Let&apos;s get you checked in.</p>
            ) : (
              <>
                <p className="text-slate-800 font-semibold">Hotel Aurora</p>
                <p className="text-slate-500">Your room is ready.</p>
              </>
            )}
          </motion.div>
        </div>

        {/* Hotel Image Card */}
        <div className="mt-3 overflow-hidden rounded-[24px] border border-slate-200/80 shadow-sm bg-white">
          <div className="relative h-36 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 p-4 flex flex-col justify-between overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_70%)]" />
            
            <div className="relative z-10 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-md">
                <Building2 size={11} strokeWidth={2} />
                Bandra West, Mumbai
              </span>
              {mode === 'returning' && (
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

      {/* Primary Action Button & Footer */}
      <div className="pt-5 space-y-4">
        <PrimaryButton onClick={handleAction} icon={ArrowRight} tone="brand">
          Check in
        </PrimaryButton>

        <div className="flex items-center justify-center gap-1.5 text-[12px] font-medium text-slate-400">
          <Lock size={12} strokeWidth={2.2} className="text-slate-400" />
          <span>Secure · No app required</span>
        </div>
      </div>
    </Screen>
  )
}
