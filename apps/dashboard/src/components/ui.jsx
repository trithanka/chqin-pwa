import { ArrowLeft, ChevronRight, LoaderCircle, Search, X } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'

/**
 * Modern Dashboard Primitives.
 * High-aesthetic desk tool components with refined micro-interactions,
 * clear typography hierarchy, and subtle glassmorphic touches.
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
      'bg-brand text-white shadow-[var(--shadow-raised)] hover:bg-brand-dark hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:hover:translate-y-0 disabled:hover:bg-brand disabled:shadow-none',
    secondary:
      'bg-white text-slate-800 border border-slate-200/90 shadow-xs hover:bg-slate-50 hover:border-slate-300 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:hover:translate-y-0 disabled:shadow-none',
    subtle:
      'bg-slate-100 text-slate-700 hover:bg-slate-200/80 hover:text-slate-900 active:scale-[0.98]',
    ghost:
      'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 active:bg-slate-200/60',
    danger:
      'text-red-600 hover:bg-red-50 active:bg-red-100',
    dark:
      'bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]',
  }

  const sizes = {
    md: 'h-10 px-4 text-[13.5px] gap-2 rounded-xl',
    lg: 'h-11 px-5 text-[14.5px] gap-2.5 rounded-xl',
    sm: 'h-8.5 px-3 text-[12.5px] gap-1.5 rounded-lg',
    xs: 'h-7 px-2.5 text-[11.5px] gap-1 rounded-md',
    icon: 'size-9 rounded-xl',
    iconSm: 'size-8 rounded-lg',
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold tracking-[-0.01em] transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 select-none ${tones[tone] || tones.primary} ${sizes[size] || sizes.md} ${className}`}
    >
      {loading ? (
        <LoaderCircle size={15} className="animate-spin" />
      ) : (
        Icon && <Icon size={15} strokeWidth={2.2} />
      )}
      {children}
      {IconRight && !loading && <IconRight size={15} strokeWidth={2.2} />}
    </button>
  )
}

export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline justify-between gap-1.5">
        <span className="text-[13px] font-semibold text-slate-700">{label}</span>
        {required && <span className="text-[11.5px] font-medium text-slate-400">Required</span>}
      </span>
      {children}
      {error ? (
        <span className="mt-1.5 block text-[12px] font-medium text-red-600">{error}</span>
      ) : (
        hint && <span className="mt-1.5 block text-[12px] text-slate-500 leading-relaxed">{hint}</span>
      )}
    </label>
  )
}

const control =
  'w-full h-10 rounded-xl border bg-white px-3.5 text-[14px] text-slate-900 transition-all placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-brand/12 shadow-2xs'

export function Input({ invalid, className = '', ...props }) {
  return (
    <input
      {...props}
      className={`${control} ${
        invalid ? 'border-red-300 focus:border-red-500 focus:ring-red-500/10' : 'border-slate-200/90 focus:border-brand'
      } ${className}`}
    />
  )
}

export function Select({ children, invalid, className = '', ...props }) {
  return (
    <select
      {...props}
      className={`${control} appearance-none bg-[length:16px] bg-[right_0.85rem_center] bg-no-repeat pr-10 cursor-pointer ${
        invalid ? 'border-red-300' : 'border-slate-200/90 focus:border-brand'
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

export function Panel({ children, className = '', hover = false }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white/95 shadow-[var(--shadow-card)] backdrop-blur-xs ${
        hover ? 'transition-all duration-200 hover:shadow-[var(--shadow-card-hover)] hover:border-slate-300/80' : ''
      } ${className}`}
    >
      {children}
    </div>
  )
}

export function Pill({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700 ring-slate-200/60',
    brand: 'bg-brand-soft text-brand ring-blue-500/20',
    good: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20',
    warn: 'bg-amber-50 text-amber-700 ring-amber-500/20',
    purple: 'bg-purple-50 text-purple-700 ring-purple-500/20',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${tones[tone] || tones.neutral} ${className}`}
    >
      {children}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', size = 'sm', className = '' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200/70',
    brand: 'bg-blue-50 text-blue-700 border-blue-200/60',
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    warn: 'bg-amber-50 text-amber-700 border-amber-200/60',
    danger: 'bg-red-50 text-red-700 border-red-200/60',
    purple: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
    dark: 'bg-slate-900 text-white border-transparent',
  }
  const sizes = {
    xs: 'px-1.5 py-0.5 text-[10.5px]',
    sm: 'px-2 py-0.5 text-[11px]',
    md: 'px-2.5 py-1 text-[12px]',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border font-medium ${tones[tone] || tones.neutral} ${sizes[size]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Avatar({ name, size = 'md', className = '' }) {
  const initials = (name || 'G')
    .split(' ')
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const sizes = {
    sm: 'size-7 text-[11px] rounded-lg',
    md: 'size-9 text-[12.5px] rounded-xl',
    lg: 'size-11 text-[14px] rounded-2xl',
  }

  // Consistent hue generator based on name string
  const hash = (name || 'G').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const colors = [
    'from-blue-500 to-indigo-600 text-white',
    'from-emerald-500 to-teal-600 text-white',
    'from-sky-500 to-blue-600 text-white',
    'from-amber-500 to-orange-600 text-white',
    'from-purple-500 to-indigo-600 text-white',
  ]
  const color = colors[hash % colors.length]

  return (
    <span
      className={`grid shrink-0 place-items-center bg-gradient-to-br font-bold shadow-2xs ring-1 ring-black/5 ${color} ${sizes[size]} ${className}`}
    >
      {initials}
    </span>
  )
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200/90 bg-white/40 px-6 py-12 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 ring-1 ring-slate-200/60">
        <Icon size={22} strokeWidth={1.8} />
      </div>
      <p className="mt-1 text-[14.5px] font-bold text-slate-800">{title}</p>
      <p className="max-w-[320px] text-[13px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Dashboard KPI & Analytics Cards                                    */
