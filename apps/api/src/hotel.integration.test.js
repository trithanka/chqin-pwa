import assert from 'node:assert/strict'
import test from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { isRemote } from './config.js'

// Run with: npm test (needs the local Postgres: npm run db:up && npm run db:migrate)
// Registers its own venue under a unique email, so it can run against a seeded database.
// Refuses a remote one: it writes rows.

const skip = isRemote() ? 'needs a local database' : false

test('hotel flow, scan to check-in', { skip }, async () => {
  const { app } = await import('./app.js')
  const { db, pool } = await import('./db/client.js')
  const S = await import('./db/schema/index.js')
  const { bindGuest } = await import('./services/sessions.js')

  const post = (path, body, headers = {}) =>
    app.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', ...headers },
      body: JSON.stringify(body),
    })

  try {
    // A venue registers; onboarding gives it a gate.
    const email = `it-${Date.now()}@test.dev`
    let r = await post('/staff/register', {
      account: { name: 'Owner', email, password: 'a-long-password-1' },
      property: { name: 'Integration Inn', city: 'Pune' },
      rooms: [{ number: '101' }, { number: '102' }],
    })
    assert.equal(r.status, 200)
    const cookie = r.headers.get('set-cookie').split(';')[0]
    const get = (p) => app.request(p, { headers: { cookie, origin: 'http://localhost:5173' } })
    const { token } = await (await get('/staff/checkin-code')).json()
    assert.ok(token)

    const [venue] = await db.select().from(S.venues).where(eq(S.venues.name, 'Integration Inn')).orderBy(sql`created_at DESC`).limit(1)
    const [room] = await db.select().from(S.hotelRooms).where(eq(S.hotelRooms.venueId, venue.id)).limit(1)
    const [booking] = await db.insert(S.entitlements).values({ venueId: venue.id, kind: 'booking', ref: 'IT-1' }).returning()
    await db.insert(S.hotelBookings).values({
      entitlementId: booking.id,
      guestName: 'Rahul Sharma',
      arrivalDate: sql`CURRENT_DATE`,
      departureDate: sql`CURRENT_DATE + 2`,
    })
    await db.insert(S.hotelBookingRooms).values({ bookingId: booking.id, roomId: room.id })

    // Scan the gate, find the booking.
    r = await post('/sessions/resolve', { token })
    const scan = await r.json()
    assert.equal(r.status, 200)
    assert.equal(scan.venue.name, 'Integration Inn')
    const sid = scan.sessionId
    r = await post('/sessions/booking', { sessionId: sid, lookup: 'IT-1' })
    assert.equal((await r.json()).booking.reference, 'IT-1')

    // No identity yet: refused.
    const key = 'it-idem-12345678'
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    assert.equal(r.status, 401)

    // Identity bound, then check in. A retry returns the same entry.
    const [guest] = await db.insert(S.guests).values({ displayName: 'Rahul Sharma', emailHmac: Buffer.alloc(32, 7) }).returning()
    await db.transaction((tx) => bindGuest(tx, sid, guest.id))
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    const first = await r.json()
    assert.equal(r.status, 200)
    assert.equal(first.roomNumber, room.number)
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    assert.equal((await r.json()).checkinId, first.checkinId)
    const entries = await db.select().from(S.entries).where(eq(S.entries.sessionId, sid))
    assert.equal(entries.length, 1)

    // The session is closed to a different key.
    r = await post('/checkin', { sessionId: sid, idempotencyKey: 'it-other-key-1' })
    assert.equal(r.status, 409)

    // Dashboard reads work.
    for (const p of ['/staff/overview', '/staff/bookings', '/staff/guests', '/staff/rooms']) {
      assert.equal((await get(p)).status, 200, p)
    }
  } finally {
    await pool.end()
  }
})
