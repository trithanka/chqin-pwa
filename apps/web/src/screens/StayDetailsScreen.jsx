import { useState } from 'react'
import { ArrowRight, BedDouble, Minus, Moon, Plus, Users } from 'lucide-react'
import { PrimaryButton, Screen } from '../components/ui'
import { tapped } from '../lib/haptics'

const NIGHTS = [1, 2, 3, 4, 5, 6, 7]
const MAX_GUESTS = 6
const MAX_ROOMS = 4

/** The date the guest would leave */
const checkoutOn = (nights) => {
  const d = new Date()
  d.setDate(d.getDate() + nights)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** Segmented Nights 7-Column Grid (Fits 100% of mobile width with zero overflow) */
function NightsRow({ value, onChange }) {
  return (
    <fieldset>
      <div className="flex items-center justify-between mb-2.5">
        <legend className="text-[14px] font-bold tracking-[-0.01em] text-slate-900">
          How many nights?
        </legend>
        <span className="rounded-lg bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-bold text-blue-700">
          Until {checkoutOn(value)}
        </span>
      </div>

      <div className="grid grid-cols-7 gap-1.5 w-full">
        {NIGHTS.map((n) => {
          const isSelected = value === n
          const isMax = n === NIGHTS.at(-1)

          return (
            <label
              key={n}
              className="group cursor-pointer select-none"
            >
              <input
                type="radio"
                name="nights"
                value={n}
                checked={isSelected}
                onChange={() => {
                  tapped()
                  onChange(n)
                }}
                className="peer sr-only"
              />
              <div
                className={`flex h-12 w-full flex-col items-center justify-center rounded-xl border text-center transition-all duration-150 group-active:scale-[0.93] ${
                  isSelected
                    ? 'border-blue-600 bg-gradient-to-b from-blue-600 to-blue-700 text-white shadow-[0_6px_18px_rgba(37,99,235,0.28)]'
                    : 'border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 shadow-2xs'
                }`}
              >
                <span className="text-[15.5px] font-extrabold tabular-nums leading-none">
                  {n}{isMax ? '+' : ''}
                </span>
                <span
                  className={`mt-1 text-[9px] font-bold uppercase tracking-tight ${
                    isSelected ? 'text-blue-100' : 'text-slate-400'
                  }`}
                >
                  {n === 1 ? 'Night' : 'Nights'}
                </span>
              </div>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

/** Tactile Stepper Button */
function StepperButton({ icon: Icon, label, onClick, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        tapped()
        onClick()
      }}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200/80 bg-slate-50 text-slate-700 transition-all active:scale-90 active:bg-slate-200 disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
    >
      <Icon size={16} strokeWidth={2.6} />
    </button>
  )
}

/** Clean Tactile Stepper Card */
function StepperCard({ icon: Icon, label, hint, value, onChange, min = 1, max = 6 }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          <Icon size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-bold tracking-[-0.01em] text-slate-900 leading-snug">
            {label}
          </p>
          <p className="text-[12px] font-medium text-slate-400 truncate">
            {hint}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <StepperButton
          icon={Minus}
          label={`Fewer — ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        />
        <span className="w-8 text-center text-[16.5px] font-extrabold tabular-nums text-slate-900">
          {value}
        </span>
        <StepperButton
          icon={Plus}
          label={`More — ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        />
      </div>
    </div>
  )
}

export default function StayDetailsScreen({ next, patchSession, direction }) {
  const [nights, setNights] = useState(1)
  const [partySize, setPartySize] = useState(1)
  const [roomsCount, setRoomsCount] = useState(1)

  const submit = () => {
    patchSession({ stay: { nights, partySize, roomsCount } })
    next()
  }

  return (
    <Screen direction={direction} className="justify-between pt-2 pb-6">
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-blue-600 mb-1.5">
            Walk-in
          </p>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.035em] text-slate-900">
            About your stay
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500 font-medium">
            So the desk knows what to get ready. You can change any of it when you get there.
          </p>
        </div>

        {/* Nights Selector */}
        <NightsRow value={nights} onChange={setNights} />

        {/* Steppers */}
        <div className="space-y-2.5">
          <StepperCard
            icon={Users}
            label="Guests"
            hint="Including you"
            value={partySize}
            onChange={setPartySize}
            min={1}
            max={MAX_GUESTS}
          />
          <StepperCard
            icon={BedDouble}
            label="Rooms"
            hint="Confirmed at the desk"
            value={roomsCount}
            onChange={setRoomsCount}
            min={1}
            max={MAX_ROOMS}
          />
        </div>
      </div>

      {/* Action CTA */}
      <div className="pt-4">
        <PrimaryButton onClick={submit} icon={ArrowRight}>
          Continue
        </PrimaryButton>
        <p className="mt-2.5 text-center text-[11.5px] font-medium text-slate-400">
          Nothing charged or held · Pay at the desk
        </p>
      </div>
    </Screen>
  )
}
