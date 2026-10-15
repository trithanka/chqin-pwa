import { config } from '../../config.js'
import { waNumber } from '../../shared/lib/phone.js'

/**
 * The outbox sender for Kapso (WhatsApp). Every message is an approved template
 * (see templates.js for their text).
 */

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
