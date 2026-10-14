import { ArrowRight, Fingerprint, ShieldCheck } from 'lucide-react'
import { PrimaryButton, Screen } from '../components/ui'
import Logo from '../components/Logo'

/**
 * The first beat of a visitor journey. Same job as the hotel welcome — say where
 * you are and what is about to happen — without a reservation to show.
 */
export default function VisitWelcomeScreen({ next, session, activeMode, direction }) {
  const returning = activeMode === 'returning'
  const name = session?.greetingName?.split(' ')[0]

  return (
    <Screen direction={direction} className="justify-between pt-safe pb-8 px-7 sm:pt-7">
      <div className="pt-8">
        <Logo />
        <p className="mt-10 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">
          Welcome to
        </p>
        <h1 className="mt-2 text-[32px] font-extrabold leading-[1.12] tracking-[-0.035em] text-slate-900">
          {session?.venue?.name}
        </h1>
        <p className="mt-3 text-[15px] font-medium leading-relaxed text-slate-500">
          {returning
            ? `${name ? `Welcome back, ${name}. ` : 'Welcome back. '}Verify with your phone and tell us why you’re here.`
            : 'A quick one-time setup, then tell us why you’re here.'}
        </p>

        <ul className="mt-8 grid gap-3.5">
          {[
            [Fingerprint, returning ? 'Verify with your phone' : 'Set up this phone once'],
            [ShieldCheck, 'Your details stay on ChqIn, not with the desk'],
          ].map(([Icon, text]) => (
            <li key={text} className="flex items-center gap-3 text-[14px] font-semibold text-slate-700">
              <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Icon size={18} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="pt-6">
        <PrimaryButton onClick={next} icon={ArrowRight} tone="brand">
          Continue
        </PrimaryButton>
      </div>
    </Screen>
  )
}
