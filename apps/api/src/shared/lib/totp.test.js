import assert from 'node:assert/strict'
import test from 'node:test'
import { codeAt, fromBase32, newSecret, toBase32, verifyCode } from './totp.js'

// RFC 6238 appendix B, SHA-1 rows: secret "12345678901234567890", eight digits.
const secret = toBase32(Buffer.from('12345678901234567890'))

test('matches the RFC 6238 SHA-1 vectors', () => {
  for (const [seconds, expected] of [
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ]) {
    assert.equal(codeAt(secret, Math.floor(seconds / 30), 8), expected)
  }
})

test('base32 round trips', () => {
  const raw = Buffer.from('any bytes at all \x00\xff')
  assert.deepEqual(fromBase32(toBase32(raw)), raw)
  assert.equal(fromBase32(newSecret()).length, 20)
})

test('accepts one step of drift and refuses replay', () => {
  const now = 1_700_000_000_000
  const step = Math.floor(now / 30_000)
  const code = codeAt(secret, step)

  assert.equal(verifyCode(secret, code, { now }), step)
  assert.equal(verifyCode(secret, codeAt(secret, step - 1), { now }), step - 1)
  assert.equal(verifyCode(secret, codeAt(secret, step - 2), { now }), null)
  // Used once: the same step is never accepted again.
  assert.equal(verifyCode(secret, code, { now, lastStep: step }), null)
  assert.equal(verifyCode(secret, '12345', { now }), null)
  assert.equal(verifyCode(secret, 'abcdef', { now }), null)
})
