import { and, eq } from 'drizzle-orm'
import { config } from '../config.js'
import { db } from '../db/client.js'
import { entrySessions, visitHosts } from '../db/schema/index.js'
import { respond } from './progress.js'

/**
 * WhatsApp through Kapso: send the outbox's messages as templates, and turn a
 * host's tap on a button back into a decision on the visit.
 *
 * WhatsApp only lets a business start a conversation with an approved template,
 * so every message here is one (see kapsoTemplates.js for their text).
 */

const digits = (value) => String(value ?? '').replace(/\D/g, '')

/** Meta wants the country code and nothing else. A bare 10-digit number is Indian. */
export const waNumber = (value) => {
  const d = digits(value)
  return d.length === 10 ? `91${d}` : d
}

/** The outbox sender for `OUTBOX_SENDER=kapso`. Throws to fail a row, which retries. */
export async function kapsoSender(row) {
  const { to, template } = row.payload
  if (!to || !template) throw new Error('message has no number or template')

  const components = [
    {
      type: 'body',
      parameters: Object.entries(template.params).map(([name, text]) => ({
        type: 'text',
        parameter_name: name,
        // WhatsApp refuses line breaks, tabs and runs of spaces in a parameter.
        text: String(text).replace(/\s+/g, ' ').trim().slice(0, 200),
      })),
    },
    ...template.buttons.map((payload, index) => ({
      type: 'button',
      sub_type: 'quick_reply',
      index: String(index),
      parameters: [{ type: 'payload', payload }],
    })),
  ]

  const res = await fetch(`${config.KAPSO_BASE_URL}/${config.KAPSO_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'X-API-Key': config.KAPSO_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: waNumber(to),
      type: 'template',
      template: { name: template.name, language: { code: 'en' }, components },
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`kapso ${res.status}: ${(await res.text()).slice(0, 200)}`)
}

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
