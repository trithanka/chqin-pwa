import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkles, ShieldCheck } from 'lucide-react'
import { Button } from './kit'
import { SERVICE } from './services'
import { passwordProblem } from '../lib/password'
import Logo from '../components/Logo'
import AccountStep from './steps/AccountStep'
import PropertyStep from './steps/PropertyStep'
import BusinessStep from './steps/BusinessStep'
import RoomsStep from './steps/RoomsStep'
import ServicesStep from './steps/ServicesStep'
import EssentialsStep from './steps/EssentialsStep'
import RoutingStep from './steps/RoutingStep'
import PreviewStep from './steps/PreviewStep'
import LiveStep from './steps/LiveStep'

/**
 * Property onboarding & business registration.
 *
 * Responsive design:
 * - Mobile / Small screen: Compact, thumb-first vertical flow with sticky navigation.
 * - Desktop / Large screen: Split layout with an interactive multi-step timeline sidebar,
 *   ambient glow backdrops, and an elevated glassmorphic card workspace.
 */

const STEPS = [
  { key: 'property', label: 'Property', desc: 'Name & location', Screen: PropertyStep },
  { key: 'business', label: 'Business', desc: 'GST & legal details', Screen: BusinessStep },
  { key: 'rooms', label: 'Rooms', desc: 'Inventory & categories', Screen: RoomsStep },
  { key: 'services', label: 'Services', desc: 'Guest amenities', Screen: ServicesStep },
  { key: 'essentials', label: 'Essentials', desc: 'Wi-Fi & key timings', Screen: EssentialsStep },
  { key: 'routing', label: 'Teams', desc: 'WhatsApp routing', Screen: RoutingStep },
  { key: 'account', label: 'Admin', desc: 'Owner sign-in credentials', Screen: AccountStep },
  { key: 'preview', label: 'Preview', desc: 'Guest experience check', Screen: PreviewStep },
  { key: 'live', label: 'Go live', desc: 'Printable reception QR', Screen: LiveStep, final: true },
]

const BLANK = {
  account: { name: '', email: '', password: '', confirmPassword: '', role: 'owner' },
  property: { name: '', city: '', address: '', country: 'IN', timezone: 'Asia/Kolkata' },
  business: { legalName: '', gstin: '' },
  rooms: [],
  services: ['food', 'water', 'housekeeping', 'laundry', 'maintenance'],
  essentials: {
    wifiSsid: '',
    wifiPassword: '',
    breakfastFrom: '',
    breakfastTo: '',
    checkoutTime: '',
    notes: '',
  },
  // Per service, so food can go to the kitchen and laundry somewhere else.
  contacts: {},
}

const STORAGE_KEY = 'chqin.onboarding.draft'

const mergeDraft = (saved) => ({
  ...BLANK,
  ...saved,
  account: { ...BLANK.account, ...saved?.account },
  property: { ...BLANK.property, ...saved?.property },
  business: { ...BLANK.business, ...saved?.business },
  essentials: { ...BLANK.essentials, ...saved?.essentials },
  contacts: { ...saved?.contacts },
  rooms: Array.isArray(saved?.rooms) ? saved.rooms : [],
  services: Array.isArray(saved?.services)
    ? saved.services.filter((s) => s in SERVICE)
    : BLANK.services,
})

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: BLANK, stepIndex: 0, furthest: 0, resumed: false }
    const saved = JSON.parse(raw)

    const furthest = Math.min(saved.furthest ?? 0, STEPS.length - 1)
    const data = mergeDraft(saved.data)

    const accountStep = STEPS.findIndex((s) => s.key === 'account')
    if (!data.account.password && furthest >= accountStep) {
      return {
        data,
        stepIndex: accountStep,
        furthest: accountStep,
        resumed: Boolean(saved.data?.account?.email),
      }
    }

    return {
      data,
      stepIndex: Math.min(saved.stepIndex ?? 0, furthest),
      furthest,
      resumed: false,
    }
  } catch {
    return { data: BLANK, stepIndex: 0, furthest: 0, resumed: false }
  }
}

