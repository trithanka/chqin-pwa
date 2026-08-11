import { Check, LoaderCircle } from 'lucide-react'

/**
 * Dashboard primitives. Denser and quieter than the guest app's — this is a
 * tool someone uses at a desk, not a moment in a lobby.
 */

export function Button({
  children,
  onClick,
  type = 'button',
  tone = 'primary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  disabled = false,
  loading = false,
  className = '',
}) {
  const tones = {
    primary:
      'bg-brand text-white shadow-[var(--shadow-raised)] hover:bg-brand-dark disabled:shadow-none',
    secondary:
      'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 hover:border-slate-300',
    ghost: 'text-slate-500 hover:text-slate-900 hover:bg-slate-100',
    danger: 'text-red-600 hover:bg-red-50',
  }
  const sizes = {
    md: 'h-11 px-5 text-[14.5px] gap-2 rounded-xl',
    sm: 'h-9 px-3.5 text-[13px] gap-1.5 rounded-lg',
    icon: 'size-9 rounded-lg',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold tracking-[-0.01em] transition-all disabled:cursor-not-allowed disabled:opacity-45 ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {loading ? (
        <LoaderCircle size={16} className="animate-spin" />
      ) : (
        Icon && <Icon size={16} strokeWidth={2.2} />
      )}
      {children}
      {IconRight && !loading && <IconRight size={16} strokeWidth={2.2} />}
    </button>
  )
}

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="text-[13px] font-semibold text-slate-700">{label}</span>
        {required && <span className="text-[12px] text-slate-400">required</span>}
      </span>
      {children}
      {/* Errors replace hints rather than stacking — one message per field. */}
      {error ? (
        <span className="mt-1.5 block text-[12.5px] font-medium text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[12.5px] text-slate-500">{hint}</span>
      )}
    </label>
  )
}

const control =
  'w-full h-11 rounded-xl border bg-white px-3.5 text-[14.5px] text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand/12'

export function Input({ invalid, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`${control} ${
        invalid ? 'border-red-300 focus:border-red-500' : 'border-slate-200 focus:border-brand'
      } ${className}`}
    />
  )
}

export function Select({ children, invalid, className = '', ...props }) {
  return (
    <select
      {...props}
      className={`${control} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10 ${
        invalid ? 'border-red-300' : 'border-slate-200 focus:border-brand'
      } ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m4 6 4 4 4-4'/%3E%3C/svg%3E\")",
      }}
    >
      {children}
    </select>
  )
}

export function Panel({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[var(--shadow-panel)] ${className}`}
    >
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600',
    brand: 'bg-brand-soft text-brand',
    good: 'bg-emerald-50 text-emerald-700',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, body }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-200 px-6 py-9 text-center">
      <Icon size={20} className="mb-1 text-slate-300" strokeWidth={1.8} />
      <p className="text-[14px] font-semibold text-slate-700">{title}</p>
      <p className="max-w-[280px] text-[13px] leading-relaxed text-slate-500">{body}</p>
    </div>
  )
}

/** The left rail's step list — state is carried by weight and colour, not icons alone. */
export function StepRail({ steps, current, furthest, onJump }) {
  return (
    <ol className="flex flex-col gap-0.5">
      {steps.map((step, i) => {
        const done = i < furthest
        const active = i === current
        const reachable = i <= furthest

        return (
          <li key={step.key}>
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onJump(i)}
              className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                active ? 'bg-white/10' : reachable ? 'hover:bg-white/5' : 'cursor-default'
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'bg-brand text-white'
                      : 'border border-white/20 text-white/40'
                }`}
              >
                {done ? <Check size={13} strokeWidth={3.2} /> : i + 1}
              </span>
              <span
                className={`text-[13.5px] font-medium transition-colors ${
                  active ? 'text-white' : reachable ? 'text-white/60' : 'text-white/30'
                }`}
              >
                {step.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
