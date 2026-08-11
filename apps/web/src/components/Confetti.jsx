import { useMemo } from 'react'
import { motion } from 'framer-motion'

const COLORS = ['#2563EB', '#16A34A', '#F59E0B', '#EC4899', '#8B5CF6', '#38BDF8']

/**
 * Lightweight CSS-transform confetti burst — no canvas, no dependency.
 */
export default function Confetti({ count = 46, colors = COLORS }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        drift: (Math.random() - 0.5) * 140,
        delay: Math.random() * 0.5,
        duration: 2.2 + Math.random() * 1.4,
        size: 6 + Math.random() * 7,
        rotate: Math.random() * 720 - 360,
        color: colors[i % colors.length],
        round: Math.random() > 0.6,
      })),
    [count, colors],
  )

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          initial={{ y: -40, x: 0, opacity: 0, rotate: 0 }}
          animate={{ y: '105vh', x: p.drift, opacity: [0, 1, 1, 0], rotate: p.rotate }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: 'easeIn',
            times: [0, 0.08, 0.75, 1],
          }}
          style={{
            left: `${p.x}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
          }}
          className="absolute top-0"
        />
      ))}
    </div>
  )
}
