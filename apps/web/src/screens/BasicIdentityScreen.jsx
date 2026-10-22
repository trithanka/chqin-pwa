import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { recordBasicIdentity } from '../checkin'

const inputClass =
  'h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[16px] font-medium text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/12'

// What the venue asks when it never changed anything.
const DEFAULT_FORM = { dateOfBirth: 'required', address: 'required', phone: 'optional', extra: [] }

function Label({ text, optional }) {
  return (
    <span className="text-[12px] font-bold text-slate-500">
      {text} {optional && <span className="font-medium text-slate-400">(optional)</span>}
    </span>
  )
}

/**
 * The identity step for a venue without Aadhaar: the name, plus whatever the
 * venue's form asks (date of birth, address, mobile, and its own questions).
 * Same place in the journey as the Aadhaar check, and it leads to the same
 * passkey step, so a returning guest is still recognised.
 */
export default function BasicIdentityScreen({ session, patchSession, next, direction }) {
  const form = session.identityForm ?? DEFAULT_FORM
  const [name, setName] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [extra, setExtra] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const asks = (key) => form[key] !== 'off'
  const optional = (key) => form[key] === 'optional'
  const digits = phone.replace(/\D/g, '')
  const today = new Date().toISOString().slice(0, 10)
  const ready =
    name.trim().length >= 2 &&
    (form.dateOfBirth !== 'required' || Boolean(dateOfBirth)) &&
    (form.address !== 'required' || address.trim().length >= 5) &&
    (form.phone !== 'required' ? digits.length === 0 || digits.length >= 10 : digits.length >= 10) &&
    form.extra.every((f) => !f.required || extra[f.key]?.trim())
  const isHotel = session.flow === 'hotel'

  const submit = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await recordBasicIdentity(session.sessionId, {
        name: name.trim(),
        ...(asks('dateOfBirth') && dateOfBirth ? { dateOfBirth } : {}),
        ...(asks('address') && address.trim() ? { address: address.trim() } : {}),
        ...(asks('phone') && phone.trim() ? { phone: phone.trim() } : {}),
        extra,
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
          subtitle="A few details for the venue. Set up once on this phone."
        />
        <div className="grid gap-4">
          <label className="grid gap-1.5">
            <Label text="Full name" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              autoCapitalize="words"
              maxLength={120}
              className={inputClass}
            />
          </label>
          {asks('dateOfBirth') && (
            <label className="grid gap-1.5">
              <Label text="Date of birth" optional={optional('dateOfBirth')} />
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
          )}
          {asks('address') && (
            <label className="grid gap-1.5">
              <Label text="Address" optional={optional('address')} />
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
          )}
          {asks('phone') && (
            <label className="grid gap-1.5">
              <Label text="Mobile number" optional={optional('phone')} />
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
          )}
          {form.extra.map((f) => (
            <label key={f.key} className="grid gap-1.5">
              <Label text={f.label} optional={!f.required} />
              {f.kind === 'choice' ? (
                <select
                  value={extra[f.key] ?? ''}
                  onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={extra[f.key] ?? ''}
                  onChange={(e) => setExtra({ ...extra, [f.key]: e.target.value })}
                  maxLength={200}
                  className={inputClass}
                />
              )}
            </label>
          ))}
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
