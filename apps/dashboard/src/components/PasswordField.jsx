import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Field, Input } from './ui'
import { STRENGTH_LABEL, passwordStrength } from '../lib/password'

/**
 * A password input that can be read back.
 *
 * The reveal toggle isn't a nicety: hiding what you typed is why people pick
 * short passwords they can retype without mistakes. The strength bar only
 * appears once something is typed, so an empty form stays quiet.
 */
export default function PasswordField({
  label,
  value,
  onChange,
  error,
  hint,
  meter = false,
  autoComplete = 'new-password',
  placeholder,
}) {
  const [visible, setVisible] = useState(false)
  const strength = passwordStrength(value)

  return (
    <Field label={label} required error={error} hint={hint}>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="pr-11"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 transition-colors hover:text-slate-700"
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {meter && value.length > 0 && (
        <div className="mt-2 flex items-center gap-2.5">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  strength > i
                    ? ['bg-red-400', 'bg-amber-400', 'bg-emerald-500'][strength - 1]
                    : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
          <span className="w-[68px] text-right text-[11.5px] font-semibold text-slate-400">
            {STRENGTH_LABEL[strength]}
          </span>
        </div>
      )}
    </Field>
  )
}
