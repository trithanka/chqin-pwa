import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Confetti from '../components/Confetti'
import { HOTEL } from '../data'

// Kept off-green so the pieces stay legible against the background.
const CONFETTI_COLORS = ['#FFFFFF', '#FDE68A', '#F9A8D4', '#BFDBFE', '#FCD34D']

/**
 * Full-bleed green confirmation. The Done button holds back for two seconds so
 * the check mark lands first.
 */
export default function CheckedInScreen({ onDone }) {
  const [showDone, setShowDone] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowDone(true), 2000)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="relative flex min-h-full flex-col items-center justify-center pb-safe bg-success px-8 text-center [--pb-safe-min:2.5rem]"
    >
      <Confetti colors={CONFETTI_COLORS} />

      <div className="relative grid size-36 place-items-center">
        {/* Expanding rings behind the mark */}
        {[0, 0.5, 1].map((delay) => (
          <motion.span
            key={delay}
            initial={{ scale: 1, opacity: 0.4 }}
            animate={{ scale: 1.9, opacity: 0 }}
            transition={{
              duration: 2.4,
              delay,
              repeat: Infinity,
              ease: 'easeOut',
            }}
            className="absolute size-36 rounded-full border-2 border-white"
          />
        ))}

        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 15 }}
          className="relative grid size-36 place-items-center rounded-full bg-white/15 backdrop-blur-sm"
        >
          <motion.svg
            width="72"
            height="72"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M4 12.5 9.5 18 20 6.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.55, delay: 0.25, ease: 'easeOut' }}
            />
          </motion.svg>
        </motion.div>
      </div>

      <motion.h1
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="relative mt-9 text-[32px] font-bold leading-tight tracking-[-0.035em] text-white"
      >
        You&apos;re Checked In!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.62 }}
        className="relative mt-2.5 text-[16px] text-white/75"
      >
        Welcome to {HOTEL.name}
      </motion.p>

      {/* Reserved space so the button doesn't shift the layout when it lands */}
      <div className="relative z-40 mt-14 h-14 w-full max-w-[300px]">
        {showDone && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.965 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClick={onDone}
            className="h-14 w-full rounded-2xl bg-white text-[15px] font-bold tracking-[-0.01em] text-success shadow-[0_14px_36px_rgb(0_0_0/0.18)]"
          >
            Done
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
