/**
 * The WhatsApp messages a hotel sends, as outbox rows. Each is a template with
 * named parameters (see integrations/kapso/templates.js); `text` is only what the log sender
 * prints. Parameters may not be empty or contain line breaks, so every value
 * goes through `p`.
 */

const SERVICE = {
  food: 'Food',
  water: 'Water',
  housekeeping: 'Housekeeping',
  laundry: 'Laundry',
  maintenance: 'Maintenance',
  cab: 'Cab',
  spa: 'Spa',
  luggage: 'Luggage',
  wakeup: 'Wake-up call',
}
export const serviceLabel = (key) => SERVICE[key] ?? key

const p = (value, fallback) => String(value ?? '').replace(/\s+/g, ' ').trim() || fallback

const row = (venueId, kind, to, name, params, sessionId) => ({
  venueId,
  kind,
  payload: {
    to,
    sessionId,
    text: `${name} ${JSON.stringify(params)}`,
    template: { name, params, buttons: [] },
  },
})

/** To the front desk, when a guest checks in. */
export const receptionAlert = (venueId, to, { guest, hotel, room, sessionId }) =>
  row(venueId, 'hotel.checkin', to, 'hotel_checkin_alert', {
    guest: p(guest, 'A guest'),
    hotel: p(hotel, 'the hotel'),
    room: p(room, 'not assigned yet'),
  }, sessionId)

/** To the guest, who asked for their stay details on WhatsApp. */
export const welcome = (venueId, to, { guest, hotel, essentials, sessionId }) =>
  row(venueId, 'hotel.welcome', to, 'hotel_welcome', {
    guest: p(guest, 'there'),
    hotel: p(hotel, 'the hotel'),
    wifi: p(essentials?.wifiSsid, 'ask at reception'),
    password: p(essentials?.wifiPassword, 'none'),
    checkout: p(essentials?.checkoutTime, 'ask at reception'),
  }, sessionId)

/** To the guest, when the desk gives them a room. */
export const roomReady = (venueId, to, { guest, hotel, room, sessionId }) =>
  row(venueId, 'hotel.room', to, 'hotel_room_ready', {
    guest: p(guest, 'there'),
    hotel: p(hotel, 'the hotel'),
    room: p(room, 'your room'),
  }, sessionId)

/** To the team a service routes to, when a guest asks for something. */
export const serviceRequest = (venueId, to, { service, guest, room, note, sessionId }) =>
  row(venueId, 'service.request', to, 'service_request', {
    service: serviceLabel(service),
    guest: p(guest, 'A guest'),
    room: p(room, 'not assigned yet'),
    note: p(note, 'No note'),
  }, sessionId)
