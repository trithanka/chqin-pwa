import { Field, Input, Select } from '../../components/ui'
import PasswordField from '../../components/PasswordField'
import StepHeader from '../../components/StepHeader'
import { MIN_LENGTH } from '../../lib/password'

/**
 * The owner's account, and the password they'll sign in with.
 *
 * The password is set here and nowhere else — no emailed "set your password"
 * round trip for the person who just typed their email two fields ago.
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

        <Field label="Work email" required error={errors.email} hint="This is what you'll sign in with.">
          <Input
            type="email"
            value={data.account.email}
            invalid={!!errors.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="priya@hotelaurora.com"
            autoComplete="email"
          />
        </Field>

        <PasswordField
          label="Password"
          value={data.account.password}
          onChange={(value) => set('password', value)}
          error={errors.password}
          hint={`At least ${MIN_LENGTH} characters. A few words you'll remember beats a short one with symbols.`}
          meter
        />

        <PasswordField
          label="Confirm password"
          value={data.account.confirmPassword}
          onChange={(value) => set('confirmPassword', value)}
          error={errors.confirmPassword}
        />

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
