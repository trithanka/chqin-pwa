import { PrimaryButton, Screen } from '../components/ui'
import { SuccessCard } from '../components/cards'
import Confetti from '../components/Confetti'

export default function SuccessScreen({ onDone, checkin, session }) {
  return (
    <Screen className="justify-between pt-safe pb-8 px-7 sm:pt-7">
      <Confetti count={34} />
      <SuccessCard
        venueName={checkin?.venueName ?? session?.venue?.name}
        roomNumber={checkin?.roomNumber ?? session?.booking?.roomNumber}
      />

      <div className="pt-6">
        <PrimaryButton onClick={onDone} tone="brand">
          Done
        </PrimaryButton>
      </div>
    </Screen>
  )
}
