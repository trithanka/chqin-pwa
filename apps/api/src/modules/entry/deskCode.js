import { and, eq, isNotNull } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import { gates, venues } from '../../shared/db/schema.js'
import { flowKeyFor, latestFlowId } from './flows.js'
import { newSessionToken, tokenHash } from '../../shared/lib/crypto.js'

/** The venue's entrance code. */

/**
 * The venue's check-in code — the one printed on the desk card.
 *
 * Created on first ask and returned unchanged after that, because the card is
 * printed: a code that rotated on every visit would invalidate the card
 * already sitting on the counter.
 */
export async function checkinCode(venueId) {
  const [existing] = await db
    .select({ token: gates.token })
    .from(gates)
    .where(
      and(
        eq(gates.venueId, venueId),
        eq(gates.kind, 'desk'),
        eq(gates.status, 'active'),
        isNotNull(gates.token),
      ),
    )
    .limit(1)

  if (existing?.token) return { token: existing.token }

  // A venue made before gates existed has none yet.
  const [venue] = await db.select({ kind: venues.kind }).from(venues).where(eq(venues.id, venueId))
  const token = newSessionToken()
  await db.insert(gates).values({
    venueId,
    name: 'Front desk',
    kind: 'desk',
    flowId: await latestFlowId(flowKeyFor(venue.kind)),
    token,
    tokenHash: tokenHash(token),
  })

  return { token }
}
