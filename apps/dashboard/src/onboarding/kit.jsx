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
      className={`rounded-2xl border border-white/[0.08] bg-slate-900/90 shadow-sm backdrop-blur-sm ${className}`}
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
    primary:
      'bg-gradient-to-r from-blue-600 via-blue-500 to-sky-500 text-white hover:from-blue-500 hover:to-sky-400 shadow-lg shadow-blue-500/20 active:scale-[0.99] border-0',
    secondary:
      'bg-slate-800/90 text-white border border-slate-700/80 hover:border-sky-400/50 hover:bg-slate-800 transition-all active:scale-[0.99]',
    ghost: 'text-slate-400 hover:text-white transition-colors',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold tracking-[-0.01em] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]} ${className}`}
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
  'w-full h-12 rounded-xl border border-white/[0.09] bg-slate-900/90 px-4 text-[16px] text-slate-100 transition-colors placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400/40'

export function Input({ invalid, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`${control} ${
        invalid ? 'border-red-500/60 focus:border-red-500' : ''
      } ${className}`}
    />
  )
}

export function Select({ children, invalid, className = '', ...props }) {
  return (
    <select
      {...props}
      className={`${control} appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-11 ${
        invalid ? 'border-red-500/60 focus:border-red-500' : ''
      } ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
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
            checked ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-800 text-slate-400'
          }`}
        >
          <Icon size={17} strokeWidth={2} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-slate-100">{label}</span>
        {sub && <span className="block truncate text-[13px] text-slate-400">{sub}</span>}
      </span>
      <span
        className={`grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors ${
          checked ? 'border-sky-400 bg-sky-400 text-slate-950' : 'border-slate-700'
        }`}
      >
        {checked && <Check size={14} strokeWidth={3.4} />}
      </span>
    </button>
  )
}

/** A fact that has been confirmed — the check ticks down the right of the flow. */
export function ConfirmedRow({ label, value }) {
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3 last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-slate-400">{label}</span>
        <span className="block truncate text-[14.5px] font-semibold text-slate-100">{value}</span>
      </span>
      <Check size={16} strokeWidth={3} className="shrink-0 text-sky-400" />
    </div>
  )
}

export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-slate-800 text-slate-300 border border-slate-700/60',
    green: 'bg-sky-500/15 text-sky-300 border border-sky-400/20',
    brand: 'bg-sky-500/15 text-sky-300 border border-sky-400/20',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${tones[tone] || tones.neutral}`}
    >
      {children}
    </span>
  )
}

/**
 * A document the property can hand over — and an honest label on what happens
 * to it.
 */
export function UploadCard({ label, hint, accept, file, onFile, status }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/[0.12] bg-slate-900/80 p-4">
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-[18px] font-bold text-sky-400">
          +
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-slate-100">
            {file ? file.name : label}
          </span>
          <span className="block truncate text-[13px] text-slate-400">
            {file ? `${Math.round(file.size / 1024)} KB · attached` : hint}
          </span>
        </span>
      </label>

      {file && (
        <div className="mt-3 rounded-xl bg-slate-800/80 px-3 py-2.5">
          {status ?? (
            <p className="text-[12.5px] leading-relaxed text-slate-400">
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
                    ? ['bg-red-400', 'bg-amber-400', 'bg-sky-400'][strength - 1]
                    : 'bg-slate-800'
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
