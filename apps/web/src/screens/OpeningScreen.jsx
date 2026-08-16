import { motion } from 'framer-motion'
import Logo from '../components/Logo'

/**
 * The moment between a scanned code and the venue's welcome.
 *
 * A phone camera opens the link, so the app is starting from cold while the
 * session resolves. Showing the scanner during that beat would be absurd — the
 * guest has already scanned — and showing nothing reads as a broken page, so
 * this holds the brand for the second it takes.
 */
export default function OpeningScreen() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-full flex-col items-center justify-center gap-8 bg-gradient-to-b from-[#090d1a] via-[#0f172a] to-[#1e293b] px-8 text-white"
    >
      <Logo className="h-8 w-auto text-white" />

      <div className="flex flex-col items-center gap-3">
        <span className="relative flex size-8 items-center justify-center">
          <motion.span
            animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
            className="absolute size-8 rounded-full bg-blue-500/40"
          />
          <span className="size-2.5 rounded-full bg-blue-400" />
        </span>
        <p className="text-[13.5px] font-medium text-zinc-400">Opening your check-in…</p>
      </div>
    </motion.div>
  )
}
