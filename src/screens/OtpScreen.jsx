import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { RotateCw, ShieldCheck, Smartphone } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import OtpInput from '../components/OtpInput'
import { GUEST } from '../data'

/** Any 6 digits verify successfully — there is no OTP and nothing is sent. */
export default function OtpScreen({ next, showToast, variant = 'returning' }) {
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [seconds, setSeconds] = useState(28)

  useEffect(() => {
    if (seconds === 0) return
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [seconds])

  useEffect(() => {
    if (!verifying) return
    const t = setTimeout(next, 1400)
    return () => clearTimeout(t)
  }, [verifying, next])

  const subtitle =
    variant === 'returning'
      ? "We've sent a 6-digit code to your registered mobile."
      : "We'll send a one-time code to your registered mobile number."

  return (
    <Screen>
      <ScreenTitle title="Verify Mobile Number" subtitle={subtitle} />

      <div className="mb-7 flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[var(--shadow-soft)]">
        <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand">
          <Smartphone size={19} strokeWidth={2.2} />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Sent to
          </p>
          <p className="text-[16px] font-bold tracking-[-0.01em] text-slate-900">
            {GUEST.phone}
          </p>
        </div>
      </div>

      <OtpInput value={code} onChange={setCode} disabled={verifying} />

      <div className="mt-5 text-center">
        {seconds > 0 ? (
          <p className="text-[13px] text-slate-400">
            Resend code in <span className="font-bold text-slate-600">0:{String(seconds).padStart(2, '0')}</span>
          </p>
        ) : (
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setSeconds(28)
              showToast('Code resent to ' + GUEST.phone)
            }}
            className="inline-flex items-center gap-1.5 text-[13px] font-bold text-brand"
          >
            <RotateCw size={14} strokeWidth={2.6} />
            Resend code
          </motion.button>
        )}
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton
          onClick={() => setVerifying(true)}
          disabled={!/^\d{6}$/.test(code)}
          loading={verifying}
          icon={ShieldCheck}
        >
          {verifying ? 'Verifying…' : 'Verify'}
        </PrimaryButton>
        <p className="mt-3.5 text-center text-[11.5px] text-slate-400">
          Demo only — enter any 6 digits.
        </p>
      </div>
    </Screen>
  )
}
