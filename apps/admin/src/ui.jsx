import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, LoaderCircle, X } from 'lucide-react'

/**
 * The admin panel's few primitives. Dense, dark, amber: a tool for people who
 * know the data model, not a venue's desk.
 */

export function Button({ children, tone = 'secondary', size = 'md', icon: Icon, loading, className = '', ...props }) {
  const tones = {
    primary: 'bg-accent text-stone-950 hover:bg-amber-400 font-semibold',
    secondary: 'bg-raised text-stone-100 hover:bg-stone-700 border border-line',
    danger: 'bg-red-600/90 text-white hover:bg-red-600 font-semibold',
    ghost: 'text-stone-300 hover:bg-raised hover:text-white',
  }
  const sizes = { sm: 'h-7 px-2.5 text-[12px] gap-1.5', md: 'h-9 px-3.5 text-[13px] gap-2' }
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || loading}
      className={`inline-flex items-center justify-center rounded-md transition-colors disabled:opacity-50 ${tones[tone]} ${sizes[size]} ${className}`}
    >
      {loading ? <LoaderCircle size={14} className="animate-spin" /> : Icon && <Icon size={14} />}
      {children}
    </button>
  )
}

export const Panel = ({ children, className = '' }) => (
  <section className={`rounded-lg border border-line bg-surface ${className}`}>{children}</section>
)

export function PageHeader({ title, subtitle, actions, back }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-[20px] font-semibold text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-stone-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium text-stone-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-stone-500">{hint}</span>}
    </label>
  )
}

const control =
  'w-full rounded-md border border-line bg-ink px-2.5 text-[13px] text-stone-100 placeholder:text-stone-600 focus:border-accent focus:outline-none'

export const Input = ({ className = '', ...props }) => <input {...props} className={`${control} h-9 ${className}`} />
export const Select = ({ className = '', children, ...props }) => (
  <select {...props} className={`${control} h-9 ${className}`}>
    {children}
  </select>
)
export const Textarea = ({ className = '', ...props }) => (
  <textarea {...props} className={`${control} py-2 font-mono text-[12px] ${className}`} />
)

const pillTones = {
  neutral: 'bg-stone-700/60 text-stone-200',
  good: 'bg-emerald-500/15 text-emerald-300',
  warn: 'bg-amber-500/15 text-amber-300',
  bad: 'bg-red-500/15 text-red-300',
  info: 'bg-sky-500/15 text-sky-300',
}
export const Pill = ({ tone = 'neutral', children }) => (
  <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold ${pillTones[tone]}`}>
    {children}
  </span>
)

/** Status words the API uses, to a colour. */
export const statusTone = (status) =>
  ({
    active: 'good', done: 'good', sent: 'good', admitted: 'good', ok: 'good', passed: 'good', applied: 'good',
    waiting: 'warn', in_progress: 'info', pending: 'warn', invited: 'info', suspended: 'warn',
    revoked: 'bad', rejected: 'bad', failed: 'bad', expired: 'neutral', closed: 'bad', disabled: 'bad',
    denied: 'bad', erased: 'neutral', cancelled: 'neutral',
  })[status] ?? 'neutral'

export const Status = ({ value }) => <Pill tone={statusTone(value)}>{value ?? '—'}</Pill>

/** A number with a label. Given `to`, the whole card links to where that number comes from. */
export function Stat({ label, value, sub, tone, to }) {
  const card = (
    <Panel className={`h-full p-4 ${to ? 'transition-colors group-hover:border-stone-600 group-hover:bg-stone-800/60' : ''}`}>
      <p className="text-[11.5px] font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className={`mt-1 text-[24px] font-semibold ${tone === 'bad' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-white'}`}>
        {value ?? '—'}
      </p>
      {sub && <p className="mt-0.5 text-[12px] text-stone-500">{sub}</p>}
    </Panel>
  )
  return to ? (
    <Link to={to} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      {card}
    </Link>
  ) : (
    card
  )
}

export const Mono = ({ children, className = '' }) => (
  <span className={`font-mono text-[12px] text-stone-300 ${className}`}>{children}</span>
)

/** First eight characters of an id: enough to tell rows apart, full value on hover. */
export const Id = ({ value }) => (value ? <Mono className="text-stone-400" ><span title={value}>{value.slice(0, 8)}</span></Mono> : '—')

export const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

