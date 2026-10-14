import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import test from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { config, isRemote } from './config.js'

// Run with: npm test (local Postgres only: npm run db:up && npm run db:migrate)
// Registers its own office venues under unique emails, so it can share a seeded database.

const skip = isRemote() ? 'needs a local database' : false

test('visitor flow: host approval, event check-in, isolation between venues', { skip }, async () => {
  const { app } = await import('./app.js')
  const { db, pool } = await import('./db/client.js')
  const S = await import('./db/schema/index.js')
  const { bindGuest } = await import('./services/sessions.js')

  const call = (method, path, body, cookie) =>
    app.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:5173',
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const json = async (r) => r.json()

  const onboard = async (name) => {
    const r = await call('POST', '/staff/register', {
      account: { name: 'Owner', email: `it-${name.replace(/\W/g, '')}-${Date.now()}@test.dev`, password: 'a-long-password-1' },
      property: { name, kind: 'office', city: 'Guwahati', timezone: 'Asia/Kolkata' },
      hosts: [{ name: 'Reception', phone: '+91 98765 00000' }],
    })
    assert.equal(r.status, 200)
    const cookie = r.headers.get('set-cookie').split(';')[0]
    const { token } = await json(await call('GET', '/staff/checkin-code', null, cookie))
    return { cookie, token }
  }

  try {
    const nest = await onboard('Nest IT')
    const other = await onboard('Other IT')

    // The host given at registration is already on the list.
    const listed = await json(await call('GET', '/staff/hosts', null, nest.cookie))
    assert.deepEqual(listed.hosts.map((h) => h.name), ['Reception'])

    // Hosts and events, as the front desk would set them up.
    const host = await json(await call('POST', '/staff/hosts', { name: 'CEO Office', phone: '+91 98765 43210' }, nest.cookie))
    const noPhone = await json(await call('POST', '/staff/hosts', { name: 'Operations Team' }, nest.cookie))
    const event = await json(await call('POST', '/staff/events', { name: 'Founder Meetup', organizerId: host.id }, nest.cookie))
    const stranger = await json(await call('POST', '/staff/hosts', { name: 'Stranger' }, other.cookie))
    assert.equal((await call('POST', '/staff/events', { name: 'x', organizerId: stranger.id }, nest.cookie)).status, 404)

    const visitor = async (token, name) => {
      const scan = await json(await call('POST', '/sessions/resolve', { token }))
      assert.equal(scan.flow, 'visitor.host_approval')
      const [guest] = await db
        .insert(S.guests)
        .values({ displayName: name, emailHmac: randomBytes(32) })
        .returning()
      await db.transaction((tx) => bindGuest(tx, scan.sessionId, guest.id))
      const step = (values) => call('POST', '/visits/step', { sessionId: scan.sessionId, ...(values ? { values } : {}) })
      return { sid: scan.sessionId, step }
    }

    // Identification is the venue's choice. By default a name and number is enough;
    // a venue that turns Aadhaar on stops accepting it.
    const who = async (token) => {
      const scan = await json(await call('POST', '/sessions/resolve', { token }))
      return { scan, basic: (b) => call('POST', '/identity/basic', { sessionId: scan.sessionId, ...b }) }
    }
    let probe = await who(nest.token)
    assert.equal(probe.scan.identity, 'basic')
    assert.equal((await probe.basic({ name: 'A', phone: '12' })).status, 400)
    const ok = await json(await probe.basic({ name: 'Priya Nair', phone: '98765 43210' }))
    assert.equal(ok.subject.name, 'Priya Nair')
    const [made] = await db.select().from(S.identityVerifications).where(eq(S.identityVerifications.sessionId, probe.scan.sessionId))
    assert.equal(made.method, 'basic')
    assert.equal(made.result, 'passed')
    // The visitor is now a guest on the session, so the flow moves on to its questions.
    const stepped = await json(await call('POST', '/visits/step', { sessionId: probe.scan.sessionId }))
    assert.deepEqual(stepped.step.fields.map((f) => f.key), ['purpose'])

    assert.equal(
      (await call('POST', '/staff/entry-settings', { identity: 'aadhaar' }, nest.cookie)).status,
      200,
    )
    assert.equal((await json(await call('GET', '/staff/entry-settings', null, nest.cookie))).identity, 'aadhaar')
    probe = await who(nest.token)
    assert.equal(probe.scan.identity, 'aadhaar')
    assert.equal((await probe.basic({ name: 'Priya Nair', phone: '98765 43210' })).status, 403)
    // Another venue is untouched by it.
    assert.equal((await json(await call('GET', '/staff/entry-settings', null, other.cookie))).identity, 'basic')
    await call('POST', '/staff/entry-settings', { identity: 'basic' }, nest.cookie)

    // A meeting: asks for purpose, then host, then waits.
    const rahul = await visitor(nest.token, 'Rahul Sharma')
    let v = await json(await rahul.step())
    assert.equal(v.waitingFor, 'details')
    assert.deepEqual(v.step.fields.map((f) => f.key), ['purpose'])
    assert.equal((await rahul.step({ purpose: 'burglary' })).status, 400)
    v = await json(await rahul.step({ purpose: 'meeting' }))
    assert.deepEqual(v.step.fields[0].options.map((o) => o.label), ['CEO Office', 'Operations Team', 'Reception'])
    assert.equal((await rahul.step({ host: stranger.id })).status, 400) // another venue's host
    v = await json(await rahul.step({ host: host.id }))
    assert.equal(v.status, 'waiting')
    assert.equal(v.waitingFor, 'staff')
    assert.equal(v.host, 'CEO Office')

    // The host was told once, with a number to send to; polling does not tell them again.
    await rahul.step()
    await rahul.step()
    const queued = await db.select().from(S.outbox).where(sql`payload->>'sessionId' = ${rahul.sid}`)
    assert.equal(queued.length, 1)
    assert.equal(queued[0].payload.to, '+91 98765 43210')
    assert.match(queued[0].payload.text, /Rahul Sharma/)

    // It shows on the desk; another venue's desk sees nothing and cannot decide.
    const waiting = await json(await call('GET', '/staff/visits/waiting', null, nest.cookie))
    assert.equal(waiting.waiting.length, 1)
    assert.equal(waiting.waiting[0].visitor, 'Rahul Sharma')
    assert.equal((await json(await call('GET', '/staff/visits/waiting', null, other.cookie))).waiting.length, 0)
    assert.equal((await call('POST', `/staff/visits/${rahul.sid}/decision`, { decision: 'confirm' }, other.cookie)).status, 404)

    // Hold keeps them waiting; confirm lets them in and writes the entry.
    await call('POST', `/staff/visits/${rahul.sid}/decision`, { decision: 'hold' }, nest.cookie)
    assert.equal((await json(await rahul.step())).status, 'waiting')
    const confirmed = await json(await call('POST', `/staff/visits/${rahul.sid}/decision`, { decision: 'confirm' }, nest.cookie))
    assert.equal(confirmed.status, 'done')
    assert.equal((await json(await rahul.step())).status, 'done')
    assert.equal((await call('POST', `/staff/visits/${rahul.sid}/decision`, { decision: 'confirm' }, nest.cookie)).status, 409)
    const entries = await db.select().from(S.entries).where(eq(S.entries.sessionId, rahul.sid))
    assert.equal(entries.length, 1)

    // A decline ends a visit for good.
    const meera = await visitor(nest.token, 'Meera Das')
    await meera.step({ purpose: 'office' })
    await meera.step({ host: noPhone.id })
    await call('POST', `/staff/visits/${meera.sid}/decision`, { decision: 'decline' }, nest.cookie)
    v = await json(await meera.step())
    assert.equal(v.status, 'rejected')
    assert.equal(v.reason, 'declined')
    // A host with no number gets no message, and the visit still waited and ended cleanly.
    assert.equal((await db.select().from(S.outbox).where(sql`payload->>'sessionId' = ${meera.sid}`)).length, 0)

    // A host answers from WhatsApp instead of the dashboard (Kapso webhook).
    config.KAPSO_WEBHOOK_SECRET = 'test-secret'
    const kiran = await visitor(nest.token, 'Kiran Das')
    await kiran.step({ purpose: 'meeting' })
    await kiran.step({ host: host.id })
    const tap = (payload, from, { sign = true } = {}) => {
      const raw = JSON.stringify({
        message: { type: 'button', from, button: { payload, text: 'Confirm' }, kapso: { direction: 'inbound' } },
      })
      const signature = createHmac('sha256', sign ? 'test-secret' : 'other').update(raw).digest('hex')
      return app.request('/webhooks/kapso', {
        method: 'POST',
        headers: { 'x-webhook-signature': signature, 'x-webhook-event': 'whatsapp.message.received' },
        body: raw,
      })
    }
    const confirm = `visit:confirm:${kiran.sid}`
    assert.equal((await tap(confirm, '919876543210', { sign: false })).status, 401)
    // Signed, but from a number that is not this visit's host: acknowledged, ignored.
    assert.equal((await tap(confirm, '919000000000')).status, 200)
    assert.equal((await json(await kiran.step())).status, 'waiting')
    // The host's own number: the visit is confirmed, and the trail says who did it.
    assert.equal((await tap(confirm, '919876543210')).status, 200)
    assert.equal((await json(await kiran.step())).status, 'done')
    const [kiranSession] = await db.select().from(S.entrySessions).where(eq(S.entrySessions.id, kiran.sid))
    assert.equal(kiranSession.trail.find((t) => t.step === 'staff_approves' && t.outcome === 'next').by, `host:${host.id}`)
    // Tapping again changes nothing and is not an error.
    assert.equal((await tap(confirm, '919876543210')).status, 200)

    // An event: straight in, organiser told afterwards.
    const arjun = await visitor(nest.token, 'Arjun Bora')
    await arjun.step({ purpose: 'event' })
    v = await json(await arjun.step({ event: event.id, company: 'Acme', designation: 'Founder' }))
    assert.equal(v.status, 'done')
    assert.equal(v.event, 'Founder Meetup')
    const told = await db.select().from(S.outbox).where(sql`payload->>'sessionId' = ${arjun.sid}`)
    assert.equal(told.length, 1)
    assert.match(told[0].payload.text, /Acme/)

    // The desk's numbers.
    const day = await json(await call('GET', '/staff/visits/arrivals', null, nest.cookie))
    assert.deepEqual(day.counts, { arrivals: 3, waiting: 0, events: 1 })
    assert.deepEqual(day.rows.map((r) => r.status).sort(), ['Checked in', 'Confirmed', 'Confirmed'])
  } finally {
    await pool.end()
  }
})
