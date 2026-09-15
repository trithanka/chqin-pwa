import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, QrCode, ShieldCheck, Sparkles, Zap } from 'lucide-react'
import { Badge, Button, Field, Input, Panel } from '../components/ui'
import PasswordField from '../components/PasswordField'
import { useSession } from '../session'
import Logo from '../components/Logo'

/**
 * Staff sign-in: email and password, set during registration.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const { signIn } = useSession()
  const navigate = useNavigate()

  const submit = async (e) => {
    e?.preventDefault()

    const next = {}
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter your work email.'
    if (!password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length) return

    setBusy(true)
    try {
      await signIn({ email: email.trim(), password })
      navigate('/app')
    } catch (err) {
      setErrors({ form: err.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      sub="Sign in to your property front desk dashboard."
      footer={
        <>
          New property?{' '}
          <Link to="/register" className="font-bold text-brand hover:underline">
            Register your property
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {errors.form && (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-medium text-red-700">
            {errors.form}
          </p>
        )}

        <Field label="Work email" error={errors.email}>
          <Input
            type="email"
            value={email}
            invalid={!!errors.email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="priya@hotelaurora.com"
            autoComplete="email"
          />
        </Field>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="current-password"
        />

        <div className="-mt-1 text-right">
          <Link
            to="/forgot-password"
            className="text-[12.5px] font-semibold text-slate-500 hover:text-brand"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={busy} iconRight={ArrowRight} className="mt-1">
          Sign In to Desk
        </Button>
      </form>
    </AuthShell>
  )
}

/** Shared frame for the signed-out screens. */
export function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_minmax(440px,46%)] bg-[#f8fafc]">
      {/* Brand presentation side */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#090d16] p-12 text-white lg:flex">
        {/* Glow effects */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-32 size-96 rounded-full bg-sky-500/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 right-0 size-80 rounded-full bg-blue-600/15 blur-3xl"
        />

        <div className="relative flex items-center gap-3">
          <Logo className="h-7 w-auto text-white" />
          <span className="h-5 w-px bg-white/20" />
          <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
            For Business
          </span>
        </div>

        <div className="relative max-w-[34ch] space-y-6">
          <h2 className="text-[34px] font-extrabold leading-[1.15] tracking-[-0.035em] text-white">
            One code on the desk. Guests check themselves in.
          </h2>
          <p className="text-[14.5px] leading-relaxed text-slate-300">
            No app download required. Cryptographic passkey identity, automatic room allocations, and direct WhatsApp concierge integration.
          </p>

          <div className="space-y-3 pt-2">
            {[
              'Zero line at 3 PM check-in rush',
              'Passkey verification on guest hardware',
              'Automated Wi-Fi and digital room delivery',
            ].map((text, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[13.5px] font-semibold text-slate-200">
                <CheckCircle2 size={16} className="text-sky-400 shrink-0" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-center justify-between border-t border-white/[0.08] pt-4 text-[12px] text-slate-400">
          <span>ChqIn Hospitality Suite</span>
          <span className="flex items-center gap-1.5 text-emerald-400">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" /> Live Reception Engine
          </span>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-7 w-auto text-slate-900" />
            <span className="rounded-full border border-brand/20 bg-brand-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-brand">
              Business
            </span>
          </div>

          <h1 className="text-[26px] font-extrabold tracking-[-0.03em] text-slate-900">{title}</h1>
          {sub && <p className="mt-1.5 mb-7 text-[14px] leading-relaxed text-slate-500 font-medium">{sub}</p>}

          <Panel className="p-7 shadow-[var(--shadow-panel)] border-slate-200/90">{children}</Panel>

          {footer && <p className="mt-6 text-center text-[13.5px] text-slate-500">{footer}</p>}
        </div>
      </main>
    </div>
  )
}

