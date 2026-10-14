import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { recordBasicIdentity } from '../checkin'

const inputClass =
  'h-14 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-[16px] font-medium text-slate-900 transition-colors placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/12'

/**
 * The identity step for a venue that doesn't ask for Aadhaar: who you are, and a
 * number to reach you on. Same place in the journey as the Aadhaar check, and it
 * leads to the same passkey step, so a returning visitor is still recognised.
 */
export default function BasicIdentityScreen({ session, patchSession, next, direction }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const digits = phone.replace(/\D/g, '')
  const ready = name.trim().length >= 2 && digits.length >= 10

  const submit = async (e) => {
    e?.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await recordBasicIdentity(session.sessionId, name.trim(), phone.trim())
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
          title="Who’s visiting?"
          subtitle="Your name and a number we can reach you on. Set up once on this phone."
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
            <span className="text-[12px] font-bold text-slate-500">Mobile number</span>
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
