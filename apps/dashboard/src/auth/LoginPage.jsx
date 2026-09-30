import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  QrCode,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react'
import { Button, Field, Input, Panel } from '../components/ui'
import PasswordField from '../components/PasswordField'
import { useSession } from '../session'
import Logo from '../components/Logo'

/**
 * Feature showcase cards for the auto-scrolling Netflix-style backdrop
 * with crisp unblurred natural hotel imagery
 */
const SHOWCASE_CARDS = [
  {
    tag: '01 — THE PRODUCT',
    title: 'Digital Reception.',
    sub: 'One QR at your property.',
    image: '/images/card-product.jpg',
    imageAlt: 'Luxury boutique hotel reception desk',
  },
  {
    tag: '02 — THE EXPERIENCE',
    title: 'Scan. Consent. IN.',
    sub: 'A simpler way to welcome guests.',
    image: '/images/card-experience.jpg',
    imageAlt: 'Guest scanning QR code on desk counter',
  },
  {
    tag: '03 — THE CONTROL',
    title: 'Everything. One place.',
    sub: 'Your hotel, from check-in to checkout.',
    image: '/images/card-control.jpg',
    imageAlt: 'Staff dashboard and room management tablet',
  },
]


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
      title="Front Desk Sign In"
      sub="Access arrivals, room allocations, guest passkeys, and property controls."
      footer={
        <div className="flex flex-col items-center gap-2">
          <p className="text-[13.5px] text-slate-400">
            Setting up a new property?{' '}
            <Link
              to="/register"
              className="font-bold text-sky-400 hover:text-sky-300 hover:underline transition-colors"
            >
              Register your hotel &rarr;
            </Link>
          </p>
          <div className="flex items-center gap-4 text-[12px] text-slate-500 pt-1">
            <span className="flex items-center gap-1">
              <ShieldCheck size={13} className="text-sky-400" /> Passkey Verified
            </span>
            <span>&bull;</span>
            <span className="flex items-center gap-1">
              <Zap size={13} className="text-amber-400" /> Instant Onboarding
            </span>
          </div>
        </div>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={submit}>
        {errors.form && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-3.5 text-[13px] font-medium text-red-300 backdrop-blur-md">
            {errors.form}
          </div>
        )}

        <Field label="Work email" error={errors.email}>
          <Input
            type="email"
            value={email}
            invalid={!!errors.email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="frontdesk@hotelaurora.com"
            autoComplete="email"
            className="!bg-slate-900/80 !border-white/10 !text-white placeholder:!text-slate-500 focus:!border-sky-400 focus:!ring-sky-500/20"
          />
        </Field>

        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          error={errors.password}
          autoComplete="current-password"
          placeholder="••••••••••••"
          className="!bg-slate-900/80 !border-white/10 !text-white placeholder:!text-slate-500 focus:!border-sky-400 focus:!ring-sky-500/20"
        />

        <div className="-mt-1 text-right">
          <Link
            to="/forgot-password"
            className="text-[12.5px] font-medium text-slate-400 hover:text-sky-300 transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <Button
          type="submit"
          loading={busy}
          iconRight={ArrowRight}
          className="mt-2 w-full !bg-gradient-to-r !from-sky-500 !to-blue-600 hover:!from-sky-400 hover:!to-blue-500 !text-white !font-bold !h-11 !rounded-xl !shadow-[0_0_24px_rgba(56,189,248,0.35)] active:scale-[0.99] transition-all"
        >
          Sign In to Front Desk
        </Button>
      </form>
    </AuthShell>
  )
}

/**
 * Netflix-style cinematic backdrop card component matching exact design specs:
 * crisp, unblurred natural hotel photography with clean typography
 */
function ShowcaseCard({ item }) {
  return (
    <div className="group relative w-[320px] sm:w-[380px] shrink-0 rounded-2xl sm:rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-[0_16px_40px_rgba(0,0,0,0.25)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_24px_50px_rgba(0,0,0,0.35)] select-none">
      {/* Card Header tag */}
      <div className="relative flex items-center justify-between pb-3">
        <span className="text-[11px] sm:text-[12px] font-semibold tracking-[0.14em] uppercase text-slate-400">
          {item.tag}
        </span>
      </div>

      {/* Main Bold Heading */}
      <h3 className="relative text-[22px] sm:text-[25px] font-black tracking-[-0.03em] text-slate-900 leading-[1.15]">
        {item.title}
      </h3>

      {/* Subtitle */}
      <p className="relative mt-1 text-[13.5px] sm:text-[14.5px] font-medium text-slate-600 leading-snug">
        {item.sub}
      </p>

      {/* Crisp Real Image (No Blur, No Blue Filter) */}
      <div className="relative mt-4 overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200/60 bg-slate-100 shadow-inner aspect-[4/3]">
        <img
          src={item.image}
          alt={item.imageAlt}
          loading="eager"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    </div>
  )
}

