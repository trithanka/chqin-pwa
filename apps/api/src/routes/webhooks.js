import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { config } from '../config.js'
import { decideFromWhatsApp, replyFrom } from '../services/whatsapp.js'

export const webhooks = new Hono()

const signedBy = (secret, raw, signature) => {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(raw).digest('hex')
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Kapso → us: a host tapped Confirm, Keep waiting or Decline in WhatsApp.
 *
 * The signature is over the raw body, so it is read as text before anything
 * parses it. Whatever the outcome for the visit, a verified delivery is
 * acknowledged with 200: Kapso retries anything else, and a visit that is no
 * longer waiting will not become waiting by being told again.
 */
webhooks.post('/kapso', async (c) => {
  if (!config.KAPSO_WEBHOOK_SECRET) return c.json({ error: 'not_configured' }, 503)

  const raw = await c.req.text()
  if (!signedBy(config.KAPSO_WEBHOOK_SECRET, raw, c.req.header('x-webhook-signature'))) {
    return c.json({ error: 'invalid_signature' }, 401)
  }

  let body
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }

  const event = c.req.header('x-webhook-event')
  if (event === 'whatsapp.message.received') {
    // Buffered deliveries arrive as { batch: true, data: [...] }.
    for (const payload of body.batch ? body.data : [body]) {
      const reply = replyFrom(payload)
      if (!reply) continue
      try {
        const result = await decideFromWhatsApp(reply)
        if (result?.ignored) console.warn(`[kapso] ignored reply: ${result.ignored}`)
      } catch (err) {
        // A visit that was already decided (409) or expired is not an error worth a retry.
        console.warn(`[kapso] reply not applied: ${err.code ?? err.message}`)
      }
    }
  }
  return c.json({ ok: true })
})