export default function OnboardingWizard({ onComplete }) {
  const [draft] = useState(loadDraft)
  const [data, setData] = useState(draft.data)
  const [stepIndex, setStepIndex] = useState(draft.stepIndex)
  const [furthest, setFurthest] = useState(draft.furthest)
  const [showErrors, setShowErrors] = useState(false)
  const [resumed, setResumed] = useState(draft.resumed)

  useEffect(() => {
    try {
      const { password: _pw, confirmPassword: _confirm, ...account } = data.account
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ data: { ...data, account }, stepIndex, furthest }),
      )
    } catch {
      /* private mode */
    }
  }, [data, stepIndex, furthest])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [stepIndex])

  const accountStep = STEPS.findIndex((s) => s.key === 'account')
  const step = STEPS[stepIndex]
  const patch = (key, value) => setData((d) => ({ ...d, [key]: value }))

  const errors = useMemo(() => validate(step.key, data), [step.key, data])
  const canContinue = Object.keys(errors).length === 0

  const firstInvalidStep = () =>
    STEPS.findIndex((s) => Object.keys(validate(s.key, data)).length > 0)

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

  const jumpTo = (i) => {
    if (i <= furthest) {
      setShowErrors(false)
      setStepIndex(i)
    }
  }

  const reset = () => {
    setResumed(false)
    setData(BLANK)
    setStepIndex(0)
    setFurthest(0)
    setShowErrors(false)
  }

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#090d16] text-slate-100 flex flex-col lg:flex-row">
      {/* Background ambient glow matching modern presentation */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed -top-40 left-1/3 size-[650px] rounded-full bg-sky-500/10 blur-[140px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 size-[500px] rounded-full bg-blue-600/10 blur-[140px]"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Desktop Step Timeline Sidebar (Visible on lg:)                    */}
      {/* ------------------------------------------------------------------ */}
      <aside className="print-hide hidden lg:flex lg:w-[380px] xl:w-[420px] shrink-0 flex-col justify-between border-r border-white/[0.08] bg-[#090d16]/90 p-8 xl:p-10 sticky top-0 h-screen z-10 backdrop-blur-xl">
        <div className="flex flex-col gap-8 overflow-y-auto pr-2">
          {/* Brand header */}
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto text-white" />
            <span className="h-5 w-px bg-white/20" />
            <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">
              For Business
            </span>
          </div>

          <div>
            <h2 className="text-[20px] font-extrabold tracking-[-0.02em] text-white">
              Property Setup Wizard
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-400">
              Complete these quick steps to generate your digital front desk.
            </p>
          </div>

          {/* Interactive Steps Timeline */}
          <nav aria-label="Setup progress" className="relative flex flex-col gap-0 py-2">
            {STEPS.map((s, idx) => {
              const isCompleted = idx < stepIndex
              const isCurrent = idx === stepIndex
              const isAccessible = idx <= furthest
              const isLast = idx === STEPS.length - 1

              return (
                <div key={s.key} className="relative flex items-start gap-4 pb-5 last:pb-0">
                  {/* Vertical connecting line */}
                  {!isLast && (
                    <div
                      className={`absolute left-[15px] top-8 bottom-0 w-0.5 transition-colors duration-300 ${
                        idx < stepIndex ? 'bg-sky-500/50' : 'bg-slate-800'
                      }`}
                    />
                  )}

                  {/* Step node */}
                  <button
                    type="button"
                    onClick={() => isAccessible && jumpTo(idx)}
                    disabled={!isAccessible}
                    className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold transition-all ${
                      isCurrent
                        ? 'bg-sky-500 text-slate-950 shadow-[0_0_16px_rgba(56,189,248,0.5)] ring-4 ring-sky-500/20'
                        : isCompleted
                          ? 'bg-sky-500/20 border border-sky-400/50 text-sky-300 hover:bg-sky-500/30 cursor-pointer'
                          : 'bg-slate-900 border border-slate-700/80 text-slate-500 cursor-default'
                    }`}
                  >
                    {isCompleted ? <Check size={15} strokeWidth={3} /> : idx + 1}
                  </button>

                  {/* Step label info */}
                  <div
                    onClick={() => isAccessible && jumpTo(idx)}
                    className={`min-w-0 flex-1 pt-0.5 transition-colors ${
                      isAccessible ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <p
                      className={`text-[13.5px] font-bold transition-colors ${
                        isCurrent
                          ? 'text-sky-300'
                          : isCompleted
                            ? 'text-slate-200 hover:text-white'
                            : 'text-slate-500'
                      }`}
                    >
                      {s.label}
                    </p>
                    <p className="text-[11.5px] text-slate-400/80 truncate">{s.desc}</p>
                  </div>
                </div>
              )
            })}
          </nav>
        </div>

        {/* Bottom reassurance / draft indicator */}
        <div className="pt-4 border-t border-white/[0.08] flex items-center justify-between text-[12px] text-slate-400">
          <span className="flex items-center gap-1.5 text-slate-300 font-medium">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> Auto-saved draft
          </span>
          <span className="text-slate-500 text-[11px]">~2 min setup</span>
        </div>
      </aside>

      {/* ------------------------------------------------------------------ */}
      {/* Main Workspace (Mobile single column & Desktop elevated card)      */}
      {/* ------------------------------------------------------------------ */}
      <div className="relative flex-1 flex flex-col justify-between min-h-dvh">
        {/* Mobile Header (Hidden on lg:) */}
        <header className="print-hide lg:hidden sticky top-0 z-20 border-b border-white/[0.06] bg-[#090d16]/85 px-5 pt-safe backdrop-blur-md">
          <div className="flex items-center gap-3 pb-3">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0}
              aria-label="Back"
              className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl text-slate-400 transition-colors hover:text-white disabled:opacity-0"
            >
              <ArrowLeft size={20} strokeWidth={2.4} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-400">
                {String(stepIndex + 1).padStart(2, '0')} · {step.label}
              </p>
              <p className="text-[12px] font-medium text-slate-400">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
            </div>

            <Logo className="h-5 w-auto shrink-0 text-white/80" />
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-blue-500 to-blue-600 shadow-[0_0_10px_rgba(56,189,248,0.5)] transition-[width] duration-500"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 flex flex-col items-center justify-start lg:justify-center p-4 sm:p-6 lg:p-10 xl:p-12">
          <div className="w-full max-w-[620px] lg:rounded-3xl lg:border lg:border-white/[0.08] lg:bg-slate-900/60 lg:p-8 xl:lg:p-10 lg:backdrop-blur-xl lg:shadow-2xl">
            {/* Desktop step badge & back button on top of card */}
            <div className="hidden lg:flex items-center justify-between mb-6 pb-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={back}
                    className="-ml-2 flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-semibold text-slate-400 hover:text-white transition-colors hover:bg-white/[0.05]"
                  >
                    <ArrowLeft size={16} strokeWidth={2.4} /> Back
                  </button>
                )}
              </div>
              <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-0.5 text-[11px] font-bold text-sky-300">
                Step {stepIndex + 1} of {STEPS.length} · {step.label}
              </span>
            </div>

            {/* Resume banner */}
            {resumed && stepIndex === accountStep && (
              <p className="mb-5 rounded-xl border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-[13px] leading-relaxed text-sky-300">
                Picking up where you left off. Passwords aren't saved in the browser, so please set yours again.
              </p>
            )}

            {/* Active Step Screen */}
            <step.Screen
              data={data}
              patch={patch}
              errors={showErrors ? errors : {}}
              onRestart={reset}
              onComplete={async (payload) => {
                const invalid = firstInvalidStep()
                if (invalid !== -1) {
                  setStepIndex(invalid)
                  setShowErrors(true)
                  throw new Error('Some details are missing. Check the highlighted fields.')
                }
                const result = await onComplete?.(payload)
                try {
                  localStorage.removeItem(STORAGE_KEY)
                } catch {
                  /* private mode */
                }
                return result
              }}
            />

            {/* Desktop in-card action footer */}
            {!step.final && (
              <div className="hidden lg:block mt-8 pt-6 border-t border-white/[0.08]">
                {!canContinue && showErrors && (
                  <p className="mb-3 text-center text-[13px] font-medium text-red-400">
                    Check the highlighted fields above
                  </p>
                )}
                <div className="flex items-center justify-between gap-4">
                  {stepIndex > 0 ? (
                    <Button tone="secondary" onClick={back} className="px-6">
                      Back
                    </Button>
                  ) : (
                    <div />
                  )}
                  <Button iconRight={ArrowRight} onClick={next} className="min-w-[180px]">
                    {stepIndex === STEPS.length - 2 ? 'Looks good' : 'Continue'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>

        {/* Mobile Sticky Bottom Action (Hidden on lg:) */}
        {!step.final && (
          <div className="print-hide lg:hidden sticky bottom-0 z-20 border-t border-white/[0.08] bg-[#090d16]/90 px-5 pt-3 pb-safe backdrop-blur-md">
            {!canContinue && showErrors && (
              <p className="mb-2 text-center text-[13px] font-medium text-red-400">
                Check the highlighted fields above
              </p>
            )}
            <Button iconRight={ArrowRight} onClick={next} className="w-full">
              {stepIndex === STEPS.length - 2 ? 'Looks good' : 'Continue'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Validation — the same shapes the API's zod schemas enforce          */
/* ------------------------------------------------------------------ */

const PHONE = /^\+?[0-9][0-9 -]{7,17}$/

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

  if (stepKey === 'business') {
    // Optional — a small guesthouse may have no GST registration at all. But a
    // GSTIN that is typed has to be a GSTIN.
    const gstin = data.business.gstin.trim()
    if (gstin && !/^[0-9A-Z]{15}$/.test(gstin.toUpperCase())) {
      errors.gstin = 'A GSTIN is 15 characters, like 18ABCDE1234F1Z5.'
    }
  }

  if (stepKey === 'rooms' && data.rooms.length === 0) {
    errors.rooms = 'Add at least one room.'
  }

  if (stepKey === 'services' && data.services.length === 0) {
    errors.services = 'Pick at least one — this is what a guest can ask for.'
  }

  // A service with nowhere to send its requests is a request that vanishes.
  if (stepKey === 'routing') {
    for (const service of data.services) {
      const digits = (data.contacts[service] ?? '').replace(/\D/g, '')
      if (!digits) errors[service] = 'Add a number, or use the reception one.'
      else if (digits.length !== 10) errors[service] = 'Please enter all 10 digits.'
    }
  }

  return errors
}
