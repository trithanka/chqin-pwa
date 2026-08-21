import { useState } from 'react'
import { Check, Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { STRENGTH_LABEL, passwordStrength } from '../lib/password'

/**
 * Onboarding primitives — dark, thumb-sized, phone-first.
 *
 * Separate from `components/ui.jsx` on purpose: those are light and are what
 * Today, Bookings and Guests render. Recolouring them would restyle four
 * pages nobody asked about, so setup gets its own small set instead.
 *
 * Every control is at least 44px tall. This flow is done standing at a
 * reception desk on someone's own phone, not at a keyboard.
 */

export function Card({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-onb-line bg-onb-surface ${className}`}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  onClick,
  type = 'button',
  tone = 'primary',
  icon: Icon,
  iconRight: IconRight,
  disabled = false,
  loading = false,
  className = '',
}) {
  const tones = {
    primary: 'bg-onb-green text-onb-ink hover:bg-onb-green-dark',
    secondary: 'bg-onb-raised text-onb-text border border-onb-line hover:border-onb-green/40',
    ghost: 'text-onb-muted hover:text-onb-text',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold tracking-[-0.01em] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      {loading ? (
        <LoaderCircle size={17} className="animate-spin" />
      ) : (
        Icon && <Icon size={17} strokeWidth={2.4} />
      )}
      {children}
      {IconRight && !loading && <IconRight size={17} strokeWidth={2.4} />}
    </button>
  )
}

export function Field({ label, hint, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && (
        <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.1em] text-onb-muted">
          {label}
        </span>
      )}
      {children}
      {/* One message per field: an error replaces the hint rather than
          stacking under it. */}
      {error ? (
        <span className="mt-2 block text-[13px] font-medium text-red-400">{error}</span>
      ) : (
        hint && <span className="mt-2 block text-[13px] leading-relaxed text-onb-muted">{hint}</span>
      )}
    </label>
  )
}

const control =
  'w-full h-12 rounded-xl border bg-onb-raised px-4 text-[16px] text-onb-text transition-colors placeholder:text-onb-muted/60 focus:outline-none'

export function Input({ invalid, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`${control} ${
        invalid ? 'border-red-500/60' : 'border-onb-line focus:border-onb-green'
      } ${className}`}
    />
  )
}

export function Select({ children, invalid, className = '', ...props }) {
  return (
    <select
      {...props}
      className={`${control} appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-11 ${
        invalid ? 'border-red-500/60' : 'border-onb-line focus:border-onb-green'
      } ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%237c8d84' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      }}
    >
      {children}
    </select>
  )
}

/**
 * A row you tap anywhere on to toggle.
 *
 * The whole row is the target, not the 20px box at the end — on a phone the
 * box alone is a miss waiting to happen.
 */
export function CheckRow({ icon: Icon, label, sub, checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-white/[0.03]"
    >
      {Icon && (
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-xl transition-colors ${
            checked ? 'bg-onb-green-soft text-onb-green' : 'bg-onb-raised text-onb-muted'
          }`}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-onb-text">{label}</span>
        {sub && <span className="block truncate text-[13px] text-onb-muted">{sub}</span>}
      </span>
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
          checked ? 'border-onb-green bg-onb-green text-onb-ink' : 'border-onb-line'
        }`}
      >
        {checked && <Check size={14} strokeWidth={3.4} />}
      </span>
    </button>
  )
}

/** A fact that has been confirmed — the green ticks down the right of the flow. */
export function ConfirmedRow({ label, value }) {
  return (
    <div className="flex items-center gap-3 border-b border-onb-line px-4 py-3 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-onb-muted">{label}</span>
        <span className="block truncate text-[14.5px] font-semibold text-onb-text">{value}</span>
      </span>
      <Check size={16} strokeWidth={3} className="shrink-0 text-onb-green" />
    </div>
  )
}

export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-onb-raised text-onb-muted',
    green: 'bg-onb-green-soft text-onb-green',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

/**
 * A document the property can hand over — and an honest label on what happens
 * to it.
 *
 * ponytail: the file is held in the browser and never uploaded — there is no
 * upload route and no storage in the API. Where a caller can read the file
 * locally (the GST certificate's PDF text layer) it passes a `status` line
 * saying what it found; where it can't, the card says so instead of printing
 * line items nobody parsed. Wire it to a real POST /staff/documents when the
 * file itself needs to be kept.
 */
export function UploadCard({ label, hint, accept, file, onFile, status }) {
  return (
    <div className="rounded-2xl border border-dashed border-onb-line bg-onb-surface p-4">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-onb-green-soft text-[18px] text-onb-green">
          +
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-onb-text">
            {file ? file.name : label}
          </span>
          <span className="block truncate text-[13px] text-onb-muted">
            {file ? `${Math.round(file.size / 1024)} KB · attached` : hint}
          </span>
        </span>
      </label>

      {file && (
        <div className="mt-3 rounded-xl bg-onb-raised px-3 py-2.5">
          {status ?? (
            <p className="text-[12.5px] leading-relaxed text-onb-muted">
              Kept on this device for now — attaching it doesn't send it
              anywhere yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** The one-line "why am I on this screen" at the top of every step. */
export function StepHeader({ title, body }) {
  return (
    <header className="mb-6">
      <h1 className="text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-onb-text text-balance">
        {title}
      </h1>
      {body && (
        <p className="mt-2 text-[14.5px] leading-relaxed text-onb-muted">{body}</p>
      )}
    </header>
  )
}

/**
 * Password entry, dark. `components/PasswordField.jsx` stays as it is — the
 * sign-in screen is light and still uses it.
 *
 * The reveal toggle isn't a nicety: hiding what you typed is why people pick
 * short passwords they can retype without mistakes.
 */
export function PasswordInput({ label, value, onChange, error, hint, meter = false, autoComplete = 'new-password' }) {
  const [visible, setVisible] = useState(false)
  const strength = passwordStrength(value)

  return (
    <Field label={label} error={error} hint={hint}>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          value={value}
          invalid={!!error}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="pr-12"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-onb-muted"
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>

      {meter && value.length > 0 && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <div className="flex flex-1 gap-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  strength > i
                    ? ['bg-red-400', 'bg-amber-400', 'bg-onb-green'][strength - 1]
                    : 'bg-onb-line'
                }`}
              />
            ))}
          </div>
          <span className="w-[68px] text-right text-[11.5px] font-semibold text-onb-muted">
            {STRENGTH_LABEL[strength]}
          </span>
        </div>
      )}
    </Field>
  )
}
