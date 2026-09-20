import assert from 'node:assert/strict'
import test from 'node:test'
import { parseGstText, panOf } from './gstCertificate.js'

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

// A whole page one, as pdf.js actually returns it: the address labels share a
// line with the wrapped heading that introduces them, and the diagonal
// watermark lands on lines of its own.
const FULL = `
Goods and Services Tax
Government of India
Form GST REG-06
Registration Certificate
Registration Number : 18AAUCM4151D1ZB
1. Legal Name MOODVERSE PRIVATE LIMITED
2. Trade Name, if any Myslotmate
3. Additional trade names, if
any
4. Constitution of Business Private Limited Company
5. Address of Principal Place of
Business Floor No.: 3
Building No./Flat No.: 308
Name Of Premises/Building: Dona Planet
Road/Street: GS Road
Nearby Landmark: ABC
Locality/Sub Locality: Ananda Nagar
City/Town/Village: Guwahati
District: Kamrup Metropolitan
State: Assam
PIN Code: 781005
6. Date of Liability 22/01/2026
7. Period of Validity From 10/03/2026 To Not Applicable
8. Type of Registration Regular
`

test('reads gstin, legal name and trade name from an inline layout', () => {
  const found = parseGstText(INLINE)
  assert.equal(found.gstin, '18ABCDE1234F1Z5')
  assert.equal(found.legalName, 'Palacio Hospitality Private Limited')
  assert.equal(found.tradeName, 'Hotel Palacio')
  assert.equal(found.constitution, 'Private Limited Company')
})

test('reads the same when values sit on the line after the label', () => {
  const found = parseGstText(NEXT_LINE)
  assert.equal(found.gstin, '18ABCDE1234F1Z5')
  assert.equal(found.legalName, 'Palacio Hospitality Private Limited')
  assert.equal(found.tradeName, 'Hotel Palacio')
})

test('reads every field off a whole certificate page', () => {
  assert.deepEqual(parseGstText(FULL), {
    gstin: '18AAUCM4151D1ZB',
    pan: 'AAUCM4151D',
    legalName: 'MOODVERSE PRIVATE LIMITED',
    tradeName: 'Myslotmate',
    constitution: 'Private Limited Company',
    registrationType: 'Regular',
    address: {
      street: '3, 308, Dona Planet, GS Road, ABC, Ananda Nagar',
      city: 'Guwahati',
      district: 'Kamrup Metropolitan',
      state: 'Assam',
      pincode: '781005',
    },
  })
})

test('the pan comes out of the gstin, never guessed from anything else', () => {
  assert.equal(panOf('18AAUCM4151D1ZB'), 'AAUCM4151D')
  assert.equal(panOf(null), null)
  assert.equal(panOf('not a gstin'), null)
  assert.equal(parseGstText('no number here').pan, null)
})

test('a missing field is null, not a wrong guess', () => {
  const { gstin, legalName, address } = parseGstText('Legal Name Acme Hotels LLP\nNo number here')
  assert.equal(gstin, null)
  assert.equal(legalName, 'Acme Hotels LLP')
  assert.deepEqual(address, { street: null, city: null, district: null, state: null, pincode: null })
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
