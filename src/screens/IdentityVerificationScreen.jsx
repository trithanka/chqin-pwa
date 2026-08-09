import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Scan } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { DocumentScanCard } from '../components/cards'

export default function IdentityVerificationScreen({ next }) {
  const [state, setState] = useState('idle')

  const handleStartScan = () => {
    if (state === 'scanning' || state === 'done') return
    setState('scanning')
  }

  useEffect(() => {
    if (state !== 'scanning') return
    const t = setTimeout(() => setState('done'), 1800)
    return () => clearTimeout(t)
  }, [state])

  return (
    <Screen>
      <ScreenTitle
        title="Verify your identity"
        subtitle="This is a one-time setup."
      />

      <div className="mt-2">
        <DocumentScanCard state={state} />
      </div>

      <div className="mt-6 h-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={state}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`text-[14px] font-bold tracking-tight ${
              state === 'done' ? 'text-emerald-600' : 'text-zinc-500'
            }`}
          >
            {state === 'idle' && 'Position document or tap Continue'}
            {state === 'scanning' && 'Scanning document…'}
            {state === 'done' && '✓ Document Verified'}
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
            onClick={handleStartScan}
            loading={state === 'scanning'}
            icon={Scan}
            tone="dark"
          >
            {state === 'scanning' ? 'Scanning…' : 'Continue'}
          </PrimaryButton>
        )}
      </div>
    </Screen>
  )
}
