import '../../config.js'

/**
 * Creates the WhatsApp templates the product sends, through Kapso.
 * Run once per WhatsApp business account; Meta then reviews them (usually
 * minutes to a day) and a template cannot be sent until it is approved.
 *
 *   KAPSO_API_KEY=… KAPSO_WABA_ID=… npm run kapso:templates
 *
 * Both are UTILITY: a notice about something the person is already doing.
 * Meta reclassifies anything that reads as promotional, so keep the wording as
 * plain as it is here.
 */
const key = process.env.KAPSO_API_KEY
const waba = process.env.KAPSO_WABA_ID
if (!key || !waba) {
  console.error('Need KAPSO_API_KEY and KAPSO_WABA_ID.')
  process.exit(1)
}

const base = process.env.KAPSO_BASE_URL ?? 'https://api.kapso.ai/meta/whatsapp/v24.0'
const named = (text, ...names) => ({
  type: 'BODY',
  text,
  example: { body_text_named_params: names.map((n) => ({ param_name: n, example: EXAMPLE[n] })) },
})
const EXAMPLE = {
  visitor: 'Rahul Sharma',
  purpose: 'Meeting',
  host: 'CEO Office',
  event: 'Founder Meetup',
  company: 'Acme',
  designation: 'Founder',
  guest: 'Rahul Sharma',
  hotel: 'Hotel Aurora',
  room: '305',
  wifi: 'Aurora_Guest',
  password: 'welcome2024',
  checkout: '11:00',
  service: 'Laundry',
  note: 'Two shirts, pressed',
}

const templates = [
  {
    name: 'visitor_arrival',
    components: [
      named('{{visitor}} is at reception for a {{purpose}} and asked to see {{host}}. Can they come in?', 'visitor', 'purpose', 'host'),
      {
        type: 'BUTTONS',
        buttons: ['Confirm', 'Keep waiting', 'Decline'].map((text) => ({ type: 'QUICK_REPLY', text })),
      },
    ],
  },
  {
    name: 'event_checkin',
    components: [
      named('{{visitor}} ({{designation}}, {{company}}) checked in to {{event}}.', 'visitor', 'designation', 'company', 'event'),
    ],
  },
  // Hotels.
  {
    name: 'hotel_checkin_alert',
    components: [named('{{guest}} checked in at {{hotel}}. Room: {{room}}.', 'guest', 'hotel', 'room')],
  },
  {
    name: 'hotel_welcome',
    components: [
      named(
        'Welcome to {{hotel}}, {{guest}}. Wi-Fi: {{wifi}}, password: {{password}}. Check-out: {{checkout}}.',
        'guest', 'hotel', 'wifi', 'password', 'checkout',
      ),
    ],
  },
  {
    name: 'hotel_room_ready',
    components: [named('{{guest}}, your room at {{hotel}} is {{room}}.', 'guest', 'hotel', 'room')],
  },
  {
    name: 'service_request',
    components: [named('{{service}} request from {{guest}}, room {{room}}: {{note}}', 'service', 'guest', 'room', 'note')],
  },
]

for (const t of templates) {
  const res = await fetch(`${base}/${waba}/message_templates`, {
    method: 'POST',
    headers: { 'X-API-Key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ ...t, category: 'UTILITY', language: 'en', parameter_format: 'NAMED' }),
  })
  console.log(`${t.name}: ${res.status} ${(await res.text()).slice(0, 160)}`)
}
