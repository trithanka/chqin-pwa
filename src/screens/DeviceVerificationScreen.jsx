import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ShieldCheck } from 'lucide-react'
import { BiometricPromptSheet, PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { BiometricCard } from '../components/cards'

export default function DeviceVerificationScreen({ next }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [state, setState] = useState('idle') // 'idle' | 'verifying' | 'verified'

  const handleVerify = () => {
    setSheetOpen(true)
    setState('verifying')
  }

  const handleCompleteBiometric = () => {
    setSheetOpen(false)
    setState('verified')
    setTimeout(() => {
      next()
    }, 500)
  }

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title="Verify it's you"
          subtitle="Use your phone's Face ID or fingerprint."
        />

        <div className="my-auto py-8">
          <BiometricCard
            state={state === 'verified' ? 'done' : state === 'verifying' ? 'scanning' : 'idle'}
            onClick={handleVerify}
          />
        </div>

        {/* Simple Animated Verification State */}
        <div className="h-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {state === 'verifying' && (
              <motion.div
                key="verifying"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 bg-blue-50 text-blue-600 text-[14px] font-bold border border-blue-100"
              >
                <motion.span
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1, repeat: Infinity }}
                  className="size-2 rounded-full bg-blue-600"
                />
                Verifying...
              </motion.div>
            )}

            {state === 'verified' && (
              <motion.div
                key="verified"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 bg-emerald-50 text-emerald-600 text-[14px] font-bold border border-emerald-200"
              >
                <Check size={16} strokeWidth={3} />
                ✓ Verified
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={handleVerify}
          loading={state === 'verifying'}
          tone={state === 'verified' ? 'success' : 'brand'}
        >
          {state === 'verified' ? 'Continue' : 'Continue'}
        </PrimaryButton>
      </div>

      <BiometricPromptSheet
        open={sheetOpen}
        onComplete={handleCompleteBiometric}
        title="Verify Device Biometric"
      />
    </Screen>
  )
}
