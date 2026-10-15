import { eq } from 'drizzle-orm'
import { eventEvents, guests, visitHosts } from '../../shared/db/schema.js'

/**
 * Turns what a flow emitted into messages. Which message, to whom and what it
 * says is decided here, not in the steps: a step only says "something happened".
 * A recipient with no number gets no row — the dashboard shows the same fact.
 */

const PURPOSE = { meeting: 'Meeting', office: 'Office work' }

async function hostOf(tx, id) {
  if (!id) return null
  const [row] = await tx.select().from(visitHosts).where(eq(visitHosts.id, id))
  return row ?? null
}

export async function messagesFor(tx, session, state, emits) {
  const rows = []
  if (!emits.length) return rows

  const [guest] = session.guestId
    ? await tx.select({ name: guests.displayName }).from(guests).where(eq(guests.id, session.guestId))
    : []
  const visitor = guest?.name ?? 'A visitor'

  for (const emit of emits) {
    if (emit.kind === 'visit.arrival') {
      const host = await hostOf(tx, state.host)
      if (!host?.phone) continue
      rows.push({
        venueId: session.venueId,
        kind: emit.kind,
        payload: {
          to: host.phone,
          text: `ChqIn · Visitor arrival\nVisitor: ${visitor}\nPurpose: ${PURPOSE[state.purpose] ?? state.purpose}\nMeeting with: ${host.name}`,
          sessionId: session.id,
          // What a WhatsApp sender needs. The buttons carry the session, so the
          // host's tap says which visit it is about (see hostReply.js).
          template: {
            name: 'visitor_arrival',
            params: { visitor, purpose: PURPOSE[state.purpose] ?? state.purpose, host: host.name },
            buttons: ['confirm', 'hold', 'decline'].map((d) => `visit:${d}:${session.id}`),
          },
        },
      })
    }

    if (emit.kind === 'entry.admitted' && state.purpose === 'event') {
      const [event] = await tx.select().from(eventEvents).where(eq(eventEvents.id, state.event))
      const organizer = await hostOf(tx, event?.organizerId)
      if (!organizer?.phone) continue
      rows.push({
        venueId: session.venueId,
        kind: emit.kind,
        payload: {
          to: organizer.phone,
          text: `ChqIn · New event check-in\nEvent: ${event.name}\nVisitor: ${visitor}\nCompany: ${state.company}\nDesignation: ${state.designation}`,
          sessionId: session.id,
          template: {
            name: 'event_checkin',
            params: { visitor, event: event.name, company: state.company, designation: state.designation },
            buttons: [],
          },
        },
      })
    }
  }
  return rows
}
