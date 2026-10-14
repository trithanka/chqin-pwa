import { Navigate, useNavigate, useParams } from 'react-router-dom'
import OnboardingWizard from '../onboarding/OnboardingWizard'
import KindChooser from '../onboarding/KindChooser'
import { api } from '../api'
import { useSession } from '../session'

/**
 * Registering *is* onboarding — a business that signs up is setting up a
 * property, and splitting the two would mean two flows and a handoff for
 * something done once.
 */
export default function RegisterPage() {
  const { registerVenue } = useSession()
  // The kind is in the address — /register/hotel, /register/office — so each
  // has its own link, survives a refresh, and Back is the browser's. /register
  // alone asks. Choosing the same kind again picks a saved draft back up.
  const { kind } = useParams()
  const navigate = useNavigate()

  /**
   * The whole wizard posts at the end, not step by step: a half-created
   * property with no rooms and no owner is worse than one the person can
   * retry.
   *
   * Nothing navigates on success — the wizard's last screen is the printable
   * desk card, and bouncing straight to the dashboard would take the QR away
   * from the person who came here to get it. "Go to dashboard" is a button on
   * that screen.
   */
  const submit = async (data) => {
    await registerVenue({
      account: {
        name: data.account.name,
        email: data.account.email,
        password: data.account.password,
        role: data.account.role,
      },
      property: data.property,
      rooms: data.rooms,
      ...(data.reception?.length === 10 ? { reception: `+91 ${data.reception}` } : {}),
      hosts: (data.hosts ?? []).map((h) => ({
        name: h.name,
        ...(h.phone ? { phone: `+91 ${h.phone}` } : {}),
      })),
      business: data.business,
      services: data.services,
      essentials: data.essentials,
      // Only what the property actually switched on: a number left over from a
      // service they later turned off is a request routed nowhere.
      contacts: Object.fromEntries(
        data.services
          .map((service) => {
            const raw = (data.contacts[service] ?? '').trim()
            const digits = raw.replace(/\D/g, '')
            const phone = digits.length === 10 ? `+91 ${digits}` : raw
            return [service, phone]
          })
          .filter(([, number]) => number),
      ),
    })

    // The desk code is minted on first read, so this is also what creates it.
    // A failure here doesn't undo the registration — the card is on the
    // dashboard too — so the live screen just renders without a code.
    return api.get('/staff/checkin-code').catch(() => null)
  }

  if (!kind) return <KindChooser onChoose={(k) => navigate(`/register/${k}`)} />
  if (kind !== 'hotel' && kind !== 'office') return <Navigate to="/register" replace />
  return <OnboardingWizard kind={kind} onComplete={submit} onChangeKind={() => navigate('/register')} />
}
