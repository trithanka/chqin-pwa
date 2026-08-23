import { GUEST_SERVICES } from '@chqin/shared'

/**
 * What the property offers, as told to a guest who has finished checking in.
 *
 * Built from `venues.settings`, which onboarding writes. Three rules decide
 * what crosses to the guest:
 *
 * 1. Only services the property switched on. An empty list is a valid answer —
 *    a property that offers nothing yet shows nothing, not a grid of dead
 *    buttons.
 * 2. Only services with somewhere to send the request. A tile with no number
 *    behind it is a request that vanishes, which is worse than no tile.
 * 3. Nothing else from settings. `business` holds the GSTIN and the
 *    registration name; neither is a guest's business, and a spread of the
 *    whole object is how it would end up in their hands.
 */
export function stayFrom(settings) {
  const services = Array.isArray(settings?.services) ? settings.services : []
  const contacts = settings?.contacts ?? {}
  const essentials = settings?.essentials ?? {}

  return {
    services: services
      .filter((key) => GUEST_SERVICES.includes(key) && contacts[key])
      .map((key) => ({ key, contact: contacts[key] })),
    // The four things every guest asks the desk. Absent keys are dropped
    // rather than sent as empty strings — the client renders what it is given.
    essentials: {
      wifiSsid: essentials.wifiSsid || null,
      wifiPassword: essentials.wifiPassword || null,
      breakfastFrom: essentials.breakfastFrom || null,
      breakfastTo: essentials.breakfastTo || null,
      checkoutTime: essentials.checkoutTime || null,
      notes: essentials.notes || null,
    },
  }
}
