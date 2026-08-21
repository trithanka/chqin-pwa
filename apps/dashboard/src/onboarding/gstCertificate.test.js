import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGstText } from './gstCertificate.js'

// Run with: node --test apps/dashboard/src/onboarding/gstCertificate.test.js
//
// The text below is the shape pdf.js returns for a REG-06 — same labels, same
// order, values sometimes inline and sometimes on the following line.

const INLINE = `
Government of India
Form GST REG-06
Registration Certificate
Registration Number: 18ABCDE1234F1Z5
Legal Name Palacio Hospitality Private Limited
Trade Name, if any Hotel Palacio
Constitution of Business Private Limited Company
`

const NEXT_LINE = `
Form GST REG-06
1. GSTIN
18ABCDE1234F1Z5
2. Legal Name
Palacio Hospitality Private Limited
3. Trade Name, if any
Hotel Palacio
4. Address
GS Road, Guwahati
`

test('reads gstin, legal name and trade name from an inline layout', () => {
  assert.deepEqual(parseGstText(INLINE), {
    gstin: '18ABCDE1234F1Z5',
    legalName: 'Palacio Hospitality Private Limited',
    tradeName: 'Hotel Palacio',
  })
})

test('reads the same when values sit on the line after the label', () => {
  assert.deepEqual(parseGstText(NEXT_LINE), {
    gstin: '18ABCDE1234F1Z5',
    legalName: 'Palacio Hospitality Private Limited',
    tradeName: 'Hotel Palacio',
  })
})

test('a missing field is null, not a wrong guess', () => {
  const { gstin, legalName } = parseGstText('Legal Name Acme Hotels LLP\nNo number here')
  assert.equal(gstin, null)
  assert.equal(legalName, 'Acme Hotels LLP')
})

test('never returns the label that follows as if it were the value', () => {
  // An empty value slot: the next line is the next label.
  const { legalName } = parseGstText('Legal Name\nTrade Name, if any\nHotel Palacio')
  assert.equal(legalName, null)
})

test('never returns the gstin as a name', () => {
  const { legalName } = parseGstText('Legal Name\n18ABCDE1234F1Z5')
  assert.equal(legalName, null)
})

test('rejects a string that is only shaped like a gstin', () => {
  assert.equal(parseGstText('18ABCDE1234F1Z').gstin, null) // 14 characters
  assert.equal(parseGstText('18ABCDE1234F1Y5').gstin, null) // no literal Z
})
