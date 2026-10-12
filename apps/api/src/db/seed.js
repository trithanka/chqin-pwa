import {
  entitlements,
  entrySessions,
  gates,
  hotelBookingRooms,
  hotelBookings,
  hotelRooms,
  venues,
} from './schema/index.js'
import { latestFlowId } from '../services/flows.js'
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

const flowId = await latestFlowId('hotel')

// The desk QR never expires on its own — it's revoked, or the card is
// reprinted.
const deskToken = newSessionToken()
const [gate] = await db
  .insert(gates)
  .values({
    venueId: venue.id,
    name: 'Front desk',
    kind: 'desk',
    flowId,
    token: deskToken,
    tokenHash: tokenHash(deskToken),
  })
  .returning({ id: gates.id })

const bookingTokens = []

for (const [ref, number, guestName] of [
  ['AUR-4821', '305', 'Rahul Sharma'],
  ['AUR-4822', '306', 'Rahul Sharma'],
  ['AUR-4823', '412', 'Rahul Sharma'],
]) {
  const [room] = await db
    .insert(hotelRooms)
    .values({ venueId: venue.id, number, roomType: 'Deluxe' })
    .returning({ id: hotelRooms.id })

  const [booking] = await db
    .insert(entitlements)
    .values({ venueId: venue.id, kind: 'booking', ref })
    .returning({ id: entitlements.id })

  await db.insert(hotelBookings).values({
    entitlementId: booking.id,
    guestName,
    arrivalDate: today,
    departureDate: inDays(2),
  })
  await db.insert(hotelBookingRooms).values({ bookingId: booking.id, roomId: room.id })

  const token = newSessionToken()
  await db.insert(entrySessions).values({
    venueId: venue.id,
    gateId: gate.id,
    flowId,
    entitlementId: booking.id,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 3 * 86_400_000),
  })
  bookingTokens.push([ref, token])
}

console.log('seeded Hotel Aurora · 3 reservations arriving today')
console.log(`desk QR token : ${deskToken}`)
for (const [ref, token] of bookingTokens) console.log(`booking ${ref}: ${token}`)
await pool.end()
