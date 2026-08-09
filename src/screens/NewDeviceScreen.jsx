import { motion } from 'framer-motion'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'

export default function NewDeviceScreen({ next }) {
  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div className="space-y-6">
        <ScreenTitle
          title="Welcome back."
          subtitle="Let's secure this device."
        />
      </div>

      <div className="pt-8">
        <PrimaryButton onClick={next} tone="brand">
          Continue
        </PrimaryButton>
      </div>
    </Screen>
  )
}
