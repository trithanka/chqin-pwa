import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Fingerprint, Mail } from 'lucide-react'
import { Button, Field, Input, Panel } from '../components/ui'
import { useSession } from '../session'

/**
 * Staff sign-in. No password field — same rule as the guest app: a passkey, or
 * a link to the address we already trust. Nothing to remember, nothing for us
 * to store, nothing to leak.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState(null)
  const [sent, setSent] = useState(false)
  const { signIn } = useSession()
  const navigate = useNavigate()

  const enter = (name) => {
    signIn({ name, email: email.trim() || 'priya@hotelaurora.com', role: 'owner' })
    navigate('/app')
  }

  const sendLink = () => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError('Use the work email your account was set up with.')
      return
    }
    setError(null)
    setSent(true)
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
      {sent ? (
        <div className="text-center">
          <span className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
            <Mail size={22} strokeWidth={2} />
          </span>
          <p className="text-[15px] font-bold text-slate-900">Check your email</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[13.5px] leading-relaxed text-slate-500">
            We sent a sign-in link to <span className="font-semibold text-slate-700">{email}</span>.
            It works once and expires in ten minutes.
          </p>

          <div className="mt-7 border-t border-slate-100 pt-5">
            <p className="mb-2.5 text-[12px] text-slate-400">
              Prototype — no email is actually sent.
            </p>
            <Button tone="secondary" iconRight={ArrowRight} onClick={() => enter('Priya Nair')}>
              Continue to the dashboard
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Button icon={Fingerprint} onClick={() => enter('Priya Nair')}>
            Sign in with a passkey
          </Button>

          <div className="flex items-center gap-3 py-1">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-400">
              or
            </span>
            <span className="h-px flex-1 bg-slate-200" />
          </div>

          <Field label="Work email" error={error}>
            <Input
              type="email"
              value={email}
              invalid={!!error}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendLink()}
              placeholder="priya@hotelaurora.com"
              autoComplete="email"
            />
          </Field>

          <Button tone="secondary" icon={Mail} onClick={sendLink}>
            Email me a sign-in link
          </Button>
        </div>
      )}
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
          <span className="grid size-8 place-items-center rounded-xl bg-brand text-[13px] font-black">
            C
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-[-0.02em]">ChqIn</p>
            <p className="text-[11.5px] font-medium text-white/45">for business</p>
          </div>
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
            <span className="grid size-8 place-items-center rounded-xl bg-brand text-[13px] font-black text-white">
              C
            </span>
            <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900">ChqIn</p>
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
