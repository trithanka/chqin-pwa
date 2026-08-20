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
 * How each service key is said and drawn.
 *
 * The keys come from `@chqin/shared` so the server, the dashboard and the
 * guest app agree on the vocabulary; the wording lives here, because copy
 * changing shouldn't need an API deploy — same rule as `labels.js`.
 */
export const SERVICE = {
  food: { label: 'Food', sub: 'Kitchen', icon: UtensilsCrossed },
  water: { label: 'Water', sub: 'Room service', icon: CupSoda },
  housekeeping: { label: 'Housekeeping', sub: 'Cleaning and linen', icon: Sparkles },
  laundry: { label: 'Laundry', sub: 'Wash and press', icon: WashingMachine },
  maintenance: { label: 'Maintenance', sub: 'Repairs', icon: Wrench },
  cab: { label: 'Cab / Airport transfer', sub: 'Travel desk', icon: Car },
  spa: { label: 'Spa', sub: 'Bookings', icon: Flower2 },
  luggage: { label: 'Luggage', sub: 'Bell desk', icon: BriefcaseBusiness },
  wakeup: { label: 'Wake-up call', sub: 'Reception', icon: BellRing },
}

export const serviceLabel = (key) => SERVICE[key]?.label ?? key
