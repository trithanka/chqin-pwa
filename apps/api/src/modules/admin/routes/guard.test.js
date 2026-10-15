import assert from 'node:assert/strict'
import test from 'node:test'
import { config } from '../../../config.js'
import { ipGate } from './guard.js'

// Run with: node --test apps/api/src/modules/admin/routes/guard.test.js

const context = (ip) => ({
  req: { header: (name) => (name === 'x-test-ip' ? ip : undefined) },
  json: (body, status) => ({ body, status }),
})

// Runs the gate with the given list; returns 'next' or the refusal status.
async function through(list, { ip, production = true, header = 'x-test-ip' } = {}) {
  const was = { list: config.ADMIN_IP_ALLOWLIST, header: config.ADMIN_CLIENT_IP_HEADER, env: process.env.NODE_ENV }
  config.ADMIN_IP_ALLOWLIST = list
  config.ADMIN_CLIENT_IP_HEADER = header
  process.env.NODE_ENV = production ? 'production' : 'test'
  try {
    let reached = false
    const refused = await ipGate(context(ip), async () => {
      reached = true
    })
    return reached ? 'next' : refused.status
  } finally {
    config.ADMIN_IP_ALLOWLIST = was.list
    config.ADMIN_CLIENT_IP_HEADER = was.header
    process.env.NODE_ENV = was.env
  }
}

test('in production an empty list shuts /admin: it fails closed', async () => {
  assert.equal(await through([], { ip: '203.0.113.5' }), 404)
})

test('with addresses listed and no "*", an address outside the list gets a 404', async () => {
  // (The list itself is read once at boot, so this checks the refusal, not the match.)
  assert.equal(await through(['203.0.113.0/24'], { ip: '198.51.100.9' }), 404)
  assert.equal(await through(['203.0.113.0/24'], { ip: undefined }), 404)
})

test('"*" opens /admin to any address, but only when it is set on purpose', async () => {
  assert.equal(await through(['*'], { ip: '198.51.100.9' }), 'next')
  assert.equal(await through(['*'], { ip: undefined }), 'next')
  // Mixed with addresses it still means open: the switch wins.
  assert.equal(await through(['203.0.113.5', '*'], { ip: '198.51.100.9' }), 'next')
})
