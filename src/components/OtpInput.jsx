import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const LENGTH = 6

/**
 * Six-box OTP field. Any 6 digits are accepted — verification is simulated.
 */
export default function OtpInput({ value, onChange, disabled, error }) {
  const inputs = useRef([])
  const [focused, setFocused] = useState(0)

  useEffect(() => {
    inputs.current[0]?.focus()
  }, [])

  const setDigit = (index, digit) => {
    // Spaces hold empty slots so clearing a digit never shifts the rest along.
    const next = value.padEnd(LENGTH, ' ').split('')
    next[index] = digit || ' '
    onChange(next.join('').slice(0, LENGTH))
  }

  const handleChange = (index, raw) => {
    // Typing into a filled box gives two characters — keep the new one.
    const digits = raw.replace(/\D/g, '')
    if (!digits) return

    const digit = digits === value[index] ? digits : digits.replace(value[index] ?? '', '')
    setDigit(index, digit.slice(-1))
    if (index < LENGTH - 1) inputs.current[index + 1]?.focus()
  }

  const handlePaste = (index, event) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '')
    if (!digits) return
    event.preventDefault()
    onChange((value.slice(0, index) + digits).slice(0, LENGTH))
    inputs.current[Math.min(index + digits.length, LENGTH - 1)]?.focus()
  }

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace') {
      event.preventDefault()
      if (/\d/.test(value[index] ?? '')) {
        setDigit(index, '')
      } else if (index > 0) {
        setDigit(index - 1, '')
        inputs.current[index - 1]?.focus()
      }
    }
    if (event.key === 'ArrowLeft' && index > 0) inputs.current[index - 1]?.focus()
    if (event.key === 'ArrowRight' && index < LENGTH - 1)
      inputs.current[index + 1]?.focus()
  }

  return (
    <motion.div
      animate={error ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      className="flex justify-between gap-2"
    >
      {Array.from({ length: LENGTH }).map((_, i) => {
        const digit = /\d/.test(value[i] ?? '') ? value[i] : ''
        const filled = digit !== ''
        const active = focused === i
        return (
          <input
            key={i}
            ref={(el) => (inputs.current[i] = el)}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={(e) => handlePaste(i, e)}
            onFocus={() => setFocused(i)}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label={`Digit ${i + 1}`}
            className={`h-14 w-full min-w-0 rounded-2xl border-2 bg-white text-center text-[22px] font-bold tracking-tight text-slate-900 outline-none transition-all duration-200 disabled:opacity-60 ${
              error
                ? 'border-red-400 bg-red-50/60'
                : active
                  ? 'border-brand shadow-[0_0_0_4px_rgb(37_99_235/0.12)]'
                  : filled
                    ? 'border-slate-300'
                    : 'border-slate-200'
            }`}
          />
        )
      })}
    </motion.div>
  )
}
