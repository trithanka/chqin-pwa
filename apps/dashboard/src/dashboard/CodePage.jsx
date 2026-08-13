import { PageHeader } from '../components/ui'
import QrStep from '../onboarding/steps/QrStep'
import { useSession } from '../session'

/**
 * The desk card, reachable after setup too — cards get coffee on them and need
 * reprinting, and that shouldn't mean walking back through onboarding.
 */
export default function CodePage() {
  const { user } = useSession()

  return (
    <div>
      <PageHeader
        title="Check-in code"
        subtitle="One code for the whole property. Each scan starts a separate, private check-in."
      />
      <QrStep data={{ property: { name: user?.venue?.name ?? 'Your property' } }} />
    </div>
  )
}
