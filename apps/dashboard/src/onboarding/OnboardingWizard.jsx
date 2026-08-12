import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Button, StepRail } from '../components/ui'
import { passwordProblem } from '../lib/password'
import AccountStep from './steps/AccountStep'
import PropertyStep from './steps/PropertyStep'
import RoomsStep from './steps/RoomsStep'
import TeamStep from './steps/TeamStep'
import QrStep from './steps/QrStep'
import LiveStep from './steps/LiveStep'

/**
 * Property onboarding — what a hotel does once, after clicking "onboard your
 * property" on the marketing site.
 *
 * UI only: nothing here talks to the API. Everything that can work locally
 * does (validation, adding rooms and invites, generating and printing the desk
 * card); only "Go live" is a stand-in.
 */

const STEPS = [
  { key: 'account', label: 'Your account', Screen: AccountStep },
  { key: 'property', label: 'Property details', Screen: PropertyStep },
  { key: 'rooms', label: 'Rooms', Screen: RoomsStep },
  { key: 'team', label: 'Team', Screen: TeamStep },
  { key: 'qr', label: 'Check-in QR', Screen: QrStep },
  { key: 'live', label: 'Go live', Screen: LiveStep, final: true },
]

const BLANK = {
  account: { name: '', email: '', password: '', confirmPassword: '', role: 'owner' },
  property: { name: '', city: '', address: '', country: 'IN', timezone: 'Asia/Kolkata' },
  rooms: [],
  team: [],
}

const STORAGE_KEY = 'chqin.onboarding.draft'

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: BLANK, stepIndex: 0, furthest: 0 }
    const saved = JSON.parse(raw)
    // Position is part of the draft: coming back to step 1 with the answers
    // already filled in reads as a bug, not a feature.
    const furthest = Math.min(saved.furthest ?? 0, STEPS.length - 1)
    return {
      data: { ...BLANK, ...saved.data, account: { ...BLANK.account, ...saved.data?.account } },
      stepIndex: Math.min(saved.stepIndex ?? 0, furthest),
      furthest,
    }
  } catch {
    return { data: BLANK, stepIndex: 0, furthest: 0 }
  }
}

export default function OnboardingWizard({ onComplete }) {
  const [draft] = useState(loadDraft)
  const [data, setData] = useState(draft.data)
  const [stepIndex, setStepIndex] = useState(draft.stepIndex)
  // How far they've been: lets them jump back to a finished step and return.
  const [furthest, setFurthest] = useState(draft.furthest)
  const [showErrors, setShowErrors] = useState(false)

  // Onboarding is long enough that a refresh mid-way shouldn't cost the work.
  // With no backend, the draft lives in this browser only.
  useEffect(() => {
    try {
      // The password is deliberately not part of the draft: a credential left
      // in localStorage outlives the tab, the session and the person.
      const { password, confirmPassword, ...account } = data.account
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ data: { ...data, account }, stepIndex, furthest }),
      )
    } catch {
      /* private mode — the draft just won't survive a refresh */
    }
  }, [data, stepIndex, furthest])

  const step = STEPS[stepIndex]
  const patch = (key, value) => setData((d) => ({ ...d, [key]: value }))

  const errors = useMemo(() => validate(step.key, data), [step.key, data])
  const canContinue = Object.keys(errors).length === 0

  const next = () => {
    if (!canContinue) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setStepIndex((i) => {
      const to = Math.min(i + 1, STEPS.length - 1)
      setFurthest((f) => Math.max(f, to))
      return to
    })
  }

  const back = () => {
    setShowErrors(false)
    setStepIndex((i) => Math.max(0, i - 1))
  }

  const jump = (to) => {
    if (to > furthest) return
    setShowErrors(false)
    setStepIndex(to)
  }

  const reset = () => {
    setData(BLANK)
    setStepIndex(0)
    setFurthest(0)
    setShowErrors(false)
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Left rail — where they are, and how much is left */}
      <aside className="print-hide bg-rail px-7 py-8 lg:w-[310px] lg:shrink-0 lg:py-10">
        <div className="flex items-center gap-2.5 text-white">
          <span className="grid size-8 place-items-center rounded-xl bg-brand text-[13px] font-black shadow-sm">
            C
          </span>
          <div className="leading-tight">
            <p className="text-[15px] font-bold tracking-[-0.02em]">ChqIn</p>
            <p className="text-[11.5px] font-medium text-white/45">for business</p>
          </div>
        </div>

        <div className="mt-9 hidden lg:block">
          <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white/35">
            Set up your property
          </p>
          <StepRail steps={STEPS} current={stepIndex} furthest={furthest} onJump={jump} />
        </div>

        {/* Compact progress on narrow screens, where the rail sits on top */}
        <div className="mt-5 flex items-center gap-3 lg:hidden">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <span className="text-[12px] font-semibold text-white/50">
            {stepIndex + 1}/{STEPS.length}
          </span>
        </div>

        <p className="mt-10 hidden max-w-[220px] text-[12px] leading-relaxed text-white/35 lg:block">
          Takes about five minutes. You can come back to anything later from
          settings.
        </p>
      </aside>

      {/* Content */}
      <main className="flex flex-1 justify-center px-5 py-8 sm:px-10 lg:py-14">
        <div className="w-full max-w-[620px]">
          <step.Screen
            data={data}
            patch={patch}
            errors={showErrors ? errors : {}}
            onRestart={reset}
            onComplete={onComplete}
          />

          {!step.final && (
            <div className="print-hide mt-9 flex items-center justify-between gap-3 border-t border-slate-200/80 pt-6">
              {stepIndex > 0 ? (
                <Button tone="ghost" icon={ArrowLeft} onClick={back}>
                  Back
                </Button>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2.5">
                {!canContinue && showErrors && (
                  <span className="text-[13px] font-medium text-red-600">
                    Check the fields above
                  </span>
                )}
                <Button iconRight={ArrowRight} onClick={next}>
                  {stepIndex === STEPS.length - 2 ? 'Finish setup' : 'Continue'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Validation — the same shapes the API's zod schemas will enforce     */
/* ------------------------------------------------------------------ */

function validate(stepKey, data) {
  const errors = {}

  if (stepKey === 'account') {
    const { name, email, password, confirmPassword } = data.account
    if (!name.trim()) errors.name = 'Tell us who you are.'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Use a work email address.'

    const problem = passwordProblem(password, { email })
    if (problem) errors.password = problem
    else if (confirmPassword !== password) errors.confirmPassword = "These don't match."
  }

  if (stepKey === 'property') {
    if (!data.property.name.trim()) errors.name = 'Your property needs a name.'
    if (!data.property.city.trim()) errors.city = 'Which city is it in?'
  }

  if (stepKey === 'rooms' && data.rooms.length === 0) {
    errors.rooms = 'Add at least one room.'
  }

  // Team is optional: a single owner running a small property is legitimate.
  return errors
}
