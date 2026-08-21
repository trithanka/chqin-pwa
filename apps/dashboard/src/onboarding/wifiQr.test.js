import assert from 'node:assert/strict'
import test from 'node:test'
import { parseWifiQr } from './wifiQr.js'

// Run with: node --test apps/dashboard/src/onboarding/wifiQr.test.js

test('reads network and password from a standard payload', () => {
  assert.deepEqual(parseWifiQr('WIFI:T:WPA;S:HotelPalacio_Guest;P:s3cret;H:false;;'), {
    ssid: 'HotelPalacio_Guest',
    password: 's3cret',
    security: 'WPA',
    hidden: false,
  })
})

test('fields may arrive in any order', () => {
  const { ssid, password } = parseWifiQr('WIFI:P:s3cret;S:HotelPalacio_Guest;T:WPA;;')
  assert.equal(ssid, 'HotelPalacio_Guest')
  assert.equal(password, 's3cret')
})

test('an escaped semicolon stays inside the password', () => {
  // The case a naive split on ';' gets wrong, and it is silent when it does.
  const { password } = parseWifiQr('WIFI:T:WPA;S:Lobby;P:pa\\;ss\\:word;;')
  assert.equal(password, 'pa;ss:word')
})

test('an escaped backslash is one backslash', () => {
  assert.equal(parseWifiQr('WIFI:T:WPA;S:Lobby;P:back\\\\slash;;').password, 'back\\slash')
})

test('an open network has an empty password, not a missing one', () => {
  assert.deepEqual(parseWifiQr('WIFI:T:nopass;S:Cafe Free;;'), {
    ssid: 'Cafe Free',
    password: '',
    security: 'NOPASS',
    hidden: false,
  })
})

test('a hidden network is reported as hidden', () => {
  assert.equal(parseWifiQr('WIFI:T:WPA;S:Staff;P:x;H:true;;').hidden, true)
})

test('quoted (hex) values lose their quotes', () => {
  assert.equal(parseWifiQr('WIFI:T:WPA;S:"48656C6C6F";P:x;;').ssid, '48656C6C6F')
})

test('a QR that is not a wifi code is refused', () => {
  // Router labels carry support URLs and serial numbers too.
  assert.equal(parseWifiQr('https://support.example.com/router'), null)
  assert.equal(parseWifiQr('SN:ABC123'), null)
  assert.equal(parseWifiQr(''), null)
  assert.equal(parseWifiQr(null), null)
})

test('a wifi code with no network name is refused rather than half-filled', () => {
  assert.equal(parseWifiQr('WIFI:T:WPA;P:orphan;;'), null)
})
