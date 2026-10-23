import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { config, isRemote } from '../../config.js'

// Run with: npm test (needs the local Postgres: npm run db:up && npm run db:migrate)
// Registers its own venue under a unique email, so it can run against a seeded database.
// Refuses a remote one: it writes rows.

const skip = isRemote() ? 'needs a local database' : false

test('hotel flow, scan to check-in', { skip }, async () => {
  const { app } = await import('../../app.js')
  const { db, pool } = await import('../../shared/db/client.js')
  const S = await import('../../shared/db/schema.js')
  const { bindGuest } = await import('../entry/sessions.js')

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
      services: ['food'],
      contacts: { food: '+91 98765 11111' },
      essentials: { wifiSsid: 'Inn_Guest', wifiPassword: 'welcome1', checkoutTime: '11:00' },
      reception: '+91 98765 22222',
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
    const key = `it-idem-${randomBytes(6).toString('hex')}`
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    assert.equal(r.status, 401)

    // Identity bound, then check in. A retry returns the same entry.
    const [guest] = await db.insert(S.guests).values({ displayName: 'Rahul Sharma', emailHmac: randomBytes(32) }).returning()
    await db.transaction((tx) => bindGuest(tx, sid, guest.id))
    // A hotel uses Aadhaar: someone who only ever gave name and address must pass it once.
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    assert.equal(r.status, 403)
    assert.equal((await r.json()).error, 'aadhaar_required')
    await db.insert(S.identityVerifications).values({ guestId: guest.id, sessionId: sid, method: 'aadhaar_otp', provider: 'simulated', result: 'passed' })
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    const first = await r.json()
    assert.equal(r.status, 200)
    assert.equal(first.roomNumber, room.number)
    r = await post('/checkin', { sessionId: sid, idempotencyKey: key })
    assert.equal((await r.json()).checkinId, first.checkinId)
    const entries = await db.select().from(S.entries).where(eq(S.entries.sessionId, sid))
    assert.equal(entries.length, 1)

    // The front desk was told, once, in the same transaction as the check-in.
    const told = await db.select().from(S.outbox).where(sql`kind = 'hotel.checkin' AND payload->>'sessionId' = ${sid}`)
    assert.equal(told.length, 1)
    assert.equal(told[0].payload.to, '+91 98765 22222')
    assert.equal(told[0].payload.template.params.guest, 'Rahul Sharma')

    // Guest WhatsApp (stay screen): only where this server sends WhatsApp.
    const stayCall = (path, b) => post(path, { sessionId: sid, ...b })
    assert.equal((await stayCall('/stay/whatsapp', { phone: '+91 90000 11111' })).status, 409)
    config.OUTBOX_SENDER = 'kapso'
    try {
      assert.equal((await stayCall('/stay/whatsapp', { phone: '+91 90000 11111' })).status, 200)
      assert.equal((await stayCall('/stay/whatsapp', { phone: '+91 90000 11111' })).status, 200)
      const welcomes = await db.select().from(S.outbox).where(sql`kind = 'hotel.welcome' AND payload->>'sessionId' = ${sid}`)
      assert.equal(welcomes.length, 1) // asking twice sends once
      // Only a confirmation and a button: the Wi-Fi details go as a plain reply to the tap.
      assert.equal(welcomes[0].payload.template.name, 'hotel_checkin_confirmed')
      assert.deepEqual(welcomes[0].payload.template.buttons, [`stay:${sid}`])

      assert.equal((await stayCall('/stay/request', { service: 'laundry' })).status, 404) // not offered here
      assert.equal((await stayCall('/stay/request', { service: 'food', note: 'No onions\nplease' })).status, 200)
      const asked = await db.select().from(S.outbox).where(sql`kind = 'service.request' AND payload->>'sessionId' = ${sid}`)
      assert.equal(asked[0].payload.to, '+91 98765 11111')
      assert.equal(asked[0].payload.template.params.note, 'No onions please')
      for (let i = 0; i < 9; i++) await stayCall('/stay/request', { service: 'food' })
      assert.equal((await stayCall('/stay/request', { service: 'food' })).status, 429)

      // The desk gives them a room: the opted-in guest is told, a guest who did not opt in is not.
      const assigned = await app.request(`/staff/checkins/${first.checkinId}/room`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'http://localhost:5173', cookie },
        body: JSON.stringify({ roomIds: [room.id] }),
      })
      assert.equal(assigned.status, 200)
      const ready = await db.select().from(S.outbox).where(sql`kind = 'hotel.room' AND payload->>'sessionId' = ${sid}`)
      assert.equal(ready.length, 1)
      assert.equal(ready[0].payload.to, '+91 90000 11111')
      assert.equal(ready[0].payload.template.params.room, room.number)
    } finally {
      config.OUTBOX_SENDER = undefined
    }

    // Reception number is its own setting.
    assert.equal((await get('/staff/reception').then((r) => r.json())).reception, '+91 98765 22222')

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
