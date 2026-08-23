import { useEffect } from 'react'
import { PrimaryButton, Screen } from '../components/ui'
import { succeeded } from '../lib/haptics'
import { SuccessCard } from '../components/cards'
import Confetti from '../components/Confetti'

export default function SuccessScreen({ next, checkin, session, direction }) {
  // The arrival is confirmed in the hand as well as on the screen.
  useEffect(succeeded, [])

  return (
    <Screen direction={direction} className="justify-between pt-safe pb-8 px-7 sm:pt-7">
      <Confetti count={34} />
      <SuccessCard
        venueName={checkin?.venueName ?? session?.venue?.name}
        roomNumber={checkin?.roomNumber ?? session?.booking?.roomNumber}
      />

      <div className="pt-6">
        {/* Onward to what the hotel offers, rather than straight out of the
            app — the guest is checked in, and this is the first moment they
            can be told anything useful about the place. */}
        <PrimaryButton onClick={next} tone="brand">
          Continue
        </PrimaryButton>
      </div>
    </Screen>
  )
}
