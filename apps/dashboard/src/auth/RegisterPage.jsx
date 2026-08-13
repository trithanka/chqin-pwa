import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import OnboardingWizard from '../onboarding/OnboardingWizard'
import { useSession } from '../session'

/**
 * Registering *is* onboarding — a business that signs up is setting up a
 * property, and splitting the two would mean two flows and a handoff for
 * something done once.
 */
export default function RegisterPage() {
  const { registerVenue } = useSession()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  /**
   * The whole wizard posts at the end, not step by step: a half-created
   * property with no rooms and no owner is worse than one the guest can retry.
   */
  const submit = async (data) => {
    setError(null)
    await registerVenue({
      account: {
        name: data.account.name,
        email: data.account.email,
        password: data.account.password,
        role: data.account.role,
      },
      property: data.property,
      rooms: data.rooms,
      team: data.team,
    })
    navigate('/app')
  }

  return (
    <OnboardingWizard
      onComplete={submit}
      submitError={error}
      onSubmitError={setError}
    />
  )
}
