import { Field, Input, Select, StepHeader } from '../kit'

// Enough to cover the markets a first deployment plausibly touches. The list
// grows when a property outside it signs up, not before.
const TIMEZONES = [
  ['Asia/Kolkata', 'India — IST (UTC+5:30)'],
  ['Asia/Dubai', 'Gulf — GST (UTC+4)'],
  ['Asia/Singapore', 'Singapore — SGT (UTC+8)'],
  ['Europe/London', 'UK — GMT/BST'],
  ['America/New_York', 'US East — ET'],
]

export default function PropertyStep({ data, patch, errors }) {
  const set = (key, value) => patch('property', { ...data.property, [key]: value })

  return (
    <div>
      <StepHeader
        title="Confirm your property"
        body="Guests see the name and city on the welcome screen after they scan."
      />

      <div className="flex flex-col gap-5">
        <Field label="Property name" error={errors.name}>
          <Input
            value={data.property.name}
            invalid={!!errors.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>

        <Field label="City" error={errors.city}>
          <Input
            value={data.property.city}
            invalid={!!errors.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>

        <Field label="Street address" hint="Shown on the check-in confirmation and receipts.">
          <Input
            value={data.property.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Country">
            <Select value={data.property.country} onChange={(e) => set('country', e.target.value)}>
              <option value="IN">India</option>
              <option value="AE">UAE</option>
              <option value="SG">Singapore</option>
              <option value="GB">UK</option>
              <option value="US">US</option>
            </Select>
          </Field>

          <Field label="Time zone">
            <Select value={data.property.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {TIMEZONES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="text-[13px] leading-relaxed text-onb-muted">
          Check-in and check-out cut-offs run on the property's local time, not
          the guest's.
        </p>
      </div>
    </div>
  )
}
