import { useState } from 'react'
import { Field, Input, StepHeader, UploadCard } from '../kit'

/**
 * The business behind the property.
 *
 * The design has a GST certificate uploaded and read for you. Nothing reads
 * it yet — there is no upload route and no extraction — so the document is
 * offered, held on the device, and the fields stay typed by the owner. A
 * screen that printed "GSTIN verified ✓" off a file nobody parsed would be
 * lying about the one thing this screen exists to establish.
 */
export default function BusinessStep({ data, patch, errors }) {
  const [file, setFile] = useState(null)
  const set = (key, value) => patch('business', { ...data.business, [key]: value })

  return (
    <div>
      <StepHeader
        title="Verify your business"
        body="Optional today, and needed later for invoicing and statutory reporting."
      />

      <div className="flex flex-col gap-5">
        <UploadCard
          label="Attach GST certificate"
          hint="PDF or photo"
          accept=".pdf,image/*"
          file={file}
          onFile={setFile}
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