/* ------------------------------------------------------------------ */

/**
 * Modern StatTile with optional icon, progress indicator, and trend badges.
 */
export function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'neutral',
  progress,
  trend,
  trendLabel,
  className = '',
}) {
  const tones = {
    neutral: 'text-slate-900',
    good: 'text-emerald-600',
    warn: 'text-amber-600',
    brand: 'text-brand',
  }

  const iconBg = {
    neutral: 'bg-slate-100 text-slate-600',
    good: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-500/20',
    warn: 'bg-amber-50 text-amber-600 ring-1 ring-amber-500/20',
    brand: 'bg-brand-soft text-brand ring-1 ring-blue-500/20',
  }

  return (
    <Panel className={`relative overflow-hidden p-4 sm:p-5 ${className}`} hover>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p>
        {Icon && (
          <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${iconBg[tone] || iconBg.neutral}`}>
            <Icon size={16} strokeWidth={2.2} />
          </div>
        )}
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className={`text-[28px] font-extrabold tabular-nums tracking-[-0.03em] ${tones[tone] || tones.neutral}`}>
          {value}
        </span>
        {trendLabel && (
          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
              trend === 'up' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {trendLabel}
          </span>
        )}
      </div>

      {typeof progress === 'number' && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              tone === 'good' ? 'bg-emerald-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand'
            }`}
            style={{ width: `${Math.min(Math.max(progress * 100, 0), 100)}%` }}
          />
        </div>
      )}

      {sub && <p className="mt-1 text-[12px] font-medium text-slate-500">{sub}</p>}
    </Panel>
  )
}

/** Status pill with glowing pulse dot for real-time clarity */
export function StatusPill({ tone = 'neutral', children, pulse = false }) {
  const tones = {
    neutral: 'bg-slate-100/90 text-slate-700 ring-slate-200/80 dot-slate',
    good: 'bg-emerald-50 text-emerald-700 ring-emerald-500/20 dot-emerald',
    muted: 'bg-slate-50 text-slate-400 ring-slate-200/60 dot-slate-light',
    bad: 'bg-red-50 text-red-700 ring-red-500/20 dot-red',
    brand: 'bg-brand-soft text-brand ring-blue-500/20 dot-brand',
    warn: 'bg-amber-50 text-amber-700 ring-amber-500/20 dot-amber',
  }

  const dotColors = {
    neutral: 'bg-slate-400',
    good: 'bg-emerald-500',
    muted: 'bg-slate-300',
    bad: 'bg-red-500',
    brand: 'bg-blue-600',
    warn: 'bg-amber-500',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset shadow-2xs ${tones[tone] || tones.neutral}`}
    >
      <span className="relative flex size-2 shrink-0">
        {(pulse || tone === 'good' || tone === 'brand') && (
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${dotColors[tone] || dotColors.neutral}`}
          />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${dotColors[tone] || dotColors.neutral}`} />
      </span>
      {children}
    </span>
  )
}

/** Wide tables scroll inside their own box */
export function TableWrap({ children, className = '' }) {
  return (
    <Panel className={`overflow-hidden border border-slate-200/80 shadow-[var(--shadow-card)] ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">{children}</table>
      </div>
    </Panel>
  )
}

