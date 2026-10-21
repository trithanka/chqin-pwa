import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { recordBasicIdentity } from '../checkin'

const inputClass =
  'h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[16px] font-medium text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/12'

/**
 * The identity step for a venue without Aadhaar: name, date of birth and address,
 * and a mobile number if they want to give one. Same place in the journey as the
 * Aadhaar check, and it leads to the same passkey step, so a returning guest is
 * still recognised.
 */
export default function BasicIdentityScreen({ session, patchSession, next, direction }) {
  const [name, setName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const digits = phone.replace(/\D/g, '')
  const today = new Date().toISOString().slice(0, 10)
  const ready =
    name.trim().length >= 2 &&
    Boolean(dateOfBirth) &&
    address.trim().length >= 5 &&
    (digits.length === 0 || digits.length >= 10)
  const isHotel = session.flow === 'hotel'

  const submit = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await recordBasicIdentity(session.sessionId, {
        name: name.trim(),
        dateOfBirth,
        address: address.trim(),
        phone: phone.trim(),
      })
      patchSession({ verificationId: result.verificationId, subject: result.subject })
      next()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen direction={direction} className="justify-between pt-7 pb-8 px-7">
      <form onSubmit={submit}>
        <ScreenTitle
          title={isHotel ? 'Who’s checking in?' : 'Who’s visiting?'}
          subtitle="Your name, date of birth and address. Set up once on this phone."
        />
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-[12px] font-bold text-slate-500">Full name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              maxLength={120}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-bold text-slate-500">Date of birth</span>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              min="1900-01-01"
              max={today}
              autoComplete="bday"
              className={inputClass}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-bold text-slate-500">Address</span>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              autoComplete="street-address"
              rows={3}
              maxLength={300}
              placeholder="House, street, city, PIN"
              className={`${inputClass} h-auto py-3`}
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-[12px] font-bold text-slate-500">
              Mobile number <span className="font-medium text-slate-400">(optional)</span>
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              maxLength={16}
              placeholder="98765 43210"
              className={inputClass}
            />
          </label>
        </div>
        <p className="mt-3 min-h-[20px] text-[13.5px] font-medium text-red-600">{error}</p>
      </form>

      <div className="pt-6">
        <PrimaryButton onClick={submit} loading={busy} disabled={!ready} icon={ArrowRight}>
          Continue
        </PrimaryButton>
      </div>
    </Screen>
  )
}
