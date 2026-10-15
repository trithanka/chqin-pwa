import { and, eq } from 'drizzle-orm'
import { db } from '../../shared/db/client.js'
import { entrySessions, visitHosts } from '../../shared/db/schema.js'
import { waNumber } from '../../shared/lib/phone.js'
import { respond } from './progress.js'

/** A host's tap on a button in WhatsApp, turned back into a decision on the visit. */

const BUTTON = /^visit:(confirm|hold|decline):([0-9a-f-]{36})$/

/**
 * What a webhook payload says, if it is a host's tap on one of our buttons.
 * A tapped template button arrives as `button` or `interactive` depending on
 * the message type, so both are read.
 */
export function replyFrom(payload) {
  const m = payload?.message
  if (!m || m.kapso?.direction === 'outbound') return null
  const raw = m.button?.payload ?? m.interactive?.button_reply?.id ?? null
  const match = typeof raw === 'string' ? raw.match(BUTTON) : null
  if (!match) return null
  return {
    decision: match[1],
    sessionId: match[2],
    // Absent when WhatsApp hides the number (business-scoped user ids).
    from: m.from ?? payload.conversation?.phone_number ?? null,
  }
}

/**
 * Apply a host's tap. The button's session id is the key — only the host's own
 * WhatsApp ever received it — and where the sender's number is known it must
 * also be the number on file for that visit's host.
 */
export async function decideFromWhatsApp({ decision, sessionId, from }) {
  const [session] = await db
    .select({ venueId: entrySessions.venueId, state: entrySessions.state })
    .from(entrySessions)
    .where(eq(entrySessions.id, sessionId))
  if (!session?.state?.host) return { ignored: 'unknown_visit' }

  const [host] = await db
    .select({ id: visitHosts.id, phone: visitHosts.phone })
    .from(visitHosts)
    .where(and(eq(visitHosts.id, session.state.host), eq(visitHosts.venueId, session.venueId)))
  if (!host) return { ignored: 'unknown_host' }

  if (from && waNumber(from) !== waNumber(host.phone)) return { ignored: 'wrong_sender' }

  return respond(session.venueId, `host:${host.id}`, sessionId, decision)
}