export function Th({ children, className = '' }) {
  return (
    <th
      className={`border-b border-slate-200/80 bg-slate-50/70 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3.5 text-[13.5px] text-slate-600 ${className}`}>{children}</td>
}

export function SearchInput({ value, onChange, placeholder, className = '' }) {
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search size={15} className="pointer-events-none absolute left-3 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9.5 w-full min-w-[220px] rounded-xl border border-slate-200/90 bg-white pl-9 pr-8 text-[13.5px] text-slate-900 placeholder:text-slate-400 transition-all focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/10 shadow-2xs"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 rounded-md p-1 text-slate-400 hover:text-slate-600"
          aria-label="Clear search"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export function DetailRow({ label, children, className = '' }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-slate-100 py-3 last:border-0 ${className}`}>
      <span className="text-[12.5px] font-medium text-slate-500">{label}</span>
      <span className="text-right text-[13.5px] font-semibold text-slate-800">{children}</span>
    </div>
  )
}

export function Breadcrumbs({ items = [], showBack = false, backTo, onBack, className = '' }) {
  const navigate = useNavigate()

  if (!items || items.length === 0) return null

  const handleBack = () => {
    if (onBack) onBack()
    else if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-2 text-[12.5px] ${className}`}>
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Go back"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200/90 bg-white px-2 py-0.5 text-[12px] font-bold text-slate-700 shadow-2xs hover:bg-slate-100/80 hover:text-slate-900 transition-all cursor-pointer mr-0.5"
        >
          <ArrowLeft size={13} className="text-slate-500" />
          <span>Back</span>
        </button>
      )}

      {items.map((item, index) => {
        const isLast = index === items.length - 1
        const Icon = item.icon
        return (
          <div key={item.label || index} className="flex items-center gap-1.5 min-w-0">
            {index > 0 && (
              <span className="text-slate-300 shrink-0 select-none font-medium">/</span>
            )}
            {item.to && !isLast ? (
              <Link
                to={item.to}
                onClick={(e) => {
                  if (item.onClick) {
                    e.preventDefault()
                    item.onClick()
                  }
                }}
                className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900 transition-colors truncate"
              >
                {Icon && <Icon size={13} className="shrink-0 text-slate-400" />}
                <span className="truncate">{item.label}</span>
              </Link>
            ) : (
              <span
                className={`flex items-center gap-1 font-bold ${
                  isLast ? 'text-slate-900' : 'text-slate-500'
                } truncate`}
              >
                {Icon && <Icon size={13} className="shrink-0 text-slate-400" />}
                <span className="truncate">{item.label}</span>
              </span>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export function PageHeader({
  title,
  subtitle,
  badge,
  breadcrumbs,
  actions,
  backTo,
  showBack = false,
  onBack,
  className = '',
}) {
  const navigate = useNavigate()
  const handleBack = () => {
    if (onBack) onBack()
    else if (backTo) navigate(backTo)
    else navigate(-1)
  }

  return (
    <div className={`mb-6 flex flex-wrap items-end justify-between gap-3 ${className}`}>
      <div>
        {breadcrumbs && <div className="mb-2.5">{breadcrumbs}</div>}
        <div className="flex items-center gap-2.5 flex-wrap">
          {(showBack || backTo || onBack) && (
            <button
              type="button"
              onClick={handleBack}
              aria-label="Go back"
              title="Go back"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-xl border border-slate-200/90 bg-white text-slate-600 shadow-2xs hover:bg-slate-50 hover:text-slate-900 hover:border-slate-300 transition-all cursor-pointer"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-slate-900">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="mt-1 text-[13.5px] font-medium text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

