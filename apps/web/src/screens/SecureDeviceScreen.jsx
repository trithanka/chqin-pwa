import { useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { BiometricCard } from '../components/cards'
import { isCancellation, passkeyMode, unsupportedReason } from '../passkey'

/**
 * Passkey creation, and the last step of the first-time and new-device paths.
 *
 * The credential is made by the platform against options the server issued,
 * and the server verifies it — so reaching the next screen means a check-in
 * actually exists, not that an animation finished.
 */
export default function SecureDeviceScreen({ next, activeMode, runEnrolment }) {
  const [mode, setMode] = useState(null) // null while probing
  const [state, setState] = useState('idle') // 'idle' | 'working' | 'done'
  const [note, setNote] = useState(null)
  // The OS sheet can resolve twice on some platforms; a second enrolment would
  // mint a second credential for one device.
  const running = useRef(false)

  useEffect(() => {
    passkeyMode().then((m) => {
      setMode(m)
      if (m === 'simulated') setNote(unsupportedReason())
    })
  }, [])

  const enrol = async () => {
    if (state !== 'idle' || running.current) return
    running.current = true
    setState('working')
    setNote(null)

    try {
      await runEnrolment()
      setState('done')
      setTimeout(next, 500)
    } catch (err) {
      setState('idle')
      setNote(
        isCancellation(err)
          ? 'Unlock was dismissed. Tap to try again.'
          : (err.message ?? 'That didn’t work. Try again.'),
      )
    } finally {
      running.current = false
    }
  }

  const blocked = mode === 'simulated'

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title={activeMode === 'newDevice' ? 'Set up this device' : 'Secure your device'}
          subtitle="Create a passkey, unlocked by your phone's Face ID, Touch ID or fingerprint. It stays on this phone."
        />

        <div className="my-auto py-8">
          <BiometricCard
            state={state === 'done' ? 'done' : state === 'working' ? 'scanning' : 'idle'}
            onClick={enrol}
          />
        </div>

        <div className="h-10 text-center">
          {note && (
            <p className="mx-auto max-w-[290px] text-[12.5px] leading-relaxed font-medium text-slate-400">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={enrol}
          loading={state === 'working' || mode === null}
          disabled={blocked}
          icon={state === 'done' ? undefined : KeyRound}
          tone={state === 'done' ? 'success' : 'brand'}
        >
          {state === 'done' ? 'Passkey created' : 'Create passkey'}
        </PrimaryButton>

        {blocked && (
          <p className="mt-3 text-center text-[12px] leading-relaxed text-slate-400">
            Check-in needs a passkey, so the desk will have to finish this one
            by hand.
          </p>
        )}
      </div>
    </Screen>
  )
}
