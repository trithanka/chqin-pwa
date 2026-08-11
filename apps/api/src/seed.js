import { newSessionToken, pool, query, tokenHash } from './db.js'

/**
 * Enough data to exercise the flow: one hotel, a few rooms, three reservations
 * arriving today, and two kinds of QR.
 *
 *   desk QR    — printed on the counter card, long-lived, identifies the
 *                property. Mints a short-lived child session per scan.
 *   booking QR — what goes in a confirmation email. Knows its reservation, so
 *                a first-time guest can finish without staff matching them.
 */

const { rows: hotels } = await query(
  `INSERT INTO hotels (name, location, timezone, address)
   VALUES ('Hotel Aurora', 'Bandra West, Mumbai', 'Asia/Kolkata',
           '{"line1":"Linking Road","city":"Mumbai","country":"IN"}'::jsonb)
   RETURNING id`,
)
const hotelId = hotels[0].id

const bookingTokens = []
for (const [ref, room, guest] of [
  ['AUR-4821', '305', 'Rahul Sharma'],
  ['AUR-4822', '306', 'Rahul Sharma'],
  ['AUR-4823', '412', 'Rahul Sharma'],
]) {
  const { rows: rooms } = await query(
    `INSERT INTO rooms (hotel_id, number, room_type) VALUES ($1, $2, 'Deluxe') RETURNING id`,
    [hotelId, room],
  )
  const { rows: bookings } = await query(
    `INSERT INTO bookings (hotel_id, booking_ref, guest_name, room_id, arrival_date, departure_date)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, CURRENT_DATE + 2) RETURNING id`,
    [hotelId, ref, guest, rooms[0].id],
  )

  const token = newSessionToken()
  await query(
    `INSERT INTO checkin_sessions (hotel_id, booking_id, token_hash, kind, expires_at)
     VALUES ($1, $2, $3, 'booking', now() + interval '3 days')`,
    [hotelId, bookings[0].id, tokenHash(token)],
  )
  bookingTokens.push([ref, token])
}

// The desk QR never expires on its own — it's revoked, or the card is
// reprinted.
const deskToken = newSessionToken()
await query(
  `INSERT INTO checkin_sessions (hotel_id, token_hash, kind, expires_at)
   VALUES ($1, $2, 'desk', now() + interval '10 years')`,
  [hotelId, tokenHash(deskToken)],
)

console.log('seeded Hotel Aurora · 3 reservations arriving today')
console.log(`desk QR token : ${deskToken}`)
for (const [ref, token] of bookingTokens) console.log(`booking ${ref}: ${token}`)
await pool.end()
