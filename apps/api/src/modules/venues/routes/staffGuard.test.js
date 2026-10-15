import assert from 'node:assert/strict'
import test from 'node:test'
import { app } from '../../../app.js'

// Run with: node --test apps/api/src/routes/staffGuard.test.js
//
// /staff is built from three routers whose order is the authorization boundary:
// the public sign-in routes, then the session guard, then everything private.
// Splitting the file must not have moved a private route above the guard.

const PUBLIC = new Set([
  'POST /staff/register',
  'POST /staff/login',
  'POST /staff/logout',
  'POST /staff/password/forgot',
  'POST /staff/password/reset',
  'POST /staff/email/verify',
])

test('every /staff route except the public ones refuses a request with no session', async () => {
  const seen = new Set()
  for (const r of app.routes) {
    if (!r.path.startsWith('/staff') || r.method === 'ALL') continue
    const key = `${r.method} ${r.path}`
    if (seen.has(key) || PUBLIC.has(key)) continue
    seen.add(key)

    // Params filled with something well-formed; the guard must answer before any lookup.
    const path = r.path.replace(/:\w+/g, '00000000-0000-4000-8000-000000000000')
    const res = await app.request(path, {
      method: r.method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: r.method === 'GET' || r.method === 'DELETE' ? undefined : '{}',
    })
    assert.equal(res.status, 401, `${key} answered ${res.status} without a session`)
  }
  assert.ok(seen.size >= 28, `expected the private staff routes, found ${seen.size}`)
})

test('the public routes really are reachable without a session', async () => {
  for (const key of PUBLIC) {
    const [method, path] = key.split(' ')
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
      body: '{}',
    })
    assert.notEqual(res.status, 401, `${key} should not need a session`)
  }
})
