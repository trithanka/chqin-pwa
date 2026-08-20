import assert from 'node:assert/strict'
import test from 'node:test'
import { planRooms } from './rooms.js'

// Run with: node --test apps/dashboard/src

test('a range lists every door number in it', () => {
  const { error, numbers } = planRooms({ from: '305', to: '308' })
  assert.equal(error, null)
  assert.deepEqual(numbers, ['305', '306', '307', '308'])
})

test('one room is a range of one', () => {
  assert.deepEqual(planRooms({ from: '412', to: '412' }).numbers, ['412'])
})

test('an incomplete range is not an error, just nothing yet', () => {
  assert.deepEqual(planRooms({ from: '305', to: '' }), { error: null, numbers: [] })
})

test('a backwards range is refused rather than silently empty', () => {
  const { error, numbers } = planRooms({ from: '365', to: '305' })
  assert.match(error, /same or higher/)
  assert.deepEqual(numbers, [])
})

test('non-numeric input is refused', () => {
  assert.match(planRooms({ from: '3a', to: '9' }).error, /whole numbers/)
})

test('an oversized batch is refused instead of creating 4000 rooms', () => {
  assert.match(planRooms({ from: '1', to: '5000' }).error, /over 200/)
})
