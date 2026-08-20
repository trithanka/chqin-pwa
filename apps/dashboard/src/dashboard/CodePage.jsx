import { PageHeader } from '../components/ui'
import Async from '../components/Async'
import DeskCard from '../onboarding/DeskCard'
import { api } from '../api'
import { useApi } from '../useApi'
import { useSession } from '../session'

/**
 * The desk card, reachable after setup too — cards get coffee on them and need
 * reprinting, and that shouldn't mean walking back through onboarding.
 */
export default function CodePage() {
  const { user } = useSession()
  const { data, error, loading, reload } = useApi(() => api.get('/staff/checkin-code'))

  return (
    <div>
      {/* The desk card prints on its own — `.print-card` is fixed to the page,
          so anything still in flow prints underneath it. */}
      <div className="print-hide">
        <PageHeader
          title="Check-in code"
          subtitle="One code for the whole property. Each scan starts a separate, private check-in."
        />
      </div>
      <Async loading={loading} error={error} onRetry={reload}>
        <DeskCard
          propertyName={user?.venue?.name ?? 'Your property'}
          token={data?.token}
          onLight
        />
      </Async>
    </div>
  )
}
