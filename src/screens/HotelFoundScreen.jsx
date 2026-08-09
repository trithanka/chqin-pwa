import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Check, Clock } from 'lucide-react'
import { PrimaryButton, Screen } from '../components/ui'
import { HotelCard } from '../components/cards'
import { HOTEL } from '../data'

export default function HotelFoundScreen({ next }) {
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900)
    return () => clearTimeout(t)
  }, [])

  return (
    <Screen>
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-5 flex items-center gap-2"
      >
        <span className="grid size-6 place-items-center rounded-full bg-success">
          <Check size={13} strokeWidth={3.4} className="text-white" />
        </span>
        <p className="text-[15px] font-bold tracking-[-0.02em] text-success">
          Hotel Found
        </p>
      </motion.div>

      <HotelCard hotel={HOTEL} loading={loading} />

      <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white/70 px-4 py-3 text-[12.5px] text-slate-500">
        <Clock size={15} strokeWidth={2.2} className="shrink-0 text-slate-400" />
        Check-out {HOTEL.checkOut}
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton onClick={next} disabled={loading} icon={ArrowRight}>
          Continue
        </PrimaryButton>
      </div>
    </Screen>
  )
}
