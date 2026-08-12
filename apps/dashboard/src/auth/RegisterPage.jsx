import { useNavigate } from 'react-router-dom'
import OnboardingWizard from '../onboarding/OnboardingWizard'
import { useSession } from '../session'

/**
 * Registering *is* onboarding — a business that signs up is setting up a
 * property, and splitting the two would mean two flows and a handoff for
 * something done once.
 */
export default function RegisterPage() {
  const { signIn } = useSession()
  const navigate = useNavigate()

  return (
    <OnboardingWizard
      onComplete={(data) => {
        signIn({
          name: data.account.name || 'Owner',
          email: data.account.email,
          role: data.account.role,
          venue: data.property.name,
        })
        navigate('/app')
      }}
    />
  )
}
