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
export default function SecureDeviceScreen({ next, activeMode, runEnrolment, direction }) {
  const [mode, setMode] = useState(null) // null while probing
  const [state, setState] = useState('idle') // 'idle' | 'working' | 'done'
  const [note, setNote] = useState(null)
  // Separate from `note`: a dismissed unlock is a nudge, an expired session is
  // a dead end, and they must not look alike.
  const [expired, setExpired] = useState(false)
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
    const startedAt = Date.now()

    try {
      await runEnrolment()
      setState('done')
      setTimeout(next, 500)
    } catch (err) {
      setState('idle')
      // An expired session cannot be retried from here — tapping again calls
      // the same dead session. Say so as a failure rather than as the grey
      // hint the other notes use, because the only way forward is a rescan.
      setExpired(err.code === 'unknown_session')
      // ponytail: diagnostic tail. NotAllowedError is WebAuthn's catch-all —
      // a real dismissal, a lost user gesture and the 60s ceremony timeout all
      // arrive as the same name, and only the elapsed time tells them apart.
      // Drop the tail once the cause on real devices is known.
      setNote(
        isCancellation(err)
          ? `Face ID didn’t complete. Tap to try again. [${err.name} ${Date.now() - startedAt}ms]`
          : (err.message ?? 'That didn’t work. Try again.'),
      )
    } finally {
      running.current = false
    }
  }

  const blocked = mode === 'simulated'

  return (
    <Screen direction={direction} className="justify-between pt-7 pb-8 px-7">
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

        <div className="min-h-10 text-center">
          {note && (
            <p
              className={`mx-auto max-w-[290px] text-[12.5px] leading-relaxed font-medium ${
                expired ? 'text-red-600' : 'text-slate-400'
              }`}
            >
              {expired ? 'This check-in timed out. Scan the desk code again to start over.' : note}
            </p>
          )}
          {expired && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 rounded-full bg-slate-900 px-5 py-2 text-[13px] font-semibold text-white"
            >
              Start over
            </button>
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
