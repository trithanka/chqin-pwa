import assert from 'node:assert/strict'
import test from 'node:test'
import { advance } from './entry.js'
import { validateFlow } from './flows.js'
import { knownStepTypes, next, reject, steps, wait } from './steps.js'

// Run with: node --test apps/api/src/services/entry.test.js

const HOTEL = [{ type: 'identify' }, { type: 'match_booking', optional: true }, { type: 'admit' }]
const fresh = (over = {}) => ({
  status: 'in_progress',
  cursor: 0,
  state: {},
  trail: [],
  guestId: null,
  entitlementId: null,
  ...over,
})
const admits = () => {
  const calls = []
  return { calls, deps: { admit: async (s) => (calls.push(s), { id: 'e1' }) } }
}

test('a guest with nothing to wait for walks straight in, in one pass', async () => {
  const { calls, deps } = admits()
  const out = await advance({ flow: { steps: HOTEL }, session: fresh({ guestId: 'g1' }), deps })
  assert.equal(out.status, 'done')
  assert.equal(calls.length, 1)
  assert.equal(out.state.entryId, 'e1')
  assert.deepEqual(out.trail.map((t) => [t.step, t.outcome]), [
    ['identify', 'next'],
    ['match_booking', 'next'],
    ['admit', 'next'],
  ])
})

test('admit sees the steps that ran before it in the same pass', async () => {
  let seen
  const deps = { admit: async (s) => ((seen = s.trail.map((t) => t.step)), { id: 'e1' }) }
  await advance({ flow: { steps: HOTEL }, session: fresh({ guestId: 'g1' }), deps })
  assert.deepEqual(seen, ['identify', 'match_booking'])
})

test('holds at identify until the guest is known, then resumes where it stopped', async () => {
  const { calls, deps } = admits()
  const first = await advance({ flow: { steps: HOTEL }, session: fresh(), deps })
  assert.equal(first.status, 'waiting')
  assert.equal(first.waitingFor, 'identity')
  assert.equal(first.cursor, 0)
  assert.equal(calls.length, 0)

  const second = await advance({
    flow: { steps: HOTEL },
    session: fresh({ ...first, status: 'waiting', guestId: 'g1' }),
    deps,
  })
  assert.equal(second.status, 'done')
  assert.equal(calls.length, 1)
})

test('polling a waiting session does not grow the trail', async () => {
  const a = await advance({ flow: { steps: HOTEL }, session: fresh() })
  const b = await advance({ flow: { steps: HOTEL }, session: fresh({ ...a, status: 'waiting' }) })
  assert.equal(b.trail.length, 1)
})

test('a step with a non-matching "when" is skipped, a matching one runs', async () => {
  const flow = {
    steps: [
      { type: 'collect' },
      { type: 'approve', when: { purpose: 'meeting' } },
      { type: 'register', when: { purpose: 'event' } },
      { type: 'admit' },
    ],
  }
  const ran = []
  const registry = {
    collect: { run: () => next({ state: { purpose: 'event' } }) },
    approve: { run: () => (ran.push('approve'), wait('staff')) },
    register: { run: () => (ran.push('register'), next()) },
    admit: steps.admit,
  }
  const { deps } = admits()
  const out = await advance({ flow, session: fresh(), deps, registry })
  assert.deepEqual(ran, ['register'])
  assert.equal(out.status, 'done')
})

test('input stops at the first step that takes it, and passes through the ones that do not', async () => {
  const seen = []
  const registry = {
    a: { takesInput: true, run: ({ input }) => (seen.push(['a', input.x]), next()) },
    b: { run: ({ input }) => (seen.push(['b', input.x]), next()) },
    admit: steps.admit,
  }
  const { deps } = admits()
  await advance({ flow: { steps: [{ type: 'a' }, { type: 'b' }, { type: 'admit' }] }, session: fresh(), input: { x: 1 }, deps, registry })
  assert.deepEqual(seen, [['a', 1], ['b', undefined]])
})

test('a rejection ends the session and never admits', async () => {
  const { calls, deps } = admits()
  const registry = { deny: { run: () => reject('permit_expired') }, admit: steps.admit }
  const out = await advance({ flow: { steps: [{ type: 'deny' }, { type: 'admit' }] }, session: fresh(), deps, registry })
  assert.equal(out.status, 'rejected')
  assert.equal(out.reason, 'permit_expired')
  assert.equal(calls.length, 0)
})

test('a finished or expired session is returned as it is and admits nothing', async () => {
  const { calls, deps } = admits()
  const done = await advance({ flow: { steps: HOTEL }, session: fresh({ status: 'done', cursor: 3 }), deps })
  assert.equal(done.status, 'done')
  const old = await advance({
    flow: { steps: HOTEL },
    session: fresh({ guestId: 'g1', expiresAt: new Date(Date.now() - 1000) }),
    deps,
  })
  assert.equal(old.status, 'expired')
  assert.equal(calls.length, 0)
})

test('a step can set the guest and the entitlement on the session', async () => {
  const registry = {
    who: { run: () => next({ session: { guestId: 'g9', entitlementId: 'b9' } }) },
    admit: steps.admit,
  }
  const { calls, deps } = admits()
  const out = await advance({ flow: { steps: [{ type: 'who' }, { type: 'admit' }] }, session: fresh(), deps, registry })
  assert.equal(out.guestId, 'g9')
  assert.equal(calls[0].entitlementId, 'b9')
})

test('open venue: an optional identify lets an anonymous guest in', async () => {
  const { calls, deps } = admits()
  const out = await advance({
    flow: { steps: [{ type: 'identify', optional: true }, { type: 'admit' }] },
    session: fresh(),
    deps,
  })
  assert.equal(out.status, 'done')
  assert.equal(out.guestId, null)
  assert.equal(calls[0].guestId, null)
})

