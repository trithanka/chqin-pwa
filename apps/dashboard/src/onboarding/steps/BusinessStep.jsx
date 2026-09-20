import { useState } from 'react'
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Field, Input, StepHeader, UploadCard } from '../kit'
import { extractGstDetails, panOf } from '../gstCertificate'

/**
 * The business behind the property.
 *
 * Attaching the GST certificate reads it: the PDF GSTN issues has a real text
 * layer, so every field on it — registration number, both names, constitution,
 * the registered address — comes straight out of the file in the browser. The
 * PAN is not printed on the certificate at all; it is carried inside the GSTIN
 * and derived from it. The file itself is never uploaded — there is nowhere to
 * put it yet, and reading it doesn't need one.
 *
 * What is read is put in the fields, not asserted as verified. Nothing here
 * has been checked against the GST registry, so `settings.business.verified`
 * stays false — see services/staff.js.
 */
export default function BusinessStep({ data, patch, errors }) {
  const [file, setFile] = useState(null)
  // idle | reading | filled | partial | unreadable | not-a-pdf
  const [scan, setScan] = useState('idle')

  const set = (key, value) => patch('business', { ...data.business, [key]: value })

  /**
   * A typed GSTIN carries the PAN too, so typing one fills the PAN as well —
   * the upload isn't the only way here. Half a GSTIN yields no PAN, and that
   * doesn't wipe one already read: mid-edit is not a correction.
   */
  const setGstin = (value) => {
    const gstin = value.toUpperCase()
    const pan = panOf(gstin)
    patch('business', { ...data.business, gstin, ...(pan ? { pan } : {}) })
  }

  const attach = async (next) => {
    setFile(next)
    if (!next) {
      setScan('idle')
      return
    }

    // The picker asks for PDFs, but "All files" is one tap away in every OS
    // dialog, so the type is checked rather than assumed. A photo of a printed
    // certificate has no text to read.
    if (next.type !== 'application/pdf') {
      setScan('not-a-pdf')
      return
    }

    setScan('reading')
    try {
      const found = await extractGstDetails(next)

      // The trade name is what guests know the hotel by; the legal name is
      // what's registered. Both are kept — receipts need the registered one.
      const read = {
        gstin: found.gstin,
        pan: found.pan,
        legalName: found.legalName,
        tradeName: found.tradeName,
        constitution: found.constitution,
        registrationType: found.registrationType,
        address: found.address.street,
        city: found.address.city,
        state: found.address.state,
        pincode: found.address.pincode,
      }

      const patched = { ...data.business }
      for (const [key, value] of Object.entries(read)) {
        if (value) patched[key] = value
      }
      patch('business', patched)

      // The property's own street address is optional and often still blank at
      // this point; the registered one is a reasonable start for it. The city
      // isn't touched — the property step already required it.
      if (found.address.street && !data.property.address.trim()) {
        patch('property', { ...data.property, address: found.address.street })
      }

      // A read is "filled" on the two fields the step exists for. The rest is
      // bonus: a certificate with no landmark line isn't a partial read, and
      // saying so would send someone hunting for a field that isn't missing.
      const any = Object.values(read).some(Boolean)
      setScan(!any ? 'unreadable' : found.gstin && found.legalName ? 'filled' : 'partial')
    } catch (err) {
      // Quietly falling back to typing is right for the person; a silent
      // failure with no trace is not right for whoever has to work out why a
      // whole state's certificates stopped parsing.
      console.warn('gst certificate: could not read', err)
      setScan('unreadable')
    }
  }

  return (
    <div>
      <StepHeader
        title="Verify your business"
        body="Attach the PDF from the GST portal and we'll read the details off it."
      />

      <div className="flex flex-col gap-5">
        {/* PDF only, because only a PDF does anything: the file isn't stored
            anywhere, so an attached photo would be a step that looks like it
            worked and changes nothing. */}
        <UploadCard
          label="Attach GST certificate"
          hint="PDF only — a photo or scan can't be read"
          accept="application/pdf"
          file={file}
          onFile={attach}
          status={<ScanStatus state={scan} />}
        />

        <Field label="Registered business name">
          <Input
            value={data.business.legalName}
            onChange={(e) => set('legalName', e.target.value)}
          />
        </Field>

        <Field label="Trade name" hint="What guests know the property by, if it differs.">
          <Input
            value={data.business.tradeName}
            onChange={(e) => set('tradeName', e.target.value)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="GSTIN"
            error={errors.gstin}
            hint="Leave blank if the property isn't GST registered."
          >
            <Input
              value={data.business.gstin}
              invalid={!!errors.gstin}
              onChange={(e) => setGstin(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </Field>

          {/* Characters 3-12 of the GSTIN are the PAN, so this fills itself. */}
          <Field label="PAN" error={errors.pan} hint="Taken from the GSTIN.">
            <Input
              value={data.business.pan}
              invalid={!!errors.pan}
              onChange={(e) => set('pan', e.target.value.toUpperCase())}
              autoCapitalize="characters"
              spellCheck={false}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Constitution of business">
            <Input
              value={data.business.constitution}
              onChange={(e) => set('constitution', e.target.value)}
            />
          </Field>

          <Field label="Type of registration">
            <Input
              value={data.business.registrationType}
              onChange={(e) => set('registrationType', e.target.value)}
            />
          </Field>
        </div>

        <Field
          label="Registered address"
          hint="The principal place of business on the certificate."
        >
          <Input value={data.business.address} onChange={(e) => set('address', e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City">
            <Input value={data.business.city} onChange={(e) => set('city', e.target.value)} />
          </Field>

          <Field label="State">
            <Input value={data.business.state} onChange={(e) => set('state', e.target.value)} />
          </Field>

          <Field label="PIN code">
            <Input
              value={data.business.pincode}
              onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
            />
          </Field>
        </div>
      </div>
    </div>
  )
}

/** What the read found, in one line, in the same words a person would use. */
function ScanStatus({ state }) {
  if (state === 'idle') return null

  const tones = {
    reading: ['text-onb-muted', LoaderCircle, 'Reading the certificate…'],
    filled: ['text-onb-green', Check, 'Read from your certificate. Check it below.'],
    partial: [
      'text-onb-green',
      Check,
      'Read what we could. Fill in anything still blank below.',
    ],
    unreadable: [
      'text-amber-400',
      TriangleAlert,
      "Couldn't read this one — type the details in below.",
    ],
    'not-a-pdf': [
      'text-amber-400',
      TriangleAlert,
      "That isn't a PDF. Only the PDF from the GST portal can be read — or type the details in below.",
    ],
  }

  const [tone, Icon, message] = tones[state]

  return (
    <span className={`flex items-start gap-2 text-[12.5px] leading-relaxed ${tone}`}>
      <Icon
        size={14}
        strokeWidth={2.4}
        className={`mt-0.5 shrink-0 ${state === 'reading' ? 'animate-spin' : ''}`}
      />
      {message}
    </span>
  )
}
