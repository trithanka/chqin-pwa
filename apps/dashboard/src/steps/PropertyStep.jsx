import { Field, Input, Select } from '../components/ui'
import StepHeader from '../components/StepHeader'

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
        eyebrow="Step 2"
        title="Tell us about the property"
        body="Guests see the name and city on the welcome screen after they scan."
      />

      <div className="flex flex-col gap-5">
        <Field label="Property name" required error={errors.name}>
          <Input
            value={data.property.name}
            invalid={!!errors.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Hotel Aurora"
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="City" required error={errors.city}>
            <Input
              value={data.property.city}
              invalid={!!errors.city}
              onChange={(e) => set('city', e.target.value)}
              placeholder="Mumbai"
            />
          </Field>

          <Field label="Country">
            <Select value={data.property.country} onChange={(e) => set('country', e.target.value)}>
              <option value="IN">India</option>
              <option value="AE">United Arab Emirates</option>
              <option value="SG">Singapore</option>
              <option value="GB">United Kingdom</option>
              <option value="US">United States</option>
            </Select>
          </Field>
        </div>

        <Field label="Street address" hint="Shown on the check-in confirmation and receipts.">
          <Input
            value={data.property.address}
            onChange={(e) => set('address', e.target.value)}
            placeholder="Linking Road, Bandra West"
          />
        </Field>

        <Field
          label="Time zone"
          hint="Check-in and check-out cut-offs run on the property's local time, not the guest's."
        >
          <Select value={data.property.timezone} onChange={(e) => set('timezone', e.target.value)}>
            {TIMEZONES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </div>
  )
}