test('validateFlow accepts the hotel flow and rejects what the runner could not walk', () => {
  assert.doesNotThrow(() => validateFlow(HOTEL))
  assert.throws(() => validateFlow([]), /at least one/)
  assert.throws(() => validateFlow([{ type: 'teleport' }, { type: 'admit' }]), /unknown type/)
  assert.throws(() => validateFlow([{ type: 'identify' }]), /end with "admit"/)
  assert.throws(() => validateFlow([{ type: 'identify', when: 'x' }, { type: 'admit' }]), /plain object/)
  assert.throws(() => validateFlow([{ type: 'admit', when: { a: 1 } }]), /cannot be conditional/)
})

test('the flow seeded by migration 0013 is valid', () => {
  assert.doesNotThrow(() =>
    validateFlow([{ type: 'identify' }, { type: 'match_booking', optional: true }, { type: 'admit' }], knownStepTypes),
  )
})

/* ------------------------------------------------------------------ */
/* The visitor flow                                                    */
/* ------------------------------------------------------------------ */

const PURPOSE = {
  key: 'purpose',
  kind: 'choice',
  options: ['meeting', 'office', 'event'],
}
const VISITOR = [
  { type: 'identify' },
  { type: 'collect_details', fields: [PURPOSE] },
  { type: 'collect_details', when: { purpose: ['meeting', 'office'] }, fields: [{ key: 'host', kind: 'choice', source: 'hosts' }] },
  { type: 'staff_approves', when: { purpose: ['meeting', 'office'] } },
  { type: 'collect_details', when: { purpose: 'event' }, fields: [{ key: 'company', kind: 'text' }] },
  { type: 'admit' },
]
const visitorDeps = () => ({
  admit: async () => ({ id: 'e1' }),
  options: async () => [{ value: 'h1', label: 'CEO Office' }],
})
const step = (flow, session, input, deps = visitorDeps()) =>
  advance({ flow: { steps: flow }, session: fresh({ guestId: 'g1', ...session }), input, deps })

test('a "when" list matches any of its values', async () => {
  const out = await step(VISITOR, {}, { values: { purpose: 'office' } })
  assert.equal(out.state.purpose, 'office')
  assert.equal(out.waitingFor, 'details') // on to the host question, not the event one
  assert.equal(out.cursor, 2)
})

test('a meeting asks for a host, then waits for staff and tells the host once', async () => {
  let out = await step(VISITOR, {}, { values: { purpose: 'meeting' } })
  out = await step(VISITOR, out, { values: { host: 'h1' } })
  assert.equal(out.status, 'waiting')
  assert.equal(out.waitingFor, 'staff')
  assert.deepEqual(out.emits, [{ kind: 'visit.arrival' }])

  // The visitor's screen polling must neither grow the trail nor message the host again.
  const poll = await step(VISITOR, { ...out, status: 'waiting' }, {})
  assert.equal(poll.waitingFor, 'staff')
  assert.equal(poll.trail.length, out.trail.length)
  assert.deepEqual(poll.emits, [])
})

test('only a staff decision moves a waiting visitor, and a guest cannot supply one', async () => {
  let out = await step(VISITOR, {}, { values: { purpose: 'meeting' } })
  out = await step(VISITOR, out, { values: { host: 'h1' } })
  const waiting = { ...out, status: 'waiting' }

  // `values` is all a guest can send; an approval smuggled in as a value is just a wrong answer.
  const poke = await step(VISITOR, waiting, { values: { approval: 'confirm' } })
  assert.equal(poke.status, 'waiting')

  const held = await step(VISITOR, waiting, { approval: 'hold', by: 's1' })
  assert.equal(held.status, 'waiting')
  assert.equal(held.state.approval, 'holding')
  assert.equal(held.trail.at(-1).held, true)
  assert.deepEqual(held.emits, [])

  const yes = await step(VISITOR, { ...held, status: 'waiting' }, { approval: 'confirm', by: 's1' })
  assert.equal(yes.status, 'done')
  assert.ok(yes.trail.some((t) => t.step === 'staff_approves' && t.by === 's1'))

  const no = await step(VISITOR, waiting, { approval: 'decline', by: 's1' })
  assert.equal(no.status, 'rejected')
  assert.equal(no.reason, 'declined')
})

test('an event goes straight in, skipping the host, and says so', async () => {
  let out = await step(VISITOR, {}, { values: { purpose: 'event' } })
  out = await step(VISITOR, out, { values: { company: 'Acme' } })
  assert.equal(out.status, 'done')
  assert.deepEqual(out.emits, [{ kind: 'entry.admitted' }])
  assert.equal(out.trail.some((t) => t.step === 'staff_approves'), false)
})

test('a choice outside the offered options is refused, not stored', async () => {
  const bad = step(VISITOR, {}, { values: { purpose: 'burglary' } })
  await assert.rejects(bad, { code: 'invalid_input' })
  const blank = step(VISITOR, {}, { values: { purpose: ' ' } })
  await assert.rejects(blank, { code: 'invalid_input' })

  const out = await step(VISITOR, {}, { values: { purpose: 'meeting' } })
  await assert.rejects(step(VISITOR, out, { values: { host: 'someone-elses-host' } }), {
    code: 'invalid_input',
  })
})

test('the visitor flow published by migration 0014 is valid', async () => {
  const { readFileSync } = await import('node:fs')
  const sql = readFileSync(new URL('../../drizzle/0014_visitor_flow.sql', import.meta.url), 'utf8')
  const json = sql.match(/'(\[\s*\{"type":"identify"[\s\S]*?\])'::jsonb/)[1]
  assert.doesNotThrow(() => validateFlow(JSON.parse(json)))
})
