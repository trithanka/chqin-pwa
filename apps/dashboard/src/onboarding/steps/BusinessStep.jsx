import { useState } from 'react'
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react'
import { Field, Input, StepHeader, UploadCard } from '../kit'
import { extractGstDetails } from '../gstCertificate'

/**
 * The business behind the property.
 *
 * Attaching the GST certificate reads it: the PDF GSTN issues has a real text
 * layer, so the registration number and legal name come straight out of the
 * file in the browser. The file itself is never uploaded — there is nowhere to
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
      const patched = { ...data.business }
      if (found.gstin) patched.gstin = found.gstin
      // The trade name is what guests know the hotel by; the legal name is
      // what's registered. This field is the registered one.
      if (found.legalName) patched.legalName = found.legalName
      patch('business', patched)

      setScan(found.gstin && found.legalName ? 'filled' : found.gstin || found.legalName ? 'partial' : 'unreadable')
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

        <Field
          label="GSTIN"
          error={errors.gstin}
          hint="Leave blank if the property isn't GST registered."
        >
          <Input
            value={data.business.gstin}
            invalid={!!errors.gstin}
            onChange={(e) => set('gstin', e.target.value.toUpperCase())}
            autoCapitalize="characters"
            spellCheck={false}
          />
        </Field>
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
