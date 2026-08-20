import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
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
 * Property onboarding — what a hotel does once, on a phone, usually standing
 * at its own reception desk.
 *
 * Phone-first for that reason: one question per screen, a sticky action at
 * the bottom under the thumb, and a progress bar instead of a sidebar. On a
 * desktop the same column is centred rather than stretched — a 620px form on
 * a 1440px screen is a form with a lot of empty space next to it.
 *
 * Everything is collected locally and posted once at the end.
 */

const STEPS = [
  { key: 'property', label: 'Property', Screen: PropertyStep },
  { key: 'business', label: 'Business', Screen: BusinessStep },
  { key: 'rooms', label: 'Rooms', Screen: RoomsStep },
  { key: 'services', label: 'Services', Screen: ServicesStep },
  { key: 'essentials', label: 'Essentials', Screen: EssentialsStep },
  { key: 'routing', label: 'Teams', Screen: RoutingStep },
  { key: 'account', label: 'Admin', Screen: AccountStep },
  { key: 'preview', label: 'Preview', Screen: PreviewStep },
  { key: 'live', label: 'Go live', Screen: LiveStep, final: true },
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

/**
 * Merges a saved draft onto BLANK one object at a time.
 *
 * A shallow spread would hand a step from an older version of this flow an
 * object with keys it doesn't have, and the first `.trim()` on one of them
 * throws. Every nested object gets its own merge for that reason.
 */
const mergeDraft = (saved) => ({
  ...BLANK,
  ...saved,
  account: { ...BLANK.account, ...saved?.account },
  property: { ...BLANK.property, ...saved?.property },
  business: { ...BLANK.business, ...saved?.business },
  essentials: { ...BLANK.essentials, ...saved?.essentials },
  contacts: { ...saved?.contacts },
  rooms: Array.isArray(saved?.rooms) ? saved.rooms : [],
  // Keys, not just the array: a service dropped from the catalog would
  // otherwise reach `SERVICE[key]` in three screens and throw on destructure.
  services: Array.isArray(saved?.services)
    ? saved.services.filter((s) => s in SERVICE)
    : BLANK.services,
})

const loadDraft = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { data: BLANK, stepIndex: 0, furthest: 0, resumed: false }
    const saved = JSON.parse(raw)

    // Position is part of the draft: coming back to step 1 with the answers
    // already filled in reads as a bug, not a feature.
    const furthest = Math.min(saved.furthest ?? 0, STEPS.length - 1)
    const data = mergeDraft(saved.data)

    // …except the password, which is never saved. Resuming past the account
    // step would carry an empty one all the way to "Go live" and fail there,
    // which is how a wizard sends {"password": ""} to an API.
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
  // How far they've been: lets them jump back to a finished step and return.
  const [furthest, setFurthest] = useState(draft.furthest)
  const [showErrors, setShowErrors] = useState(false)
  const [resumed, setResumed] = useState(draft.resumed)

  // Onboarding is long enough that a refresh mid-way shouldn't cost the work.
  useEffect(() => {
    try {
      // The password is deliberately not part of the draft: a credential left
      // in localStorage outlives the tab, the session and the person.
      const { password: _pw, confirmPassword: _confirm, ...account } = data.account
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ data: { ...data, account }, stepIndex, furthest }),
      )
    } catch {
      /* private mode — the draft just won't survive a refresh */
    }
  }, [data, stepIndex, furthest])

  // A step change is a new screen, not a scroll position to keep.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [stepIndex])

  const accountStep = STEPS.findIndex((s) => s.key === 'account')
  const step = STEPS[stepIndex]
  const patch = (key, value) => setData((d) => ({ ...d, [key]: value }))

  const errors = useMemo(() => validate(step.key, data), [step.key, data])
  const canContinue = Object.keys(errors).length === 0

  /**
   * Re-check every step before submitting, not just the one on screen. A step
   * can become invalid after you've walked past it — the password is dropped
   * on a refresh — and finding that out from a 400 is not finding it out.
   */
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

  const reset = () => {
    setResumed(false)
    setData(BLANK)
    setStepIndex(0)
    setFurthest(0)
    setShowErrors(false)
  }

  return (
    <div className="min-h-dvh bg-onb-bg text-onb-text">
      <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col">
        {/* Header — where you are, and the way back. Sticky, because the
            answer to "which step is this" shouldn't need a scroll. */}
        <header className="print-hide sticky top-0 z-10 bg-onb-bg/95 px-5 pt-safe backdrop-blur">
          <div className="flex items-center gap-3 pb-3">
            <button
              type="button"
              onClick={back}
              disabled={stepIndex === 0}
              aria-label="Back"
              className="-ml-2 grid size-11 shrink-0 place-items-center rounded-xl text-onb-muted transition-colors disabled:opacity-0"
            >
              <ArrowLeft size={20} strokeWidth={2.4} />
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-onb-green">
                {String(stepIndex + 1).padStart(2, '0')} · {step.label}
              </p>
              <p className="text-[12px] text-onb-muted">
                Step {stepIndex + 1} of {STEPS.length}
              </p>
            </div>

            <Logo className="h-5 w-auto shrink-0 text-onb-text/70" />
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-onb-line">
            <div
              className="h-full rounded-full bg-onb-green transition-[width] duration-500"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </header>

        <main className="flex-1 px-5 pt-6 pb-8">
          {/* Only where it applies: the password field is on the account step,
              and a banner about passwords on the rooms screen is noise. */}
          {resumed && stepIndex === accountStep && (
            <p className="mb-5 rounded-xl bg-onb-green-soft px-4 py-3 text-[13px] leading-relaxed text-onb-green">
              Picking up where you left off. Passwords aren't saved in the
              browser, so please set yours again.
            </p>
          )}

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
              // The property exists now. Leaving the draft behind means
              // reopening /register pre-fills a wizard that can only 409.
              try {
                localStorage.removeItem(STORAGE_KEY)
              } catch {
                /* private mode — nothing was saved to remove */
              }
              return result
            }}
          />
        </main>

        {/* The action, pinned under the thumb and clear of the home indicator. */}
        {!step.final && (
          <div className="print-hide sticky bottom-0 border-t border-onb-line bg-onb-bg/95 px-5 pt-3 pb-safe backdrop-blur">
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
      const number = (data.contacts[service] ?? '').trim()
      if (!number) errors[service] = 'Add a number, or use the reception one.'
      else if (!PHONE.test(number)) errors[service] = 'Include the country code, like +91 98765 43210.'
    }
  }

  return errors
}
