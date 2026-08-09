import { PrimaryButton, Screen } from '../components/ui'
import { SuccessCard } from '../components/cards'

export default function SuccessScreen({ onDone }) {
  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <SuccessCard />

      <div className="pt-6">
        <PrimaryButton onClick={onDone} tone="brand">
          View stay
        </PrimaryButton>
      </div>
    </Screen>
  )
}
