import { and, eq, sql } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import { entries, venues } from '../../shared/db/schema.js'
import { notFound } from '../../shared/lib/errors.js'

/** What a property offers and where requests go. Every query filters by the caller's venue. */

/** The editable slice of `venues.settings`. `business` is not edited here. */
export async function getSettings(venueId) {
  const [venue] = await db
    .select({ settings: venues.settings })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1)

  if (!venue) throw notFound('That property no longer exists.')

  const settings = venue.settings ?? {}
  return {
    services: Array.isArray(settings.services) ? settings.services : [],
    essentials: settings.essentials ?? {},
    contacts: settings.contacts ?? {},
  }
}

/** The number a guest's check-in is announced to. Kept apart from the rest of
 *  settings so saving it can never overwrite what another panel just saved. */
export async function getReception(venueId) {
  const [venue] = await db.select({ settings: venues.settings }).from(venues).where(eq(venues.id, venueId))
  if (!venue) throw notFound('That property no longer exists.')
  return { reception: venue.settings?.reception ?? null }
}

export async function saveReception(venueId, reception) {
  const [row] = await db
    .update(venues)
    .set({ settings: sql`${venues.settings} || ${JSON.stringify({ reception })}::jsonb` })
    .where(eq(venues.id, venueId))
    .returning({ id: venues.id })
  if (!row) throw notFound('That property no longer exists.')
  return { reception }
}

/**
 * The three fields the settings screen owns, laid over what is already there.
 *
 * A merge rather than a replacement: the column is one JSON blob that also
 * holds `business` (the GSTIN and the registration name), which no screen here
 * edits and nothing on the guest side reads — so overwriting the column would
 * delete it silently, and stay unnoticed until someone looked for the GSTIN.
 */
export function mergeSettings(existing, { services, essentials, contacts }) {
  // A service with no number behind it is a tile the guest never sees
  // (modules/hotel/stay.js drops it), so the numbers of services that were turned
  // off are dropped here rather than kept as orphans in the column.
  const kept = Object.fromEntries(
    Object.entries(contacts).filter(([key, number]) => services.includes(key) && number),
  )

  return { ...(existing ?? {}), services, essentials, contacts: kept }
}

export async function saveSettings(venueId, patch) {
  const [venue] = await db
    .select({ settings: venues.settings })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1)

  if (!venue) throw notFound('That property no longer exists.')

  const settings = mergeSettings(venue.settings, patch)

  await db.update(venues).set({ settings }).where(eq(venues.id, venueId))

  const { business: _business, ...editable } = settings
  return editable
}
