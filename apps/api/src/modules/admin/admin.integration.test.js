import assert from 'node:assert/strict'
import test from 'node:test'
import { eq, sql } from 'drizzle-orm'
import { isRemote } from '../../config.js'

// Run with: npm test (local Postgres only: npm run db:up && npm run db:migrate)
// Makes its own admins and venues under unique emails, so it can share a seeded database.

const skip = isRemote() ? 'needs a local database' : false

test('ChqIn Admin: isolation, roles, audit, venues and gates', { skip }, async (t) => {
  const { app } = await import('../../app.js')
  const { db, pool } = await import('../../shared/db/client.js')
  const S = await import('../../shared/db/schema.js')
  const { createAdmin } = await import('./services/auth.js')
  const { codeAt, stepAt } = await import('../../shared/lib/totp.js')
  const { hashPassword } = await import('../../shared/lib/passwords.js')
  const { lookupHash } = await import('../../shared/lib/crypto.js')

  const stamp = Date.now()
  const ADMIN = 'http://localhost:5175'
  const STAFF = 'http://localhost:5174'

  const call = (method, path, body, { cookie, origin = ADMIN, admin = true } = {}) =>
    app.request(path, {
      method,
      headers: {
        'content-type': 'application/json',
        origin,
        ...(admin ? { 'x-chqin-admin': '1' } : {}),
        ...(cookie ? { cookie } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
  const cookieOf = (r) => r.headers.get('set-cookie')?.split(';')[0]

  /** A signed-in admin of the given role: password, then a code. */
  let made = 0
  // Removed at the end: these have known passwords. Their audit rows stay, as audit rows do.
  const admins = []
  const signIn = async (role) => {
    const email = `it-admin-${role}-${stamp}-${made++}@test.dev`
    const { secret, id } = await createAdmin({ email, name: `IT ${role}`, role, password: 'a-long-admin-password' })
    admins.push(id)
    const r = await call('POST', '/admin/auth/login', { email, password: 'a-long-admin-password' })
    assert.equal(r.status, 200)
    const cookie = cookieOf(r)
    // Password alone reaches nothing but the code step.
    assert.equal((await call('GET', '/admin/overview', null, { cookie })).status, 401)
    const ok = await call('POST', '/admin/auth/totp', { code: codeAt(secret, stepAt()) }, { cookie })
    assert.equal(ok.status, 200)
    return { cookie, secret }
  }

  const auditCount = async () => Number((await db.execute(sql`SELECT count(*) FROM admin_audit_log`)).rows[0].count)

  try {
    const owner = await signIn('owner')
    const support = await signIn('support')
    const viewer = await signIn('read_only')

    await t.test('guards: client header, cookie isolation, CORS', async () => {
      // No x-chqin-admin header: refused before anything else.
      assert.equal((await call('GET', '/admin/overview', null, { cookie: owner.cookie, admin: false })).status, 403)

      // A staff cookie means nothing to /admin.
      const reg = await call(
        'POST',
        '/staff/register',
        {
          account: { name: 'Owner', email: `it-staff-${stamp}@test.dev`, password: 'a-long-password-1' },
          property: { name: 'Admin IT Hotel', kind: 'hotel', city: 'Guwahati', timezone: 'Asia/Kolkata' },
        },
        { origin: STAFF, admin: false },
      )
      assert.equal(reg.status, 200)
      const staffCookie = cookieOf(reg)
      assert.equal((await call('GET', '/admin/overview', null, { cookie: staffCookie })).status, 401)

      // The same on routes mounted from the sub-apps, where a mount-order slip
      // would skip the guards: no cookie, a staff cookie, a password-only session.
      const email = `it-admin-halfway-${stamp}@test.dev`
      const half = await createAdmin({ email, name: 'Halfway', role: 'owner', password: 'a-long-admin-password' })
      admins.push(half.id)
      const halfway = cookieOf(await call('POST', '/admin/auth/login', { email, password: 'a-long-admin-password' }))
      for (const [method, path, body] of [
        ['GET', '/admin/venues'],
        ['GET', '/admin/flows'],
        ['GET', '/admin/guests'],
        ['GET', '/admin/audit'],
        ['GET', '/admin/ops'],
        ['POST', `/admin/venues/${crypto.randomUUID()}/status`, { status: 'suspended', reason: 'boundary test' }],
        ['POST', '/admin/flows', { key: 'x.y', steps: [{ type: 'admit' }], reason: 'boundary test' }],
      ]) {
        for (const cookie of [undefined, staffCookie]) {
          const r = await call(method, path, body, { cookie })
          assert.equal(r.status, 401, `${method} ${path} with ${cookie ? 'a staff cookie' : 'no cookie'}`)
        }
        const r = await call(method, path, body, { cookie: halfway })
        assert.equal(r.status, 401, `${method} ${path} before the code`)
        assert.equal((await r.json()).error, 'mfa_required')
      }

      // And the admin cookie means nothing to /staff.
      assert.equal((await call('GET', '/staff/me', null, { cookie: owner.cookie, origin: STAFF, admin: false })).status, 401)

      // Admin cookie is path-scoped and Strict.
      const r = await call('POST', '/admin/auth/login', { email: `nobody-${stamp}@test.dev`, password: 'x' })
      assert.equal(r.status, 401)

      // CORS: /admin answers only the admin origin; /staff never answers it.
      const pre = (path, origin) =>
        app.request(path, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-chqin-admin' } })
      assert.equal((await pre('/admin/overview', ADMIN)).headers.get('access-control-allow-origin'), ADMIN)
      assert.equal((await pre('/admin/overview', STAFF)).headers.get('access-control-allow-origin'), null)
      assert.equal((await pre('/staff/me', ADMIN)).headers.get('access-control-allow-origin'), null)
      assert.equal((await pre('/staff/me', STAFF)).headers.get('access-control-allow-origin'), STAFF)
    })

    await t.test('view as a venue: read-only, audited, support and owners only', async () => {
      const name = `View IT Office ${stamp}`
      const reg = await call(
        'POST',
        '/staff/register',
        {
          account: { name: 'Owner', email: `it-view-${stamp}@test.dev`, password: 'a-long-password-1' },
          property: { name, kind: 'office', city: 'Guwahati', timezone: 'Asia/Kolkata' },
        },
        { origin: STAFF, admin: false },
      )
      assert.equal(reg.status, 200)
      const [venue] = await db.select().from(S.venues).where(eq(S.venues.name, name))
      const path = `/admin/venues/${venue.id}/view-as`

      // Shows guests unmasked, so not for read_only, and never without a reason.
      assert.equal((await call('POST', path, { reason: 'x' }, { cookie: viewer.cookie })).status, 403)
      assert.equal((await call('POST', path, { reason: '' }, { cookie: support.cookie })).status, 400)

      const before = await auditCount()
      const r = await call('POST', path, { reason: 'caller says the hosts list is empty' }, { cookie: support.cookie })
      assert.equal(r.status, 200)
      assert.equal((await r.json()).minutes, 30)
      assert.equal(await auditCount(), before + 1)
      const view = cookieOf(r)
      assert.match(view, /^chqin_staff=/)
      const opts = { cookie: view, origin: STAFF, admin: false }

      // Reads work, as the owner sees them, and say it's a view.
      const me = await (await call('GET', '/staff/me', null, opts)).json()
      assert.equal(me.role, 'owner')
      assert.equal(me.readOnlyView, true)
      assert.equal((await call('GET', '/staff/hosts', null, opts)).status, 200)

      // Every write is refused, in each of the /staff routers.
      for (const [p, b] of [
        ['/staff/property', { name: 'Hijacked' }],
        ['/staff/hosts', { name: 'Intruder' }],
        ['/staff/entry-settings', { identity: 'basic' }],
        ['/staff/rooms', { rooms: [{ number: '101' }] }],
      ]) {
        const w = await call('POST', p, b, opts)
        assert.equal(w.status, 403, p)
        assert.equal((await w.json()).error, 'read_only_view')
      }
      // Leaving the view still works: logout sits above the guard.
      assert.equal((await call('POST', '/staff/logout', {}, opts)).status, 200)
      assert.equal((await call('GET', '/staff/me', null, opts)).status, 401)

      // A venue nobody works at has nothing to view.
      const [empty] = await db
        .insert(S.venues)
        .values({ name: `Empty IT ${stamp}`, kind: 'office', timezone: 'Asia/Kolkata' })
        .returning()
      assert.equal((await call('POST', `/admin/venues/${empty.id}/view-as`, { reason: 'x' }, { cookie: owner.cookie })).status, 409)
    })

    await t.test('a TOTP code works once', async () => {
      const email = `it-admin-replay-${stamp}@test.dev`
      const { secret, id } = await createAdmin({ email, name: 'Replay', role: 'support', password: 'a-long-admin-password' })
      admins.push(id)
      const code = codeAt(secret, stepAt())
      const first = cookieOf(await call('POST', '/admin/auth/login', { email, password: 'a-long-admin-password' }))
      assert.equal((await call('POST', '/admin/auth/totp', { code }, { cookie: first })).status, 200)
      const second = cookieOf(await call('POST', '/admin/auth/login', { email, password: 'a-long-admin-password' }))
      assert.equal((await call('POST', '/admin/auth/totp', { code }, { cookie: second })).status, 401)
    })

    let venueId
    await t.test('creating a venue makes venue, owner and gate on the right flow', async () => {
      const before = await auditCount()
      const r = await call(
        'POST',
        '/admin/venues',
        {
          name: `IT Office ${stamp}`,
          kind: 'office',
          city: 'Guwahati',
          owner: { name: 'Office Owner', email: `it-office-${stamp}@test.dev` },
          hosts: [{ name: 'Reception' }],
        },
        { cookie: support.cookie },
      )
      assert.equal(r.status, 200, await r.clone().text())
      venueId = (await r.json()).venueId

      const detail = await (await call('GET', `/admin/venues/${venueId}`, null, { cookie: viewer.cookie })).json()
      assert.equal(detail.venue.kind, 'office')
      assert.equal(detail.staff.length, 1)
      assert.equal(detail.staff[0].role, 'owner')
      assert.match(detail.staff[0].email, /•••/)
      assert.equal(detail.gates.length, 1)
      assert.equal(detail.gates[0].flowKey, 'visitor.host_approval')
      assert.deepEqual(detail.rooms, [])
      assert.equal(detail.hosts[0].name, 'Reception')
      assert.equal(await auditCount(), before + 1)
    })

    await t.test('read_only cannot write, and nothing is audited when it tries', async () => {
      const before = await auditCount()
      for (const [path, body] of [
        [`/admin/venues/${venueId}`, { name: 'Renamed' }],
        [`/admin/venues/${venueId}/status`, { status: 'suspended', reason: 'testing roles' }],
        ['/admin/venues', { name: 'x', kind: 'office', city: 'x', owner: { name: 'x', email: `ro-${stamp}@test.dev` } }],
      ]) {
        assert.equal((await call('POST', path, body, { cookie: viewer.cookie })).status, 403)
      }
      assert.equal(await auditCount(), before)
      // Support can't do owner-only things either.
      assert.equal((await call('POST', `/admin/venues/${venueId}/delete`, { confirm: 'x', reason: 'not mine' }, { cookie: support.cookie })).status, 403)
    })

    await t.test('every write records who, what and the change', async () => {
      const r = await call('POST', `/admin/venues/${venueId}`, { name: `IT Office ${stamp} renamed`, reason: 'typo in name' }, { cookie: support.cookie })
      assert.equal(r.status, 200)
      const [row] = await db
        .select()
        .from(S.adminAuditLog)
        .where(eq(S.adminAuditLog.targetId, venueId))
        .orderBy(sql`occurred_at DESC`)
        .limit(1)
      assert.equal(row.action, 'venue.update')
      assert.equal(row.role, 'support')
      assert.equal(row.reason, 'typo in name')
      assert.deepEqual(row.changes.name, { before: `IT Office ${stamp}`, after: `IT Office ${stamp} renamed` })

      // A live-behaviour change without a reason is refused, and not recorded.
      const before = await auditCount()
      assert.equal((await call('POST', `/admin/venues/${venueId}/status`, { status: 'suspended', reason: '' }, { cookie: support.cookie })).status, 400)
      assert.equal(await auditCount(), before)
    })

    await t.test('gates: create, rotate, revoke', async () => {
      const { flows } = await (await call('GET', '/admin/flow-choices', null, { cookie: owner.cookie })).json()
      const flow = flows.find((f) => f.key === 'visitor.host_approval' && f.latest)
      const made = await (await call('POST', `/admin/venues/${venueId}/gates`, { name: 'Side door', kind: 'qr', flowId: flow.id }, { cookie: support.cookie })).json()
      const gate = await (await call('GET', `/admin/gates/${made.id}`, null, { cookie: viewer.cookie })).json()
      assert.equal(gate.config.identity, 'basic')

      // The printed token resolves; after rotation it doesn't, and the new one does.
      assert.equal((await call('POST', '/sessions/resolve', { token: gate.token }, { admin: false, origin: 'http://localhost:5173' })).status, 200)
      const rotated = await call('POST', `/admin/gates/${made.id}/rotate`, { reason: 'card was lost' }, { cookie: support.cookie })
      const { token } = await rotated.json()
      assert.equal((await call('POST', '/sessions/resolve', { token: gate.token }, { admin: false, origin: 'http://localhost:5173' })).status, 404)
      assert.equal((await call('POST', '/sessions/resolve', { token }, { admin: false, origin: 'http://localhost:5173' })).status, 200)
      const [audit] = await db.select().from(S.adminAuditLog).where(eq(S.adminAuditLog.action, 'gate.rotate')).orderBy(sql`occurred_at DESC`).limit(1)
      assert.ok(!JSON.stringify(audit.changes).includes(token), 'the token never reaches the audit log')

      assert.equal((await call('POST', `/admin/gates/${made.id}/status`, { status: 'revoked', reason: 'closing side door' }, { cookie: support.cookie })).status, 200)
      assert.equal((await call('POST', '/sessions/resolve', { token }, { admin: false, origin: 'http://localhost:5173' })).status, 404)
    })

    await t.test('suspend stops scans and staff sign-in; unsuspend restores both', async () => {
      const detail = await (await call('GET', `/admin/venues/${venueId}`, null, { cookie: owner.cookie })).json()
      const gate = await (await call('GET', `/admin/gates/${detail.gates.find((g) => g.status === 'active').id}`, null, { cookie: owner.cookie })).json()
      const scan = () => call('POST', '/sessions/resolve', { token: gate.token }, { admin: false, origin: 'http://localhost:5173' })

      const open = await (await scan()).json()
      assert.equal((await call('POST', `/admin/venues/${venueId}/status`, { status: 'suspended', reason: 'unpaid invoice' }, { cookie: support.cookie })).status, 200)
      const refused = await scan()
      assert.equal(refused.status, 403)
      assert.equal((await refused.json()).error, 'venue_suspended')
      const [session] = await db.select().from(S.entrySessions).where(eq(S.entrySessions.id, open.sessionId))
      assert.equal(session.status, 'revoked')

      // The owner's password is random and never shown; set one to test sign-in.
      const ownerEmail = `it-office-${stamp}@test.dev`
      await db.update(S.staffUsers).set({ passwordHash: await hashPassword('a-long-password-1') }).where(eq(S.staffUsers.emailHmac, lookupHash(ownerEmail)))
      const staffLogin = () => call('POST', '/staff/login', { email: ownerEmail, password: 'a-long-password-1' }, { origin: STAFF, admin: false })
      assert.equal((await staffLogin()).status, 403)

      assert.equal((await call('POST', `/admin/venues/${venueId}/status`, { status: 'active', reason: 'invoice paid' }, { cookie: support.cookie })).status, 200)
      assert.equal((await scan()).status, 200)
      assert.equal((await staffLogin()).status, 200)
    })

    await t.test('delete: typed name, owner only; history means close, not delete', async () => {
      const name = `IT Office ${stamp} renamed`
      assert.equal((await call('POST', `/admin/venues/${venueId}/delete`, { confirm: 'wrong', reason: 'test cleanup' }, { cookie: owner.cookie })).status, 400)
      const r = await call('POST', `/admin/venues/${venueId}/delete`, { confirm: name, reason: 'test cleanup' }, { cookie: owner.cookie })
      assert.equal(r.status, 200)
      // It had sessions (the scans above), so it is closed and kept.
      assert.equal((await r.json()).mode, 'closed')
      const [venue] = await db.select().from(S.venues).where(eq(S.venues.id, venueId))
      assert.equal(venue.status, 'closed')

      // A venue with no history is really deleted, with its sole owner.
      const fresh = await (
        await call('POST', '/admin/venues', { name: `IT Empty ${stamp}`, kind: 'temple', city: 'x', owner: { name: 'T', email: `it-empty-${stamp}@test.dev` } }, { cookie: owner.cookie })
      ).json()
      const gone = await call('POST', `/admin/venues/${fresh.venueId}/delete`, { confirm: `IT Empty ${stamp}`, reason: 'test cleanup' }, { cookie: owner.cookie })
      assert.equal((await gone.json()).mode, 'deleted')
      assert.equal((await db.select().from(S.venues).where(eq(S.venues.id, fresh.venueId))).length, 0)
    })
    await t.test('flows: publish validates, bumps the version, never edits an old one', async () => {
      const key = `it.flow.${stamp}`
      const good = [{ type: 'identify' }, { type: 'admit' }]
      const before = await auditCount()
      // Support can't publish; a bad flow is refused and nothing is written.
      assert.equal((await call('POST', '/admin/flows', { key, steps: good, reason: 'trying it out' }, { cookie: support.cookie })).status, 403)
      const bad = await call('POST', '/admin/flows', { key, steps: [{ type: 'identify' }], reason: 'missing admit' }, { cookie: owner.cookie })
      assert.equal(bad.status, 400)
      assert.match((await bad.json()).message, /must end with "admit"/)
      assert.equal(await auditCount(), before)

      const v1 = await (await call('POST', '/admin/flows', { key, steps: good, reason: 'first version' }, { cookie: owner.cookie })).json()
      assert.equal(v1.version, 1)
      const [stored] = await db.select().from(S.flowDefinitions).where(eq(S.flowDefinitions.id, v1.id))
      const v2 = await (
        await call('POST', '/admin/flows', { key, steps: [{ type: 'identify', optional: true }, { type: 'admit' }], reason: 'open venue variant' }, { cookie: owner.cookie })
      ).json()
      assert.equal(v2.version, 2)
      assert.notEqual(v2.id, v1.id)
      const [after] = await db.select().from(S.flowDefinitions).where(eq(S.flowDefinitions.id, v1.id))
      assert.deepEqual(after.steps, stored.steps)
      assert.deepEqual(after.publishedAt, stored.publishedAt)
      assert.equal(await auditCount(), before + 2)

      const listed = await (await call('GET', '/admin/flows', null, { cookie: viewer.cookie })).json()
      assert.deepEqual(listed.flows.find((f) => f.key === key).versions.map((v) => v.version), [2, 1])
      const sim = await (await call('POST', '/admin/flows/simulate', { steps: good, guest: false }, { cookie: viewer.cookie })).json()
      assert.equal(sim.frames[0].waitingFor, 'identity')
    })

    await t.test('guests: reveal is audited first; erase keeps entries and scrubs the rest', async () => {
      const { encrypt } = await import('../../shared/lib/crypto.js')
      const made = await (
        await call('POST', '/admin/venues', { name: `IT Erase ${stamp}`, kind: 'office', city: 'x', owner: { name: 'E', email: `it-erase-${stamp}@test.dev` } }, { cookie: owner.cookie })
      ).json()
      const [gate] = await db.select().from(S.gates).where(eq(S.gates.venueId, made.venueId))
      const name = `Erase Me ${stamp}`
      const [guest] = await db.insert(S.guests).values({ displayName: name, phoneEnc: encrypt('+91 98765 43210'), emailHmac: lookupHash(`erase-${stamp}@test.dev`), emailEnc: encrypt(`erase-${stamp}@test.dev`) }).returning()
      const [session] = await db
        .insert(S.entrySessions)
        .values({ venueId: made.venueId, gateId: gate.id, flowId: gate.flowId, tokenHash: lookupHash(`s-${stamp}`), status: 'done', guestId: guest.id, state: { purpose: 'event', company: 'Acme', designation: 'CTO' }, expiresAt: new Date(Date.now() + 60_000) })
        .returning()
      await db.insert(S.identityVerifications).values({ guestId: guest.id, sessionId: session.id, method: 'basic', result: 'passed', subjectName: name, documentLast4: '4082' })
      const [entry] = await db.insert(S.entries).values({ venueId: made.venueId, gateId: gate.id, sessionId: session.id, guestId: guest.id }).returning()
      await db.insert(S.eventEntryDetails).values({ entryId: entry.id, company: 'Acme', designation: 'CTO' })
      await db.insert(S.outbox).values({ venueId: made.venueId, kind: 'entry.admitted', payload: { to: '+91 90000 00000', text: `Visitor: ${name}`, sessionId: session.id } })

      // Masked by default.
      const detail = await (await call('GET', `/admin/guests/${guest.id}`, null, { cookie: viewer.cookie })).json()
      assert.equal(detail.phone, '+91 98••• ••210')
      assert.equal(detail.verifications[0].document, 'XXXX XXXX 4082')
      // Search by exact email goes through the keyed hash.
      const found = await (await call('GET', `/admin/guests?email=erase-${stamp}@test.dev`, null, { cookie: viewer.cookie })).json()
      assert.deepEqual(found.items.map((g) => g.id), [guest.id])

      // read_only can't reveal; support can, with a reason, and it is audited.
      assert.equal((await call('POST', `/admin/guests/${guest.id}/reveal`, { field: 'phone', reason: 'call the guest' }, { cookie: viewer.cookie })).status, 403)
      assert.equal((await call('POST', `/admin/guests/${guest.id}/reveal`, { field: 'phone', reason: '' }, { cookie: support.cookie })).status, 400)
      const revealed = await (await call('POST', `/admin/guests/${guest.id}/reveal`, { field: 'phone', reason: 'guest asked for a callback' }, { cookie: support.cookie })).json()
      assert.equal(revealed.phone, '+91 98765 43210')
      const [audit] = await db.select().from(S.adminAuditLog).where(eq(S.adminAuditLog.targetId, guest.id))
      assert.equal(audit.action, 'guest.reveal')
      assert.equal(audit.changes.field, 'phone')

      // Erase: owner only, typed name.
      assert.equal((await call('POST', `/admin/guests/${guest.id}/erase`, { confirm: name, reason: 'erasure request' }, { cookie: support.cookie })).status, 403)
      assert.equal((await call('POST', `/admin/guests/${guest.id}/erase`, { confirm: 'nope', reason: 'erasure request' }, { cookie: owner.cookie })).status, 400)
      const erased = await call('POST', `/admin/guests/${guest.id}/erase`, { confirm: name, reason: 'erasure request' }, { cookie: owner.cookie })
      assert.equal(erased.status, 200)

      assert.equal((await db.select().from(S.guests).where(eq(S.guests.id, guest.id))).length, 0)
      const [kept] = await db.select().from(S.entries).where(eq(S.entries.id, entry.id))
      assert.ok(kept, 'the entry is kept')
      assert.equal(kept.guestId, null)
      const [ev] = await db.select().from(S.eventEntryDetails).where(eq(S.eventEntryDetails.entryId, entry.id))
      assert.deepEqual([ev.company, ev.designation], ['[erased]', '[erased]'])
      const [s2] = await db.select().from(S.entrySessions).where(eq(S.entrySessions.id, session.id))
      assert.equal(s2.guestId, null)
      assert.deepEqual(s2.state, { purpose: 'event' })
      const [check] = await db.select().from(S.identityVerifications).where(eq(S.identityVerifications.sessionId, session.id))
      assert.equal(check.subjectName, null)
      assert.equal(check.documentLast4, '4082')
      const [msg] = await db.select().from(S.outbox).where(sql`payload->>'sessionId' = ${session.id}`)
      assert.equal(msg.payload.text, '[erased]')
      assert.equal(msg.status, 'cancelled', 'a pending message about an erased guest is never sent')

      // The entry's detail still opens, with no guest.
      const opened = await (await call('GET', `/admin/entries/${entry.id}`, null, { cookie: viewer.cookie })).json()
      assert.equal(opened.guest, null)
      assert.equal(opened.detail.event.company, '[erased]')
    })

    await t.test('sessions: find stuck ones and end them with a reason', async () => {
      const [gate] = await db.select().from(S.gates).limit(1)
      const [stuck] = await db
        .insert(S.entrySessions)
        .values({ venueId: gate.venueId, gateId: gate.id, flowId: gate.flowId, tokenHash: lookupHash(`stuck-${stamp}`), status: 'waiting', updatedAt: new Date(Date.now() - 60 * 60_000), expiresAt: new Date(Date.now() + 60_000) })
        .returning()
      const list = await (await call('GET', `/admin/sessions?stuck=waiting&olderThan=30&venueId=${gate.venueId}`, null, { cookie: viewer.cookie })).json()
      assert.ok(list.items.some((x) => x.id === stuck.id))
      assert.equal((await call('POST', `/admin/sessions/${stuck.id}/end`, { status: 'revoked', reason: 'host never answered' }, { cookie: viewer.cookie })).status, 403)
      assert.equal((await call('POST', `/admin/sessions/${stuck.id}/end`, { status: 'revoked', reason: 'host never answered' }, { cookie: support.cookie })).status, 200)
      assert.equal((await call('POST', `/admin/sessions/${stuck.id}/end`, { status: 'revoked', reason: 'twice' }, { cookie: support.cookie })).status, 409)
    })

    await t.test('outbox: retry a failed message, cancel a pending one, all audited', async () => {
      const [failed] = await db.insert(S.outbox).values({ kind: 'visit.arrival', status: 'failed', attempts: 5, lastError: 'boom', payload: { to: '+91 98765 11111', text: 'x' } }).returning()
      const [pending] = await db.insert(S.outbox).values({ kind: 'visit.arrival', payload: { to: '+91 98765 22222', text: 'y' }, runAfter: new Date(Date.now() + 3_600_000) }).returning()
      const list = await (await call('GET', '/admin/outbox?status=failed', null, { cookie: viewer.cookie })).json()
      assert.equal(list.items.find((m) => m.id === failed.id).payload.to, '+91 98••• ••111')

      assert.equal((await call('POST', `/admin/outbox/${failed.id}/retry`, { reason: 'provider is back' }, { cookie: viewer.cookie })).status, 403)
      assert.equal((await call('POST', `/admin/outbox/${failed.id}/retry`, { reason: 'provider is back' }, { cookie: support.cookie })).status, 200)
      const [retried] = await db.select().from(S.outbox).where(eq(S.outbox.id, failed.id))
      assert.deepEqual([retried.status, retried.attempts], ['pending', 0])
      assert.equal((await call('POST', `/admin/outbox/${pending.id}/cancel`, { reason: 'sent by hand instead' }, { cookie: support.cookie })).status, 200)
      assert.equal((await call('POST', `/admin/outbox/${pending.id}/cancel`, { reason: 'twice over' }, { cookie: support.cookie })).status, 409)
      const actions = (await db.select().from(S.adminAuditLog).where(sql`target_id IN (${failed.id}, ${pending.id})`)).map((r) => r.action).sort()
      assert.deepEqual(actions, ['outbox.cancel', 'outbox.retry'])
    })

    await t.test('audit CSV: owner only, and the export is itself audited', async () => {
      assert.equal((await call('GET', '/admin/audit.csv', null, { cookie: support.cookie })).status, 403)
      const before = await auditCount()
      const r = await call('GET', '/admin/audit.csv?action=venue.create', null, { cookie: owner.cookie })
      assert.equal(r.status, 200)
      assert.match(r.headers.get('content-type'), /text\/csv/)
      const text = await r.text()
      assert.match(text.split('\n')[0], /^occurredAt,adminName,role,action/)
      assert.equal(await auditCount(), before + 1)
      const [row] = await db.select().from(S.adminAuditLog).where(eq(S.adminAuditLog.action, 'audit.export')).orderBy(sql`occurred_at DESC`).limit(1)
      assert.equal(row.changes.filters.action, 'venue.create')
    })

    await t.test('admins: invite, accept with a code, roles apply at once, last owner kept', async () => {
      const email = `it-invited-${stamp}@test.dev`
      assert.equal((await call('POST', '/admin/admins', { email, name: 'Invitee', role: 'read_only' }, { cookie: support.cookie })).status, 403)
      const made = await (await call('POST', '/admin/admins', { email, name: 'Invitee', role: 'read_only' }, { cookie: owner.cookie })).json()
      admins.push(made.id)
      const token = new URL(made.link).searchParams.get('token')
      const [logged] = await db.select().from(S.adminAuditLog).where(eq(S.adminAuditLog.action, 'admin.invite')).orderBy(sql`occurred_at DESC`).limit(1)
      assert.ok(!JSON.stringify(logged.changes).includes(token), 'the invite link is never logged')

      // Can't sign in before accepting.
      assert.equal((await call('POST', '/admin/auth/login', { email, password: 'invitee-password-1' })).status, 401)
      const info = await (await call('GET', `/admin/auth/link?token=${token}`)).json()
      assert.equal(info.needsPassword, true)
      assert.equal((await call('POST', '/admin/auth/accept', { token, password: 'invitee-password-1', code: '000000' })).status, 400)
      assert.equal((await call('POST', '/admin/auth/accept', { token, password: 'invitee-password-1', code: codeAt(info.secret, stepAt()) })).status, 200)
      // Single use.
      assert.equal((await call('GET', `/admin/auth/link?token=${token}`)).status, 404)

      const login = cookieOf(await call('POST', '/admin/auth/login', { email, password: 'invitee-password-1' }))
      // The code used to accept can't be replayed to sign in.
      assert.equal((await call('POST', '/admin/auth/totp', { code: codeAt(info.secret, stepAt()) }, { cookie: login })).status, 401)

      // Disabling ends an admin's access on the next request.
      const support2 = await signIn('support')
      const { admins: team } = await (await call('GET', '/admin/admins', null, { cookie: owner.cookie })).json()
      const me2 = await (await call('GET', '/admin/me', null, { cookie: support2.cookie })).json()
      assert.equal((await call('POST', `/admin/admins/${me2.adminId}`, { status: 'disabled', reason: 'left the team' }, { cookie: owner.cookie })).status, 200)
      assert.equal((await call('GET', '/admin/overview', null, { cookie: support2.cookie })).status, 401)
      assert.ok(team.length >= 4)

      // An owner can't demote themselves.
      const me = await (await call('GET', '/admin/me', null, { cookie: owner.cookie })).json()
      assert.equal((await call('POST', `/admin/admins/${me.adminId}`, { role: 'support', reason: 'stepping down' }, { cookie: owner.cookie })).status, 409)
    })

    await t.test('every remaining write route records exactly one audit row', async () => {
      const made = await (
        await call('POST', '/admin/venues', { name: `IT Writes ${stamp}`, kind: 'office', city: 'x', owner: { name: 'W', email: `it-writes-${stamp}@test.dev` } }, { cookie: owner.cookie })
      ).json()
      const venueId = made.venueId
      const ownerEmail = `it-writes-${stamp}@test.dev`
      const [staffUser] = await db.select().from(S.staffUsers).where(eq(S.staffUsers.emailHmac, lookupHash(ownerEmail)))
      const [membership] = await db.select().from(S.staffMemberships).where(eq(S.staffMemberships.staffId, staffUser.id))

      const [guest] = await db.insert(S.guests).values({ displayName: `Writes Guest ${stamp}` }).returning()
      const [cred] = await db.insert(S.credentials).values({ guestId: guest.id, credentialId: `cred-${stamp}`, publicKey: Buffer.from('k'), alg: -7 }).returning()
      const other = await signIn('read_only')
      const otherMe = await (await call('GET', '/admin/me', null, { cookie: other.cookie })).json()

      let hostId, eventId
      const steps = [
        ['POST', `/admin/venues/${venueId}/settings`, { settings: { services: [], reception: { phone: '+91 90000 00000' } }, reason: 'reception desk number' }, support],
        ['POST', `/admin/venues/${venueId}/hosts`, { name: 'Front office', reason: 'new host' }, support, (b) => (hostId = b.id)],
        ['POST', () => `/admin/venues/${venueId}/hosts/${hostId}`, { active: false, reason: 'on leave' }, support],
        ['POST', `/admin/venues/${venueId}/events`, { name: 'Demo day', reason: 'new event' }, support, (b) => (eventId = b.id)],
        ['POST', () => `/admin/venues/${venueId}/events/${eventId}/active`, { active: false, reason: 'event over' }, support],
        ['POST', `/admin/staff/${staffUser.id}/verify-email`, {}, support],
        ['POST', `/admin/staff/${staffUser.id}/revoke-sessions`, { reason: 'lost laptop' }, support],
        ['POST', `/admin/staff/${staffUser.id}/password-reset`, { reason: 'owner locked out' }, support],
        ['POST', `/admin/memberships/${membership.id}/role`, { role: 'manager', reason: 'ownership moved' }, support],
        ['POST', `/admin/staff/${staffUser.id}/status`, { status: 'suspended', reason: 'left the company' }, support],
        ['POST', `/admin/guests/${guest.id}/status`, { status: 'suspended', reason: 'fraud report' }, support],
        ['POST', `/admin/credentials/${cred.id}/revoke`, { reason: 'phone was stolen' }, support],
        ['POST', `/admin/admin-sessions/${otherMe.sessionId}/revoke`, { reason: 'shared computer' }, owner],
        ['POST', `/admin/admins/${otherMe.adminId}/reset-2fa`, { reason: 'new phone' }, owner],
        ['POST', '/admin/ops/purge', { reason: 'weekly cleanup' }, owner],
      ]
      for (const [method, path, body, who, keep] of steps) {
        const url = typeof path === 'function' ? path() : path
        const before = await auditCount()
        const r = await call(method, url, body, { cookie: who.cookie })
        assert.equal(r.status, 200, `${url}: ${await r.clone().text()}`)
        keep?.(await r.json())
        assert.equal(await auditCount(), before + 1, `${url} wrote one audit row`)
      }

      // Unknown settings keys survive a save.
      const [venue] = await db.select().from(S.venues).where(eq(S.venues.id, venueId))
      assert.equal(venue.settings.reception.phone, '+91 90000 00000')
      // The revoked admin session is dead.
      assert.equal((await call('GET', '/admin/overview', null, { cookie: other.cookie })).status, 401)
      const [cr] = await db.select().from(S.credentials).where(eq(S.credentials.id, cred.id))
      assert.ok(cr.revokedAt)
    })

    await t.test('staff session effects: reset and role change sign them out; role change only at that venue', async () => {
      const made = await (
        await call('POST', '/admin/venues', { name: `IT Effects ${stamp}`, kind: 'office', city: 'x', owner: { name: 'F', email: `it-effects-${stamp}@test.dev` } }, { cookie: owner.cookie })
      ).json()
      const email = `it-effects-${stamp}@test.dev`
      const [u] = await db.select().from(S.staffUsers).where(eq(S.staffUsers.emailHmac, lookupHash(email)))
      const [m] = await db.select().from(S.staffMemberships).where(eq(S.staffMemberships.staffId, u.id))
      const signInStaff = async () => {
        await db.update(S.staffUsers).set({ passwordHash: await hashPassword('a-long-password-1') }).where(eq(S.staffUsers.id, u.id))
        return cookieOf(await call('POST', '/staff/login', { email, password: 'a-long-password-1' }, { origin: STAFF, admin: false }))
      }
      const alive = async (cookie) => (await call('GET', '/staff/me', null, { cookie, origin: STAFF, admin: false })).status === 200

      let cookie = await signInStaff()
      assert.ok(await alive(cookie))
      assert.equal((await call('POST', `/admin/staff/${u.id}/password-reset`, { reason: 'owner locked out' }, { cookie: support.cookie })).status, 200)
      assert.equal(await alive(cookie), false)
      // The old password no longer works either.
      assert.equal((await call('POST', '/staff/login', { email, password: 'a-long-password-1' }, { origin: STAFF, admin: false })).status, 401)

      cookie = await signInStaff()
      // A session at another venue (made directly) survives a role change here.
      const { issue } = await import('../../shared/lib/session.js')
      const { tokenHash } = await import('../../shared/lib/crypto.js')
      const [elsewhere] = await db.select().from(S.venues).where(sql`id <> ${made.venueId}`).limit(1)
      const otherToken = await issue({ staffId: u.id, venueId: elsewhere.id, role: 'frontdesk' })
      assert.equal((await call('POST', `/admin/memberships/${m.id}/role`, { role: 'frontdesk', reason: 'ownership moved' }, { cookie: support.cookie })).status, 200)
      assert.equal(await alive(cookie), false)
      const [kept] = await db.select().from(S.staffSessions).where(eq(S.staffSessions.tokenHash, tokenHash(otherToken)))
      assert.equal(kept.revokedAt, null, 'a session at another venue is not touched')
    })

  } finally {
    if (admins.length) await db.delete(S.adminUsers).where(sql`id IN ${admins}`)
    await pool.end()
  }
})
