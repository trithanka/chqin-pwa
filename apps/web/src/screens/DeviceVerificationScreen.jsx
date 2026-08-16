import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Fingerprint } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { BiometricCard } from '../components/cards'
import { isCancellation, passkeyMode, unsupportedReason } from '../passkey'

/**
 * Returning guest. The phone's unlock releases the passkey, the passkey signs
 * the server's challenge, and the server checks it — this screen never sees
 * whether the proof was good, only what the server says about it.
 */
export default function DeviceVerificationScreen({
  next,
  runAuthentication,
  fallBackToNewDevice,
  direction,
}) {
  const [mode, setMode] = useState(null)
  const [state, setState] = useState('idle') // 'idle' | 'verifying' | 'verified'
  const [note, setNote] = useState(null)

  useEffect(() => {
    passkeyMode().then((m) => {
      setMode(m)
      if (m === 'simulated') setNote(unsupportedReason())
    })
  }, [])

  const verify = async () => {
    if (state !== 'idle') return
    setState('verifying')
    setNote(null)

    try {
      await runAuthentication()
      setState('verified')
      setTimeout(next, 600)
    } catch (err) {
      setState('idle')

      if (isCancellation(err)) {
        setNote('Unlock was dismissed. Tap to try again.')
        return
      }

      // The server didn't recognise this passkey — it may have been revoked,
      // or this device was restored from a backup. Re-enrolling is the way
      // out, not repeating a ceremony that will keep failing.
      if (['unknown_credential', 'unverified', 'counter'].includes(err.code)) {
        setNote('This device needs setting up again — one moment.')
        setTimeout(fallBackToNewDevice, 1200)
        return
      }

      setNote(err.message ?? 'That didn’t work. Try again.')
    }
  }

  const blocked = mode === 'simulated'

  return (
    <Screen direction={direction} className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title="Verify it's you"
          subtitle="Unlock with whatever your phone uses — Face ID, Touch ID or fingerprint."
        />

        <div className="my-auto py-8">
          <BiometricCard
            state={state === 'verified' ? 'done' : state === 'verifying' ? 'scanning' : 'idle'}
            onClick={verify}
          />
        </div>

        <div className="flex h-10 items-center justify-center">
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
                Checking your passkey…
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
                Verified
              </motion.div>
            )}

            {state === 'idle' && note && (
              <motion.p
                key="note"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto max-w-[290px] text-center text-[12.5px] leading-relaxed font-medium text-slate-400"
              >
                {note}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={verify}
          loading={state === 'verifying' || mode === null}
          disabled={blocked}
          icon={state === 'idle' ? Fingerprint : undefined}
          tone={state === 'verified' ? 'success' : 'brand'}
        >
          {state === 'verified' ? 'Verified' : 'Unlock to check in'}
        </PrimaryButton>
      </div>
    </Screen>
  )
}
