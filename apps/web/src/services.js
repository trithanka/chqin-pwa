import {
  BellRing,
  BriefcaseBusiness,
  Car,
  CupSoda,
  Flower2,
  Sparkles,
  UtensilsCrossed,
  Wrench,
  WashingMachine,
} from 'lucide-react'

/**
 * How each service is said to a guest.
 *
 * The keys come from the server; the wording lives here, said the way a guest
 * would say it rather than the way the property's settings screen does — "Cab
 * or airport transfer", not "Travel desk". Copy changing shouldn't need an API
 * deploy.
 */
export const SERVICE = {
  food: { label: 'Food', icon: UtensilsCrossed },
  water: { label: 'Water', icon: CupSoda },
  housekeeping: { label: 'Housekeeping', icon: Sparkles },
  laundry: { label: 'Laundry', icon: WashingMachine },
  maintenance: { label: 'Maintenance', icon: Wrench },
  cab: { label: 'Cab', icon: Car },
  spa: { label: 'Spa', icon: Flower2 },
  luggage: { label: 'Luggage', icon: BriefcaseBusiness },
  wakeup: { label: 'Wake-up call', icon: BellRing },
}

/**
 * A WhatsApp link for one request.
 *
 * wa.me wants digits only — no +, spaces or dashes — and a number without a
 * country code opens a chat with the wrong person rather than failing, so one
 * that doesn't have a plausible one is refused instead.
 */
export function whatsappLink({ contact, service, roomNumber, venueName }) {
  const digits = String(contact ?? '').replace(/\D/g, '')
  if (digits.length < 10) return null

  const label = SERVICE[service]?.label ?? service
  const where = roomNumber ? `Room ${roomNumber}` : venueName
  const text = `${label} request${where ? ` — ${where}` : ''}`

  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
}
