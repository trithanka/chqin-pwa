import { Field, Input, PasswordInput, Select, StepHeader } from '../kit'
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
        title="Who will manage ChqIn?"
        body="This is the person who owns the setup. You can add the rest of the team later."
      />

      <div className="flex flex-col gap-5">
        <Field label="Full name" error={errors.name}>
          <Input
            value={data.account.name}
            invalid={!!errors.name}
            onChange={(e) => set('name', e.target.value)}
            autoComplete="name"
          />
        </Field>

        <Field label="Work email" error={errors.email} hint="This is what you'll sign in with.">
          <Input
            type="email"
            inputMode="email"
            value={data.account.email}
            invalid={!!errors.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
          />
        </Field>

        <PasswordInput
          label="Password"
          value={data.account.password}
          onChange={(value) => set('password', value)}
          error={errors.password}
          hint={`At least ${MIN_LENGTH} characters. A few words you'll remember beats a short one with symbols.`}
          meter
        />

        <PasswordInput
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