/**
 * Shared Netflix-style frame for the signed-out business screens.
 * Features continuous auto-scrolling showcase cards and full-width glass form overlay.
 */
export function AuthShell({ title, sub, children, footer }) {
  return (
    <div className="auth-shell relative min-h-dvh overflow-hidden bg-[#070a12] text-slate-100 flex flex-col justify-between selection:bg-sky-500 selection:text-white">
      {/* Atmospheric Background Glows */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 size-[700px] rounded-full bg-sky-600/10 blur-[130px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 size-[500px] rounded-full bg-blue-700/10 blur-[110px]"
      />

      {/* Top Netflix-style Bar */}
      <header className="relative z-30 flex items-center justify-between px-6 py-5 sm:px-12 sm:py-6 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <Link to="/" className="flex items-center gap-3 group">
            <Logo className="h-7 sm:h-8 w-auto text-white group-hover:opacity-90 transition-opacity" />
            <span className="h-5 w-px bg-white/20" />
            <span className="rounded-full border border-sky-400/30 bg-sky-500/15 px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
              For Business
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/register"
            className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-md hover:bg-white/20 hover:border-white/25 transition-all shadow-sm"
          >
            <Building2 size={15} className="text-sky-400" />
            Register Property
          </Link>
          <a
            href="https://chqin.in"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12.5px] font-medium text-slate-400 hover:text-white transition-colors"
          >
            <span>Guest App</span>
            <ExternalLink size={12} className="opacity-70" />
          </a>
        </div>
      </header>

      {/* Background Auto-scrolling Cards Showcase (Netflix style) */}
      <div className="absolute inset-0 z-0 flex flex-col justify-center gap-8 opacity-75 sm:opacity-85 select-none pointer-events-auto pause-on-hover overflow-hidden">
        {/* Row 1: Left to Right marquee with 3 primary points */}
        <div className="animate-marquee gap-6 flex py-2">
          {SHOWCASE_CARDS.concat(SHOWCASE_CARDS).concat(SHOWCASE_CARDS).map((card, idx) => (
            <ShowcaseCard key={`row1-${idx}`} item={card} />
          ))}
        </div>

        {/* Row 2: Reverse marquee for cinematic depth */}
        <div className="animate-marquee-reverse gap-6 flex py-2 hidden md:flex">
          {[...SHOWCASE_CARDS]
            .reverse()
            .concat([...SHOWCASE_CARDS].reverse())
            .concat([...SHOWCASE_CARDS].reverse())
            .map((card, idx) => (
              <ShowcaseCard key={`row2-${idx}`} item={card} />
            ))}
        </div>
      </div>

      {/* Cinematic Vignette Overlay to maintain high form contrast without washing out images */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,rgba(7,10,18,0.78)_0%,rgba(7,10,18,0.92)_100%)]"
      />


      {/* Main Full-Width Form Overlay (Netflix style centered card) */}
      <main className="relative z-20 flex flex-1 items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[480px]">
          {/* Netflix-style Glass Container */}
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-slate-950/80 p-7 sm:p-9 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
            {/* Subtle internal top rim light */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-400/60 to-transparent"
            />

            {/* Header / Title */}
            <div className="mb-6">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/20 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-bold text-sky-400 mb-3">
                <Sparkles size={12} />
                <span>Smart Reception Suite</span>
              </div>
              <h1 className="text-[26px] sm:text-[28px] font-extrabold tracking-[-0.03em] text-white leading-tight">
                {title}
              </h1>
              {sub && (
                <p className="mt-2 text-[13.5px] sm:text-[14px] leading-relaxed text-slate-400 font-medium">
                  {sub}
                </p>
              )}
            </div>

            {/* Interactive Form Component */}
            <div className="relative">{children}</div>

            {/* Footer actions */}
            {footer && (
              <div className="mt-6 border-t border-white/10 pt-5 text-center">{footer}</div>
            )}
          </div>

          {/* Quick Property Highlights Bar */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-[12px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live QR Check-In Engine
            </span>
            <span>&bull;</span>
            <span>Zero App Download</span>
            <span>&bull;</span>
            <span>100% Guest Privacy</span>
          </div>
        </div>
      </main>

      {/* Bottom Minimal Footer */}
      <footer className="relative z-20 border-t border-white/5 py-4 px-6 text-center text-[12px] text-slate-400 flex flex-col sm:flex-row items-center justify-between max-w-7xl mx-auto w-full gap-2">
        <div>
          &copy; {new Date().getFullYear()} ChqIn Hospitality. Digital Reception Architecture.
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <Link to="/register" className="hover:text-white transition-colors">
            Register Property
          </Link>
          <Link to="/forgot-password" className="hover:text-white transition-colors">
            Password Help
          </Link>
        </div>
      </footer>
    </div>
  )
}

