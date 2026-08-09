import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ScanFace } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { CameraCard } from '../components/cards'

/** idle → scanning (2s) → done. No real camera is opened. */
export default function SelfieScreen({ next }) {
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (state !== 'scanning') return
    const t = setTimeout(() => setState('done'), 2000)
    return () => clearTimeout(t)
  }, [state])

  return (
    <Screen>
      <ScreenTitle
        title="Selfie Verification"
        subtitle="Centre your face in the circle and hold still for a moment."
      />

      <div className="mt-2">
        <CameraCard state={state} />
      </div>

      <div className="mt-7 h-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`text-[15px] font-bold tracking-[-0.02em] ${
              state === 'done' ? 'text-success' : 'text-slate-500'
            }`}
          >
            {state === 'idle' && 'Ready when you are'}
            {state === 'scanning' && 'Scanning Face…'}
            {state === 'done' && '✓ Face Matched'}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="mt-auto pt-8">
        {state === 'done' ? (
          <PrimaryButton onClick={next} tone="success" icon={ArrowRight}>
            Continue
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => setState('scanning')}
            loading={state === 'scanning'}
            icon={ScanFace}
          >
            {state === 'scanning' ? 'Scanning Face…' : 'Start Face Scan'}
          </PrimaryButton>
        )}
        <p className="mt-3.5 text-center text-[11.5px] leading-relaxed text-slate-400">
          Your selfie is only used to match you to your booking.
        </p>
      </div>
    </Screen>
  )
}
