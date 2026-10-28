import { config } from '../../../config.js'

/**
 * What the WhatsApp account looks like from Kapso's side: the sending number,
 * whether Meta has approved each template the product sends, and where
 * incoming replies are delivered. Read-only; changes are made in Kapso.
 */

// The templates the product sends (see integrations/kapso/templates.js).
const TEMPLATES = [
  'visitor_arrival',
  'event_checkin',
  'hotel_checkin_alert',
  'hotel_checkin_confirmed',
  'hotel_room_ready',
  'service_request',
]

const get = async (url) => {
  const res = await fetch(url, { headers: { 'X-API-Key': config.KAPSO_API_KEY }, signal: AbortSignal.timeout(8_000) })
  if (!res.ok) throw new Error(`kapso ${res.status}: ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

export async function whatsappStatus() {
  const base = {
    sender: config.OUTBOX_SENDER ?? null,
    phoneNumberId: config.KAPSO_PHONE_NUMBER_ID ?? null,
    webhookSecret: Boolean(config.KAPSO_WEBHOOK_SECRET),
    consoleUrl: 'https://app.kapso.ai',
  }
  if (!config.KAPSO_API_KEY || !config.KAPSO_PHONE_NUMBER_ID) return { ...base, connected: false }

  const platform = `${new URL(config.KAPSO_BASE_URL).origin}/platform/v1/whatsapp/phone_numbers`
  try {
    const numbers = await get(platform)
    const n = numbers.data?.find((x) => x.phone_number_id === config.KAPSO_PHONE_NUMBER_ID)
    if (!n) return { ...base, connected: false, error: 'This phone number ID is not in the Kapso project.' }

    const [templates, hooks] = await Promise.all([
      get(`${config.KAPSO_BASE_URL}/${n.business_account_id}/message_templates?fields=name,status,category&limit=100`),
      get(`${platform}/${n.phone_number_id}/webhooks`),
    ])
    const byName = new Map((templates.data ?? []).map((t) => [t.name, t]))
    return {
      ...base,
      connected: true,
      number: {
        display: n.display_phone_number,
        name: n.verified_name ?? n.name,
        status: n.status,
        quality: n.quality_rating,
        limit: n.whatsapp_business_manager_messaging_limit,
        businessAccountId: n.business_account_id,
      },
      templates: TEMPLATES.map((name) => ({
        name,
        status: byName.get(name)?.status ?? 'MISSING',
        category: byName.get(name)?.category ?? null,
      })),
      webhooks: (hooks.data ?? []).map((h) => ({ url: h.url, active: h.active, events: h.events })),
    }
  } catch (err) {
    return { ...base, connected: false, error: err.message }
  }
}
