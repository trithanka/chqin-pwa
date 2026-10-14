import assert from 'node:assert/strict'
import test from 'node:test'
import { diff } from './audit.js'
import { maskAadhaar, maskEmail, maskPhone, pageOf, pageParams } from './util.js'

test('masking shows enough to recognise, not enough to use', () => {
  assert.equal(maskEmail('trithanka@gmail.com'), 't•••@g•••.com')
  assert.equal(maskEmail('a@b.co.in'), 'a•••@b•••.co.in')
  assert.equal(maskEmail(null), null)
  assert.equal(maskPhone('+91 98765 43210'), '+91 98••• ••210')
  assert.equal(maskPhone('9876543210'), '98••• ••210')
  assert.equal(maskPhone('12'), '••••')
  assert.equal(maskAadhaar('4082'), 'XXXX XXXX 4082')
  assert.equal(maskAadhaar(null), null)
})

test('the audit diff keeps only what changed', () => {
  assert.deepEqual(diff({ name: 'A', kind: 'office', address: { city: 'X' } }, { name: 'B', kind: 'office', address: { city: 'X' } }), {
    name: { before: 'A', after: 'B' },
  })
  assert.deepEqual(diff({ a: 1 }, { a: 1, b: 2 }), { b: { before: null, after: 2 } })
  assert.deepEqual(diff(undefined, undefined), {})
})

test('paging takes a uuid cursor and caps the limit', () => {
  assert.deepEqual(pageParams({}), { limit: 50, cursor: null })
  assert.equal(pageParams({ limit: '9999' }).limit, 200)
  assert.throws(() => pageParams({ cursor: "1' OR 1=1" }), /cursor/)
  const rows = [{ id: 'c' }, { id: 'b' }, { id: 'a' }]
  assert.deepEqual(pageOf(rows, 2), { items: [{ id: 'c' }, { id: 'b' }], next: 'b' })
  assert.deepEqual(pageOf(rows, 3), { items: rows, next: null })
})
