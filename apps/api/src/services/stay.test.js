import assert from 'node:assert/strict'
import test from 'node:test'
import { stayFrom } from './stay.js'

// Run with: node --test apps/api/src/services/stay.test.js

const SETTINGS = {
  business: { gstin: '18ABCDE1234F1Z5', legalName: 'Palacio Hospitality', verified: false },
  services: ['food', 'water', 'laundry'],
  contacts: { food: '+91 98765 43210', water: '+91 98765 43211' },
  essentials: { wifiSsid: 'HotelPalacio_Guest', wifiPassword: 's3cret', checkoutTime: '11:00' },
}

test('sends only services that have somewhere to route the request', () => {
  // Laundry is switched on but has no number — a tile behind it would be a
  // request that vanishes.
  assert.deepEqual(stayFrom(SETTINGS).services, [
    { key: 'food', contact: '+91 98765 43210' },
    { key: 'water', contact: '+91 98765 43211' },
  ])
})

test('never sends the business registration to a guest', () => {
  const stay = stayFrom(SETTINGS)
  assert.equal(stay.business, undefined)
  assert.equal(JSON.stringify(stay).includes('18ABCDE1234F1Z5'), false)
})

test('passes the essentials a guest asks the desk for', () => {
  const { essentials } = stayFrom(SETTINGS)
  assert.equal(essentials.wifiSsid, 'HotelPalacio_Guest')
  assert.equal(essentials.wifiPassword, 's3cret')
  assert.equal(essentials.checkoutTime, '11:00')
  // Absent rather than empty string, so the client can simply test for it.
  assert.equal(essentials.breakfastFrom, null)
})

test('an unknown service key is dropped rather than rendered', () => {
  const stay = stayFrom({ services: ['food', 'helicopter'], contacts: { food: '+911', helicopter: '+912' } })
  assert.deepEqual(stay.services, [{ key: 'food', contact: '+911' }])
})

test('a property with no settings yet answers with empty, not a crash', () => {
  for (const input of [undefined, null, {}, { services: 'nonsense' }]) {
    const stay = stayFrom(input)
    assert.deepEqual(stay.services, [])
    assert.equal(stay.essentials.wifiSsid, null)
  }
})
