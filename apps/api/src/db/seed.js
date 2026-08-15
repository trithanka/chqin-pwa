import { bookings, checkinSessions, venues, rooms } from './schema/index.js'
import { db, pool } from './client.js'
import { newSessionToken, tokenHash } from '../lib/crypto.js'
import { config, isRemote } from '../config.js'

/**
 * Refuse a database that isn't on this machine unless told explicitly.
 *
 * These scripts destroy data, and which database they hit depends on whichever
 * URL happens to be uncommented in .env — a state that changes for unrelated
 * reasons, like running a migration. Requiring the flag means a production
 * wipe is always a decision, never a leftover.
 */
if (isRemote()) {
  if (process.env.CHQIN_ALLOW_REMOTE !== 'yes') {
    console.error(`Refusing: DATABASE_URL points at ${new URL(config.DATABASE_URL).host}.`)
    console.error('If you mean it, re-run with CHQIN_ALLOW_REMOTE=yes.')
    process.exit(1)
  }
  console.warn(`⚠︎ operating on REMOTE database ${new URL(config.DATABASE_URL).host}`)
}


/**
 * Enough data to exercise the flow: one hotel, three reservations arriving
 * today, and both kinds of QR.
 *
 *   desk QR    — printed on the counter card, long-lived, identifies the
 *                property. Mints a short-lived child session per scan.
 *   booking QR — what goes in a confirmation email. Knows its reservation, so
 *                a first-time guest can finish without staff matching them.
 */

const today = new Date().toISOString().slice(0, 10)
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)

const [venue] = await db
  .insert(venues)
  .values({
    name: 'Hotel Aurora',
    kind: 'hotel',
    location: 'Bandra West, Mumbai',
    timezone: 'Asia/Kolkata',
    address: { line1: 'Linking Road', city: 'Mumbai', country: 'IN' },
  })
  .returning({ id: venues.id })

const bookingTokens = []

for (const [ref, number, guestName] of [
  ['AUR-4821', '305', 'Rahul Sharma'],
  ['AUR-4822', '306', 'Rahul Sharma'],
  ['AUR-4823', '412', 'Rahul Sharma'],
]) {
  const [room] = await db
    .insert(rooms)
    .values({ venueId: venue.id, number, roomType: 'Deluxe' })
    .returning({ id: rooms.id })

  const [booking] = await db
    .insert(bookings)
    .values({
      venueId: venue.id,
      bookingRef: ref,
      guestName,
      roomId: room.id,
      arrivalDate: today,
      departureDate: inDays(2),
    })
    .returning({ id: bookings.id })

  const token = newSessionToken()
  await db.insert(checkinSessions).values({
    venueId: venue.id,
    bookingId: booking.id,
    tokenHash: tokenHash(token),
    kind: 'booking',
    expiresAt: new Date(Date.now() + 3 * 86_400_000),
  })
  bookingTokens.push([ref, token])
}

// The desk QR never expires on its own — it's revoked, or the card is
// reprinted.
const deskToken = newSessionToken()
await db.insert(checkinSessions).values({
  venueId: venue.id,
  tokenHash: tokenHash(deskToken),
  kind: 'desk',
  expiresAt: new Date(Date.now() + 3650 * 86_400_000),
})

console.log('seeded Hotel Aurora · 3 reservations arriving today')
console.log(`desk QR token : ${deskToken}`)
for (const [ref, token] of bookingTokens) console.log(`booking ${ref}: ${token}`)
await pool.end()
