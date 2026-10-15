import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import { config, isRemote } from '../../config.js'

// Run with: npm test (local Postgres only). The owner login kept in the
// environment, with the second factor switched off.

const skip = isRemote() ? 'needs a local database' : false

test('env admin: signs in with a password alone, follows the variable, and 2FA can be required again', { skip }, async () => {
  const { app } = await import('../../app.js')
  const was = { ...config }
  const email = `env-${randomBytes(4).toString('hex')}@test.dev`
  Object.assign(config, { ADMIN_EMAIL: email, ADMIN_PASSWORD: 'first-password-123', ADMIN_REQUIRE_2FA: false })

  const call = (path, body, cookie) =>
    app.request(path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-chqin-admin': '1', origin: 'http://localhost:5175', ...(cookie ? { cookie } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

  try {
    // Wrong password: the same refusal as ever.
    assert.equal((await call('/admin/auth/login', { email, password: 'nope-nope-nope' })).status, 401)

    // Right password: a complete session, no code asked for.
    const ok = await call('/admin/auth/login', { email, password: 'first-password-123' })
    assert.equal(ok.status, 200)
    assert.equal((await ok.json()).next, 'done')
    const cookie = ok.headers.get('set-cookie').split(';')[0]
    const me = await (await call('/admin/me', null, cookie)).json()
    assert.equal(me.mfa, true)
    assert.equal(me.role, 'owner')
    assert.equal((await call('/admin/overview', null, cookie)).status, 200)

    // Change the variable (a restart): the new password works, the old one stops.
    config.ADMIN_PASSWORD = 'second-password-456'
    assert.equal((await call('/admin/auth/login', { email, password: 'first-password-123' })).status, 401)
    assert.equal((await call('/admin/auth/login', { email, password: 'second-password-456' })).status, 200)

    // Five wrong tries lock the account, as before.
    for (let i = 0; i < 5; i++) await call('/admin/auth/login', { email, password: 'wrong-wrong-wrong' })
    assert.equal((await call('/admin/auth/login', { email, password: 'second-password-456' })).status, 401)

    // With 2FA required again, a password only gets as far as the code step.
    const e2 = `env2-${randomBytes(4).toString('hex')}@test.dev`
    Object.assign(config, { ADMIN_EMAIL: e2, ADMIN_PASSWORD: 'third-password-789', ADMIN_REQUIRE_2FA: true })
    const stepOne = await call('/admin/auth/login', { email: e2, password: 'third-password-789' })
    assert.equal((await stepOne.json()).next, 'totp')
    const partial = stepOne.headers.get('set-cookie').split(';')[0]
    assert.equal((await call('/admin/overview', null, partial)).status, 401)
  } finally {
    Object.assign(config, was)
  }
})
