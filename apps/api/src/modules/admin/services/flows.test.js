import assert from 'node:assert/strict'
import test from 'node:test'
import { check, simulate, stepLibrary } from './flows.js'

const visitor = [
  { type: 'identify' },
  {
    type: 'collect_details',
    fields: [{ key: 'purpose', kind: 'choice', options: [{ value: 'meeting', label: 'Meeting' }, { value: 'event', label: 'Event' }] }],
  },
  { type: 'collect_details', when: { purpose: 'meeting' }, fields: [{ key: 'host', kind: 'choice', source: 'hosts' }] },
  { type: 'staff_approves', when: { purpose: ['meeting'] } },
  { type: 'admit' },
]

test('publish validation refuses flows the runner could not walk', () => {
  assert.equal(check(visitor).ok, true)
  for (const [steps, message] of [
    [[], /at least one step/],
    [[{ type: 'teleport' }, { type: 'admit' }], /unknown type/],
    [[{ type: 'identify' }], /must end with "admit"/],
    [[{ type: 'admit', when: { a: 'b' } }], /cannot be conditional/],
    [[{ type: 'identify', when: { purpose: { nested: true } } }, { type: 'admit' }], /value or a list of values/],
    [[{ type: 'identify', when: { purpose: [] } }, { type: 'admit' }], /value or a list of values/],
    [[{ type: 'collect_details' }, { type: 'admit' }], /needs a "fields" list/],
    [[{ type: 'collect_details', fields: [{ key: 'a' }, { key: 'a' }] }, { type: 'admit' }], /appears twice/],
    [[{ type: 'collect_details', fields: [{ key: 'a', kind: 'choice' }] }, { type: 'admit' }], /needs "options" or a "source"/],
    [[{ type: 'collect_details', fields: [{ key: 'a', kind: 'date' }] }, { type: 'admit' }], /kind must be/],
  ]) {
    const r = check(steps)
    assert.equal(r.ok, false)
    assert.match(r.error, message)
  }
})

test('the simulator walks a meeting through approval without a database', async () => {
  const { ok, frames } = await simulate({
    steps: visitor,
    inputs: [{ values: { purpose: 'meeting' } }, { values: { host: 'hosts-1' } }, { approval: 'confirm' }],
  })
  assert.equal(ok, true)
  assert.deepEqual(
    frames.map((f) => [f.status, f.waitingFor]),
    [
      ['waiting', 'details'],
      ['waiting', 'details'],
      ['waiting', 'staff'],
      ['done', null],
    ],
  )
  // The form a guest would see, with sample options for a venue-sourced choice.
  assert.deepEqual(frames[1].view.fields[0].options.map((o) => o.value), ['hosts-1', 'hosts-2'])
  assert.deepEqual(frames[2].emits, [{ kind: 'visit.arrival' }])
  assert.equal(frames[3].state.entryId, 'simulated-entry')
})

test('the simulator skips steps whose `when` does not match, and reports refused input', async () => {
  const { frames } = await simulate({ steps: visitor, inputs: [{ values: { purpose: 'nope' } }, { values: { purpose: 'event' } }] })
  assert.match(frames[1].error, /Choose one of/)
  assert.equal(frames[2].status, 'done')
  const declined = await simulate({ steps: visitor, inputs: [{ values: { purpose: 'meeting' } }, { values: { host: 'hosts-2' } }, { approval: 'decline' }] })
  assert.equal(declined.frames.at(-1).status, 'rejected')
})

test('every step in the library documents itself', () => {
  for (const step of stepLibrary()) {
    assert.ok(step.summary && step.summary !== 'Not described yet.', step.type)
    assert.ok(Array.isArray(step.waitsFor) && Array.isArray(step.emits), step.type)
  }
})
