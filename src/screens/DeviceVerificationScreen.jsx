import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Fingerprint } from 'lucide-react'
import { BiometricPromptSheet, PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { BiometricCard } from '../components/cards'
import { assertPasskey, isCancellation, passkeyMode, unsupportedReason } from '../passkey'

/**
 * Returning guest. The phone's biometric releases the passkey; the passkey
 * signs a fresh challenge; ChqIn checks the proof against the stored public
 * key. No password, no OTP, and no face recognition of our own — the biometric
 * never leaves the OS.
 */
export default function DeviceVerificationScreen({ next, verifyPasskey, credentialReal }) {
  const [mode, setMode] = useState(null) // null while probing | 'webauthn' | 'simulated'
  const [sheetOpen, setSheetOpen] = useState(false)
  const [state, setState] = useState('idle') // 'idle' | 'verifying' | 'verified'
  const [note, setNote] = useState(null)

  // The ceremony has to match the credential that's actually enrolled. A
  // simulated credential can't answer a real `get()` — that throws
  // NotAllowedError and would loop forever on "try again".
  const useReal = mode === 'webauthn' && credentialReal

  useEffect(() => {
    passkeyMode().then((m) => {
      setMode(m)
      if (m === 'simulated') {
        setNote(
          credentialReal
            ? // Honest about it: the local record is standing in for a proof
              // this context can't produce.
              `${unsupportedReason()} Falling back to the simulated check.`
            : unsupportedReason(),
        )
      } else if (!credentialReal) {
        // Capable device, but the enrolled passkey was simulated — say so,
        // otherwise the fake sheet looks like broken device unlock.
        setNote(
          'This passkey was enrolled in simulated mode, so your device can’t unlock it. Reset everything on the scan screen to enrol a real one.',
        )
      }
    })
  }, [credentialReal])

  const settle = async (assertion) => {
    // The OS released the passkey — now ChqIn verifies the signed challenge.
    const ok = await verifyPasskey(assertion)
    if (!ok) {
      setState('idle')
      return
    }
    setState('verified')
    setTimeout(next, 600)
  }

  const handleVerify = async () => {
    if (state !== 'idle') return

    if (!useReal) {
      setSheetOpen(true)
      setState('verifying')
      return
    }

    setState('verifying')
    setNote(null)
    try {
      const assertion = await assertPasskey()
      await settle(assertion)
    } catch (err) {
      setState('idle')
      if (isCancellation(err)) {
        setNote('Unlock was dismissed. Tap to try again.')
      } else {
        setNote('This device couldn’t use its passkey — using the simulated check.')
        setMode('simulated')
      }
    }
  }

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title="Verify it's you"
          subtitle="Unlock with whatever your phone uses — Face ID, Touch ID or fingerprint."
        />

        <div className="my-auto py-8">
          <BiometricCard
            state={state === 'verified' ? 'done' : state === 'verifying' ? 'scanning' : 'idle'}
            onClick={handleVerify}
          />
        </div>

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
                className="mx-auto max-w-[290px] text-center text-[12.5px] leading-snug font-medium text-slate-400"
              >
                {note}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={handleVerify}
          loading={state === 'verifying' || mode === null}
          icon={state === 'idle' ? Fingerprint : undefined}
          tone={state === 'verified' ? 'success' : 'brand'}
        >
          {state === 'verified' ? 'Verified' : 'Unlock to check in'}
        </PrimaryButton>
      </div>

      <BiometricPromptSheet
        open={sheetOpen}
        onComplete={() => {
          setSheetOpen(false)
          settle(null)
        }}
        title="Unlock to continue"
      />
    </Screen>
  )
}
