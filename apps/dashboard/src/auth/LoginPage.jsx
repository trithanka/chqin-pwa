import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { Button, Field, Input, Panel } from '../components/ui'
import PasswordField from '../components/PasswordField'
import { useSession } from '../session'
import Logo from '../components/Logo'

/**
 * Staff sign-in: email and password, set during registration.
 *
 * Prototype — there is no staff auth on the API yet, so any well-formed pair
 * gets you in. When it lands, the only change here is what `submit` awaits.
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
      // The API answers the same way for a wrong email and a wrong password —
      // distinct messages turn a login form into an account-enumeration tool —
      // so whatever it says is what the guest-facing side shows.
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
      title="Sign in"
      sub="Manage arrivals, guests and your check-in code."
      footer={
        <>
          New property?{' '}
          <Link to="/register" className="font-semibold text-brand hover:underline">
            Set one up
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {errors.form && (
          <p className="rounded-lg bg-red-50 px-3 py-2.5 text-[13px] font-medium text-red-700">
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
          <button
            type="button"
            className="text-[12.5px] font-semibold text-slate-500 hover:text-brand"
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" loading={busy} iconRight={ArrowRight}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  )
}

/** Shared frame for the signed-out screens. */
export function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(420px,44%)]">
      {/* Brand side — hidden on narrow screens, where it's just noise */}
      <aside className="hidden flex-col justify-between bg-rail p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <Logo className="h-7 w-auto text-white" />
          <span className="h-6 w-px bg-white/15" />
          <p className="text-[12px] font-semibold tracking-[-0.01em] text-white/45">for business</p>
        </div>

        <div className="max-w-[30ch]">
          <p className="text-[30px] font-bold leading-[1.15] tracking-[-0.035em]">
            One code on the desk. Guests check themselves in.
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-white/50">
            No app to install, no forms to retype on the second stay, and no
            queue at 3pm.
          </p>
        </div>

        <p className="text-[12px] text-white/30">Prototype · no data leaves this browser</p>
      </aside>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <Logo className="h-7 w-auto text-slate-900" />
          </div>

          <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-slate-900">{title}</h1>
          {sub && <p className="mt-1.5 mb-7 text-[14px] leading-relaxed text-slate-500">{sub}</p>}

          <Panel className="p-6">{children}</Panel>

          {footer && <p className="mt-5 text-center text-[13.5px] text-slate-500">{footer}</p>}
        </div>
      </main>
    </div>
  )
}
