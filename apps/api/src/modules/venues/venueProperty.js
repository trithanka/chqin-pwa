import { and, eq } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import { venues } from '../../shared/db/schema.js'
import { notFound } from '../../shared/lib/errors.js'

/** The property itself: name, place, time zone. */

/** What the owner can change about the property. */
export async function getProperty(venueId) {
  const [venue] = await db
    .select({
      name: venues.name,
      kind: venues.kind,
      location: venues.location,
      timezone: venues.timezone,
      address: venues.address,
    })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1)

  if (!venue) throw notFound('That property no longer exists.')
  return venue
}

/**
 * `address` is merged rather than replaced, for the same reason
 * `venues.settings` is: it is one JSON column holding fields this screen
 * doesn't show, and a spread of what the form knows about would delete the
 * rest without anything noticing.
 */
export async function saveProperty(venueId, patch) {
  const current = await getProperty(venueId)

  const [row] = await db
    .update(venues)
    .set({
      name: patch.name,
      kind: patch.kind,
      location: patch.location ?? null,
      timezone: patch.timezone,
      address: { ...current.address, ...patch.address },
    })
    .where(eq(venues.id, venueId))
    .returning({ name: venues.name, kind: venues.kind, location: venues.location })

  return row
}
