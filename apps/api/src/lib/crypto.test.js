import assert from 'node:assert/strict'
import test from 'node:test'
import { decrypt, encrypt, tokenHash } from './crypto.js'

// Run with: npm test --workspace @chqin/api

test('an encrypted address comes back as itself', () => {
  // Password reset depends on this round trip: only the HMAC was stored
  // before, and an HMAC has nowhere to send a link to.
  const address = 'priya@hotelaurora.com'
  assert.equal(decrypt(encrypt(address)), address)
})

test('the same address encrypts differently every time', () => {
  // A fresh IV per write. Deterministic ciphertext would let anyone holding
  // the table tell which two accounts share an address.
  assert.notDeepEqual(encrypt('priya@hotelaurora.com'), encrypt('priya@hotelaurora.com'))
})

test('a tampered ciphertext decrypts to null, not to something else', () => {
  const buffer = encrypt('priya@hotelaurora.com')
  buffer[buffer.length - 1] ^= 0xff

  // GCM authenticates, so this fails rather than returning a different
  // address — which is the difference between a reset link that goes nowhere
  // and one that goes to an attacker.
  assert.equal(decrypt(buffer), null)
})

test('nothing to decrypt is null, not a throw', () => {
  // Accounts created before addresses were stored have an empty column, and
  // requestPasswordReset treats null as "cannot mail this person".
  assert.equal(decrypt(null), null)
  assert.equal(decrypt(Buffer.alloc(0)), null)
})

test('token lookup is by digest, and the digest is stable', () => {
  // The sessions and links tables store this, never the token itself, so a
  // leaked backup yields nothing usable.
  assert.deepEqual(tokenHash('abc'), tokenHash('abc'))
  assert.notDeepEqual(tokenHash('abc'), tokenHash('abd'))
})
