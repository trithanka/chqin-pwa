import { motion } from 'framer-motion'
import { ChevronRight, QrCode, ScanFace, Smartphone, Zap } from 'lucide-react'
import { PrimaryButton, Screen } from '../components/ui'
import { SuccessCard } from '../components/cards'
import Confetti from '../components/Confetti'

const NEXT_TIME = [
  { icon: QrCode, label: 'QR' },
  { icon: ScanFace, label: 'Selfie' },
  { icon: Smartphone, label: 'OTP' },
]

export default function RegistrationCompleteScreen({ onGoToCheckIn }) {
  return (
    <Screen className="justify-center">
      <Confetti count={38} />

      <div className="py-6">
        <SuccessCard
          title="Profile Created Successfully"
          subtitle="Next time you only need:"
        >
          <div className="flex items-center justify-center gap-1">
            {NEXT_TIME.map((step, i) => (
              <motion.div
                key={step.label}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.4 + i * 0.12, type: 'spring', stiffness: 300 }}
                className="flex items-center gap-1"
              >
                <div className="flex w-[74px] flex-col items-center gap-2 rounded-2xl border border-white/70 bg-white p-3 shadow-[var(--shadow-soft)]">
                  <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
                    <step.icon size={19} strokeWidth={2.2} />
                  </span>
                  <span className="text-[11.5px] font-bold text-slate-700">
                    {step.label}
                  </span>
                </div>
                {i < NEXT_TIME.length - 1 && (
                  <ChevronRight size={16} className="shrink-0 text-slate-300" />
                )}
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.85 }}
            className="mx-auto mt-6 inline-flex items-center gap-1.5 rounded-full bg-success-soft px-4 py-2 text-[12.5px] font-bold text-success"
          >
            <Zap size={14} strokeWidth={2.6} />
            Done in under 15 seconds
          </motion.div>
        </SuccessCard>
      </div>

      <div className="mt-8">
        <PrimaryButton onClick={onGoToCheckIn} tone="success">
          Go to Check-In
        </PrimaryButton>
      </div>
    </Screen>
  )
}
