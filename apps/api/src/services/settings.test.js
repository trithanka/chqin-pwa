import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSettings } from './staff.js'
import { stayFrom } from './stay.js'

// Run with: node --test apps/api/src/services/settings.test.js

const EXISTING = {
  business: { gstin: '18ABCDE1234F1Z5', legalName: 'Palacio Hospitality', verified: false },
  services: ['food', 'water'],
  contacts: { food: '+91 98765 43210', water: '+91 98765 43211' },
  essentials: { wifiSsid: 'HotelPalacio_Guest', checkoutTime: '11:00' },
}

test('saving settings leaves the business registration alone', () => {
  // The column is shared. A screen that only edits services must not be able
  // to delete the GSTIN, and nothing on the guest side would reveal that it had.
  const merged = mergeSettings(EXISTING, { services: ['spa'], essentials: {}, contacts: { spa: '+91 90000 00000' } })

  assert.deepEqual(merged.business, EXISTING.business)
})

test('a number for a service that was switched off is not kept', () => {
  const merged = mergeSettings(EXISTING, {
    services: ['food'],
    essentials: {},
    contacts: { food: '+91 98765 43210', water: '+91 98765 43211' },
  })

  assert.deepEqual(merged.contacts, { food: '+91 98765 43210' })
  // And the guest sees exactly what was left on.
  assert.deepEqual(stayFrom(merged).services, [{ key: 'food', contact: '+91 98765 43210' }])
})

test('a service switched on with a blank number is not routed', () => {
  const merged = mergeSettings(EXISTING, {
    services: ['food', 'spa'],
    essentials: {},
    contacts: { food: '+91 98765 43210', spa: '' },
  })

  assert.equal(merged.contacts.spa, undefined)
})
