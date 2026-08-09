import { useState } from 'react'
import { motion } from 'framer-motion'
import { BiometricPromptSheet, PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { BiometricCard } from '../components/cards'

export default function SecureDeviceScreen({ next }) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [secured, setSecured] = useState(false)

  const handleEnable = () => {
    setSheetOpen(true)
  }

  const handleCompleteBiometric = () => {
    setSheetOpen(false)
    setSecured(true)
    setTimeout(() => {
      next()
    }, 450)
  }

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title="Secure your device"
          subtitle="Use Face ID or fingerprint."
        />

        <div className="my-auto py-8">
          <BiometricCard
            state={secured ? 'done' : sheetOpen ? 'scanning' : 'idle'}
            onClick={handleEnable}
          />
        </div>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={handleEnable}
          tone={secured ? 'success' : 'brand'}
        >
          {secured ? 'Continue' : 'Enable secure access'}
        </PrimaryButton>
      </div>

      <BiometricPromptSheet
        open={sheetOpen}
        onComplete={handleCompleteBiometric}
        title="Secure Device Biometric"
      />
    </Screen>
  )
}
