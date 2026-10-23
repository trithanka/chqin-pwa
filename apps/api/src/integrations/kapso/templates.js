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

// Meta rejects a body that starts or ends with a variable, or has too few
// words per variable, so each one is padded with plain text on both sides.
const templates = [
  {
    name: 'visitor_arrival',
    components: [
      named('Hello, a visitor is waiting at reception. Name: {{visitor}}. Purpose: {{purpose}}. They asked to see {{host}}. Please tap a button below to let them in, keep them waiting, or decline the visit.', 'visitor', 'purpose', 'host'),
      {
        type: 'BUTTONS',
        buttons: ['Confirm', 'Keep waiting', 'Decline'].map((text) => ({ type: 'QUICK_REPLY', text })),
      },
    ],
  },
  {
    name: 'event_checkin',
    components: [
      named('A new attendee has just checked in at your event {{event}}. Name: {{visitor}}, working as {{designation}} at {{company}}. You can see every arrival on your ChqIn dashboard.', 'visitor', 'designation', 'company', 'event'),
    ],
  },
  // Hotels.
  {
    name: 'hotel_checkin_alert',
    components: [named('A guest has just completed check-in at {{hotel}}. Guest name: {{guest}}. Room number: {{room}}. Open your ChqIn dashboard to see their details and stay dates.', 'guest', 'hotel', 'room')],
  },
  // Only the confirmation: Meta rejected every version that carried Wi-Fi or
  // check-out details as marketing. The button opens WhatsApp's 24-hour
  // window and the details follow as a plain message (stayDetailsReply in
  // modules/hotel/stayMessages.js).
  {
    name: 'hotel_checkin_confirmed',
    components: [
      named(
        'Hello {{guest}}, your check-in at {{hotel}} is confirmed. Tap the button below if you would like your room details sent in this chat.',
        'guest', 'hotel',
      ),
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Send room details' }] },
    ],
  },
  {
    name: 'hotel_room_ready',
    components: [named('Hello {{guest}}, good news from {{hotel}}. Your room is ready and the room number is {{room}}. Please collect your key at the front desk and enjoy your stay with us.', 'guest', 'hotel', 'room')],
  },
  {
    name: 'service_request',
    components: [named('A new guest request has arrived. Service: {{service}}. Guest name: {{guest}}, room {{room}}. Note from the guest: {{note}}. Please attend to it as soon as you can.', 'service', 'guest', 'room', 'note')],
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
