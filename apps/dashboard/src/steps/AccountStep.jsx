import { Field, Input, Select } from '../components/ui'
import StepHeader from '../components/StepHeader'

/**
 * No password field. Staff will sign in with a passkey or an emailed link —
 * asking for a password here would create a credential the product doesn't
 * want to hold.
 */
export default function AccountStep({ data, patch, errors }) {
  const set = (key, value) => patch('account', { ...data.account, [key]: value })

  return (
    <div>
      <StepHeader
        eyebrow="Step 1"
        title="Create your account"
        body="This is the person who owns the setup. You can invite the rest of the team in a moment."
      />

      <div className="flex flex-col gap-5">
        <Field label="Your name" required error={errors.name}>
          <Input
            value={data.account.name}
            invalid={!!errors.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Priya Nair"
            autoComplete="name"
          />
        </Field>

        <Field
          label="Work email"
          required
          error={errors.email}
          hint="We'll send your sign-in link here. No password to remember."
        >
          <Input
            type="email"
            value={data.account.email}
            invalid={!!errors.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="priya@hotelaurora.com"
            autoComplete="email"
          />
        </Field>

        <Field label="Your role" hint="Sets what you can change. Everyone can run check-ins.">
          <Select value={data.account.role} onChange={(e) => set('role', e.target.value)}>
            <option value="owner">Owner — billing and full access</option>
            <option value="manager">Manager — property settings and staff</option>
            <option value="frontdesk">Front desk — arrivals and check-ins</option>
          </Select>
        </Field>
      </div>
    </div>
  )
}
