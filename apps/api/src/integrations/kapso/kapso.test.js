import assert from 'node:assert/strict'
import test from 'node:test'
import { replyFrom } from '../../modules/visitors/hostReply.js'
import { waNumber } from '../../shared/lib/phone.js'

// Run with: node --test apps/api/src/services/whatsapp.test.js

const SID = '01a13587-a895-73c1-8515-35482c6b8622'

test('a bare ten-digit Indian number gets its country code; formatted ones are cleaned', () => {
  assert.equal(waNumber('98765 43210'), '919876543210')
  assert.equal(waNumber('+91 98765 43210'), '919876543210')
  assert.equal(waNumber(null), '')
})

test('a tapped template button and a tapped interactive button both read as a decision', () => {
  const template = { message: { type: 'button', from: '919876543210', button: { payload: `visit:hold:${SID}` } } }
  const interactive = {
    message: { type: 'interactive', from: '919876543210', interactive: { button_reply: { id: `visit:decline:${SID}` } } },
  }
  assert.deepEqual(replyFrom(template), { decision: 'hold', sessionId: SID, from: '919876543210' })
  assert.equal(replyFrom(interactive).decision, 'decline')
})

test('anything else a host sends is not a decision', () => {
  assert.equal(replyFrom({ message: { type: 'text', from: '1', text: { body: 'confirm' } } }), null)
  assert.equal(replyFrom({ message: { type: 'button', button: { payload: 'visit:approve:' + SID } } }), null)
  assert.equal(replyFrom({ message: { type: 'button', button: { payload: 'visit:confirm:not-a-uuid' } } }), null)
  assert.equal(replyFrom({ message: { kapso: { direction: 'outbound' }, button: { payload: `visit:confirm:${SID}` } } }), null)
  assert.equal(replyFrom({}), null)
})

test('a number hidden by WhatsApp falls back to the conversation, then to nothing', () => {
  const hidden = { message: { type: 'button', button: { payload: `visit:confirm:${SID}` } } }
  assert.equal(replyFrom(hidden).from, null)
  assert.equal(replyFrom({ ...hidden, conversation: { phone_number: '919876543210' } }).from, '919876543210')
})

test('the sender posts an approved template with named parameters and one payload per button', async () => {
  const { config } = await import('../../config.js')
  const { kapsoSender } = await import('./sender.js')
  Object.assign(config, { KAPSO_API_KEY: 'key', KAPSO_PHONE_NUMBER_ID: '555', KAPSO_BASE_URL: 'https://kapso.test/v24.0' })

  const calls = []
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => (calls.push({ url, init, body: JSON.parse(init.body) }), new Response('{}'))
  try {
    await kapsoSender({
      payload: {
        to: '+91 98765 43210',
        template: {
          name: 'visitor_arrival',
          params: { visitor: 'Rahul', purpose: 'Meeting', host: 'CEO Office' },
          buttons: [`visit:confirm:${SID}`, `visit:hold:${SID}`, `visit:decline:${SID}`],
        },
      },
    })
    const [{ url, init, body }] = calls
    assert.equal(url, 'https://kapso.test/v24.0/555/messages')
    assert.equal(init.headers['X-API-Key'], 'key')
    assert.equal(body.to, '919876543210')
    assert.equal(body.template.name, 'visitor_arrival')
    const [text, ...buttons] = body.template.components
    assert.deepEqual(text.parameters.map((p) => p.parameter_name), ['visitor', 'purpose', 'host'])
    assert.deepEqual(buttons.map((b) => [b.index, b.parameters[0].payload]), [
      ['0', `visit:confirm:${SID}`],
      ['1', `visit:hold:${SID}`],
      ['2', `visit:decline:${SID}`],
    ])

    // A rejected send throws, so the outbox retries it.
    globalThis.fetch = async () => new Response('template not approved', { status: 400 })
    await assert.rejects(kapsoSender({ payload: { to: '9876543210', template: { name: 'x', params: {}, buttons: [] } } }), /kapso 400/)
  } finally {
    globalThis.fetch = realFetch
  }
})
