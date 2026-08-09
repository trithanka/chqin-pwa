import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Lock, Scan } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { DocumentScanCard } from '../components/cards'
import { GUEST } from '../data'

/**
 * Single-pass document scan: hold the card in frame, read the number off it.
 * Nothing is captured, uploaded or parsed — idle → scanning → reading → done
 * is a timed sequence over hard-coded placeholder data.
 */
export default function IdentityScreen({ next, showToast }) {
  const [state, setState] = useState('idle')

  useEffect(() => {
    if (state !== 'scanning') return
    const t = setTimeout(() => setState('reading'), 2000)
    return () => clearTimeout(t)
  }, [state])

  useEffect(() => {
    if (state !== 'reading') return
    const t = setTimeout(() => {
      setState('done')
      showToast('Document number captured')
    }, 1200)
    return () => clearTimeout(t)
  }, [state, showToast])

  const done = state === 'done'
  const busy = state === 'scanning' || state === 'reading'

  return (
    <Screen>
      <ScreenTitle
        title="Identity Verification"
        subtitle="Hold your government-issued ID in the frame. We only read the document number."
      />

      <DocumentScanCard
        state={done ? 'done' : state === 'idle' ? 'idle' : 'scanning'}
        number={GUEST.documentNumber}
      />

      <div className="mt-4 h-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`text-[14px] font-bold tracking-[-0.02em] ${
              done ? 'text-success' : 'text-slate-500'
            }`}
          >
            {state === 'idle' && 'Position the document in the frame'}
            {state === 'scanning' && 'Scanning document…'}
            {state === 'reading' && 'Reading number…'}
            {done && '✓ Number captured'}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="mt-auto pt-8">
        <div className="mb-3.5 flex items-start gap-2 rounded-2xl bg-slate-100/70 px-4 py-3 text-[11.5px] leading-relaxed text-slate-500">
          <Lock size={14} strokeWidth={2.2} className="mt-px shrink-0 text-slate-400" />
          Demo only — no image is captured, uploaded, or checked against any
          registry.
        </div>

        {done ? (
          <PrimaryButton onClick={next} tone="success" icon={ArrowRight}>
            Continue
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => setState('scanning')}
            loading={busy}
            icon={Scan}
          >
            {busy ? 'Scanning…' : 'Scan Document'}
          </PrimaryButton>
        )}
      </div>
    </Screen>
  )
}
