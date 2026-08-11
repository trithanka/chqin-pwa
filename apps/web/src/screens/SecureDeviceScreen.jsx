import { useEffect, useRef, useState } from 'react'
import { KeyRound } from 'lucide-react'
import { BiometricPromptSheet, PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { BiometricCard } from '../components/cards'
import { createPasskey as createWebAuthnPasskey, isCancellation, passkeyMode, unsupportedReason } from '../passkey'

/**
 * Passkey creation. Where WebAuthn can run, this is the real ceremony — the
 * OS creates the credential and the device biometric authorises it, and ChqIn keeps only
 * the credential ID and public key. Where it can't (insecure context, no
 * platform authenticator) the simulated sheet stands in so the flow still
 * demos.
 */
export default function SecureDeviceScreen({ next, activeMode, createPasskey, ensureIdentity, guestName }) {
  const [mode, setMode] = useState(null) // null while probing | 'webauthn' | 'simulated'
  const [sheetOpen, setSheetOpen] = useState(false)
  const [secured, setSecured] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  // The simulated sheet completes from an animation callback — guard against a
  // second fire minting a second credential for one device.
  const registered = useRef(false)

  useEffect(() => {
    passkeyMode().then((m) => {
      setMode(m)
      if (m === 'simulated') setNote(unsupportedReason())
    })
  }, [])

  const finish = (passkey) => {
    if (registered.current) return
    registered.current = true
    createPasskey(passkey)
    setSecured(true)
    setTimeout(next, 500)
  }

  const handleEnable = async () => {
    if (secured || busy) return

    if (mode === 'simulated') {
      setSheetOpen(true)
      return
    }

    setBusy(true)
    setNote(null)
    try {
      const identity = ensureIdentity()
      const passkey = await createWebAuthnPasskey({
        identityId: identity.id,
        guestName,
      })
      finish(passkey)
    } catch (err) {
      if (isCancellation(err)) {
        setNote('Unlock was dismissed. Tap to try again.')
      } else {
        // A broken ceremony shouldn't strand a guest mid-check-in.
        setNote('Passkey creation failed on this device — using a simulated passkey.')
        setMode('simulated')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title={activeMode === 'newDevice' ? 'Set up this device' : 'Secure your device'}
          subtitle="Create a passkey, unlocked by your phone's Face ID, Touch ID or fingerprint. It stays on this phone."
        />

        <div className="my-auto py-8">
          <BiometricCard
            state={secured ? 'done' : busy || sheetOpen ? 'scanning' : 'idle'}
            onClick={handleEnable}
          />
        </div>

        <div className="h-8 text-center">
          {note && (
            <p className="mx-auto max-w-[290px] text-[12.5px] leading-snug font-medium text-slate-400">
              {note}
            </p>
          )}
        </div>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={handleEnable}
          loading={busy || mode === null}
          icon={secured ? undefined : KeyRound}
          tone={secured ? 'success' : 'brand'}
        >
          {secured ? 'Passkey created' : 'Create passkey'}
        </PrimaryButton>
      </div>

      <BiometricPromptSheet
        open={sheetOpen}
        onComplete={() => {
          setSheetOpen(false)
          finish({ real: false })
        }}
        title="Create Passkey"
      />
    </Screen>
  )
}
