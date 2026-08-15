import { useState } from 'react'
import { ArrowRight, Search } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'

/**
 * NOT CURRENTLY IN THE FLOW. A check-in no longer requires a reservation, so
 * nobody is asked to find one; re-insert this step in App.jsx if matching a
 * booking becomes required again.
 *
 * Shown when the scanned code doesn't already know the reservation — a desk
 * card identifies the venue, not the guest.
 *
 * It comes before the identity check and the passkey on purpose: without a
 * booking there is nothing to check into, and enrolling first would leave a
 * credential belonging to "Guest" on the phone of someone who never got in.
 */
export default function FindBookingScreen({ next, session, attachBooking }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e?.preventDefault()
    if (busy || value.trim().length < 2) return

    setBusy(true)
    setError(null)
    try {
      await attachBooking(value.trim())
      next()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title="Find your booking"
          subtitle={`Your last name, or the reference from your confirmation${
            session?.venue?.name ? ` at ${session.venue.name}` : ''
          }.`}
        />

        <form onSubmit={submit}>
          <div className="relative">
            <Search
              size={17}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Sharma, or AUR-4821"
              autoComplete="off"
              autoCapitalize="words"
              autoFocus
              className={`h-14 w-full rounded-[20px] border bg-white pl-11 pr-4 text-[16px] font-medium text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/12 ${
                error ? 'border-red-300' : 'border-slate-200 focus:border-blue-600'
              }`}
            />
          </div>

          {/* A 16px font size keeps iOS from zooming the page on focus. */}
          <div className="mt-3 min-h-[40px]">
            {error ? (
              <p className="text-[13.5px] font-medium leading-relaxed text-red-600">{error}</p>
            ) : (
              <p className="text-[13px] leading-relaxed text-slate-500">
                Only today's arrivals are searched, so a name is usually enough.
              </p>
            )}
          </div>
        </form>
      </div>

      <div className="pt-6">
        <PrimaryButton
          onClick={submit}
          loading={busy}
          disabled={value.trim().length < 2}
          icon={busy ? undefined : ArrowRight}
          tone="brand"
        >
          Continue
        </PrimaryButton>
      </div>
    </Screen>
  )
}