export function Table({ columns, rows, onRow, empty = 'Nothing here.' }) {
  if (!rows?.length) return <p className="px-4 py-8 text-center text-[13px] text-stone-500">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line text-[11.5px] uppercase tracking-wide text-stone-500">
            {columns.map((c) => (
              <th key={c.label} className={`px-3 py-2 font-medium ${c.className ?? ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id ?? i}
              onClick={onRow ? () => onRow(row) : undefined}
              className={`border-b border-line/60 last:border-0 ${onRow ? 'cursor-pointer hover:bg-raised/60' : ''}`}
            >
              {columns.map((c) => (
                <td key={c.label} className={`px-3 py-2 align-top ${c.className ?? ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A paged list: the table, its error, and "Load more" while the API says there is a next page. */
export function PagedTable({ page, ...props }) {
  return (
    <Panel>
      {page.error ? <p className="p-4 text-[13px] text-red-300">{page.error.message}</p> : <Table rows={page.items} {...props} />}
      <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-stone-500">
        <span>{page.items.length} shown</span>
        {page.loading ? (
          <LoaderCircle size={14} className="animate-spin" />
        ) : (
          page.more && (
            <Button size="sm" onClick={page.more}>
              Load more
            </Button>
          )
        )}
      </div>
    </Panel>
  )
}

export function Async({ loading, error, onRetry, children }) {
  if (loading)
    return (
      <div className="flex items-center gap-2 p-8 text-stone-500">
        <LoaderCircle size={16} className="animate-spin" /> Loading…
      </div>
    )
  if (error)
    return (
      <Panel className="p-6 text-[13px]">
        <p className="text-red-300">{error.message}</p>
        {onRetry && (
          <Button size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        )}
      </Panel>
    )
  return children
}

export const Json = ({ value, className = '' }) => (
  <pre className={`overflow-auto rounded-md bg-ink p-3 font-mono text-[11.5px] leading-relaxed text-stone-300 ${className}`}>
    {JSON.stringify(value, null, 2)}
  </pre>
)

export function Rows({ items }) {
  return (
    <dl className="grid grid-cols-[minmax(120px,max-content)_1fr] gap-x-4 gap-y-1.5 text-[13px]">
      {items
        .filter(Boolean)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-stone-500">{label}</dt>
            <dd className="min-w-0 break-words text-stone-200">{value ?? '—'}</dd>
          </div>
        ))}
    </dl>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] capitalize ${value === t ? 'border-accent text-white' : 'border-transparent text-stone-400 hover:text-stone-200'}`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

/**
 * Every change goes through this dialog: optional fields, a reason when the
 * API wants one, and for destructive actions the name typed out. Never the
 * browser's prompt() — that blocks the page and asks nothing useful.
 *
 * `onSubmit(values)` may return { show } to keep the dialog open with a result
 * (an invite link, a new token) instead of closing.
 */
export function ActionDialog({ action, onClose, onDone }) {
  const { title, description, danger, fields = [], reason, confirmPhrase, submitLabel = 'Confirm', onSubmit } = action
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields
        .filter((f) => f.type !== 'heading')
        .map((f) => [f.name, f.defaultValue ?? (f.type === 'checkbox' ? false : f.type === 'multi' ? [] : '')]),
    ),
  )
  const [why, setWhy] = useState('')
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [shown, setShown] = useState(null)

  const ready =
    (!reason || reason === 'optional' || why.trim().length >= 5) &&
    (!confirmPhrase || typed === confirmPhrase) &&
    fields.every((f) => !f.required || String(values[f.name] ?? '').trim())

  const submit = async (e) => {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setProblem(null)
    try {
      const out = await onSubmit({ ...values, ...(reason ? { reason: why.trim() || undefined } : {}), ...(confirmPhrase ? { confirm: typed } : {}) })
      onDone?.(out)
      if (out?.show) setShown(out.show)
      else onClose()
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form onSubmit={submit} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-line bg-surface p-5 shadow-2xl">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 className={`flex items-center gap-2 text-[16px] font-semibold ${danger ? 'text-red-300' : 'text-white'}`}>
            {danger && <AlertTriangle size={16} />}
            {title}
          </h2>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {shown ? (
          <>
            <div className="text-[13px] text-stone-200">{shown}</div>
            <div className="mt-5 flex justify-end">
              <Button onClick={onClose}>Close</Button>
            </div>
          </>
        ) : (
          <>
            {description && <div className="mb-4 text-[13px] leading-relaxed text-stone-400">{description}</div>}
            <div className="space-y-3">
              {fields.map((f) =>
                f.type === 'heading' ? (
                  <p key={f.label} className="border-t border-line pt-4 text-[12px] font-semibold uppercase tracking-wide text-stone-400 first:border-0 first:pt-0">
                    {f.label}
                  </p>
                ) : f.type === 'checkbox' ? (
                  <label key={f.name} className="flex items-center gap-2 text-[13px] text-stone-200">
                    <input type="checkbox" checked={Boolean(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })} />
                    {f.label}
                  </label>
                ) : (
                <Field key={f.name} label={f.label} hint={f.hint}>
                  {f.type === 'multi' ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
                      {f.options.map((o) => (
                        <label key={o.value} className="flex items-center gap-1.5 text-[13px] text-stone-200">
                          <input
                            type="checkbox"
                            checked={values[f.name].includes(o.value)}
                            onChange={(e) =>
                              setValues({
                                ...values,
                                [f.name]: e.target.checked ? [...values[f.name], o.value] : values[f.name].filter((x) => x !== o.value),
                              })
                            }
                          />
                          {o.label}
                        </label>
                      ))}
                    </div>
                  ) : f.type === 'select' ? (
                    <Select value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                      {f.options.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : f.type === 'textarea' ? (
                    <Textarea rows={f.rows ?? 6} value={values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
                  ) : (
                    <Input
                      type={f.type ?? 'text'}
                      value={values[f.name]}
                      placeholder={f.placeholder}
                      onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                    />
                  )}
                </Field>
                ),
              )}
              {reason && (
                <Field label={reason === 'optional' ? 'Reason (optional)' : 'Reason'} hint="Saved in the audit log with your name.">
                  <Input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="Why is this being done?" />
                </Field>
              )}
              {confirmPhrase && (
                <Field label={<>Type <span className="font-mono text-white">{confirmPhrase}</span> to confirm</>}>
                  <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
                </Field>
              )}
            </div>
            {problem && <p className="mt-3 text-[13px] text-red-300">{problem}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button tone="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" tone={danger ? 'danger' : 'primary'} disabled={!ready} loading={busy}>
                {submitLabel}
              </Button>
            </div>
          </>
        )}
      </form>
    </div>
  )
}

/** `const [dialog, act] = useAction(reload)` — render {dialog}, call act({...}) to open one. */
export function useAction(onDone) {
  const [action, setAction] = useState(null)
  const dialog = action ? <ActionDialog key={action.title} action={action} onClose={() => setAction(null)} onDone={onDone} /> : null
  return [dialog, setAction]
}
