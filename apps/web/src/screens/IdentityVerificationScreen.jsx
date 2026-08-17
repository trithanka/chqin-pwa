import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Camera, Check, ShieldCheck } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { useCamera } from '../useCamera'
import { failed, succeeded } from '../lib/haptics'

/**
 * One-time identity check, by Aadhaar.
 *
 * Typing the number is the main path because it's faster and more reliable
 * than reading a card in lobby light; the camera is the fallback for someone
 * who'd rather not type twelve digits, and it hands off to the desk.
 *
 * Three beats: number → OTP → confirm what came back. The consent tick sits on
 * the first one, next to the number: consent has to be given before the number
 * reaches UIDAI, and the OKYC call carries it as a required field. The last beat
 * confirms the record that came back is the right person, nothing more.
 */

const CONSENT_TEXT =
  'I agree to ChqIn verifying my identity with UIDAI and sharing my name, date of birth and gender with this property for its guest register.'
const CONSENT_VERSION = 'v1'

const groupAadhaar = (value) =>
  value
    .replace(/\D/g, '')
    .slice(0, 12)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
    .trim()

/** The agreement UIDAI requires before the number is sent, in the guest's words. */
function ConsentTick({ checked, onChange }) {
  return (
    <label className="mt-1 flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 flex size-5 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer size-5 appearance-none rounded-md border-2 border-slate-300 transition-colors checked:border-blue-600 checked:bg-blue-600"
        />
        <Check
          size={13}
          strokeWidth={3.4}
          className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
        />
      </span>
      <span className="text-[12.5px] leading-relaxed text-slate-600">{CONSENT_TEXT}</span>
    </label>
  )
}

export default function IdentityVerificationScreen({
  next,
  activeMode,
  requestOtp,
  verifyOtp,
  recordCapture,
  direction,
}) {
  const [stage, setStage] = useState('number') // number | otp | confirm
  const [aadhaar, setAadhaar] = useState('')
  const [otp, setOtp] = useState('')
  const [request, setRequest] = useState(null)
  const [subject, setSubject] = useState(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [scanning, setScanning] = useState(false)

  const camera = useCamera()
  const otpRef = useRef(null)
  const recovering = activeMode === 'newDevice'

  useEffect(() => {
    if (stage === 'otp') otpRef.current?.focus()
  }, [stage])

  const digits = aadhaar.replace(/\s/g, '')

  const sendOtp = async () => {
    if (busy || digits.length !== 12 || !consent) return
    setBusy(true)
    setError(null)
    try {
      setRequest(await requestOtp(digits))
      setOtp('')
      setStage('otp')
    } catch (err) {
      failed()
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const confirmOtp = async () => {
    if (busy || otp.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const result = await verifyOtp(request.requestId, otp, {
        accepted: true,
        version: CONSENT_VERSION,
        text: CONSENT_TEXT,
      })
      succeeded()
      setSubject(result.subject)
      setStage('confirm')
    } catch (err) {
      failed()
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  /** The camera path: a photo for the desk, then back to the number. */
  const capture = async () => {
    camera.capture()
    setScanning(false)
    setBusy(true)
    try {
      await recordCapture()
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen direction={direction} className="justify-between pt-7 pb-8 px-7">
      <AnimatePresence mode="wait">
        {/* ── the number ─────────────────────────────────────────────── */}
        {stage === 'number' && (
          <motion.div
            key="number"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex-1"
          >
            <ScreenTitle
              title={recovering ? 'Confirm it’s you' : 'Verify your identity'}
              subtitle={
                recovering
                  ? 'A quick check before this device gets its own passkey.'
                  : 'Once. Every stay after this is just your phone.'
              }
            />

            {scanning ? (
              <div className="mt-2">
                <div className="relative aspect-[1.586] w-full overflow-hidden rounded-[24px] border-2 border-blue-600 bg-slate-900">
                  <video ref={camera.videoRef} playsInline muted autoPlay className="size-full object-cover" />
                </div>
                <p className="mt-3 text-center text-[13px] text-slate-500">
                  Fit the card in the frame
                </p>
                <div className="mt-4 flex gap-2.5">
                  <PrimaryButton onClick={capture} icon={Camera} tone="dark">
                    Capture
                  </PrimaryButton>
                </div>
              </div>
            ) : (
              <>
                <label className="block">
                  <span className="text-[13px] font-semibold text-slate-700">
                    Aadhaar number
                  </span>
                  <input
                    value={aadhaar}
                    onChange={(e) => setAadhaar(groupAadhaar(e.target.value))}
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="1234 5678 9012"
                    className={`mt-1.5 h-14 w-full rounded-[20px] border bg-white px-4 text-[19px] font-semibold tracking-[0.08em] tabular-nums text-slate-900 transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-blue-500/12 ${
                      error ? 'border-red-300' : 'border-slate-200 focus:border-blue-600'
                    }`}
                  />
                </label>

                <div className="mt-2.5 min-h-[38px]">
                  {error ? (
                    <p className="text-[13px] font-medium leading-snug text-red-600">{error}</p>
                  ) : (
                    <p className="text-[12.5px] leading-snug text-slate-500">
                      We send a code to the mobile registered with your Aadhaar.
                      The number itself is never stored.
                    </p>
                  )}
                </div>

                <ConsentTick checked={consent} onChange={setConsent} />

                {/* The secondary path, deliberately quieter */}
                <button
                  type="button"
                  onClick={() => {
                    setScanning(true)
                    camera.start()
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-slate-500 transition-colors hover:text-blue-600"
                >
                  <Camera size={15} strokeWidth={2.2} />
                  Scan the card instead
                </button>
              </>
            )}
          </motion.div>
        )}

        {/* ── the code ───────────────────────────────────────────────── */}
        {stage === 'otp' && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex-1"
          >
            <ScreenTitle
              title="Enter the code"
              subtitle={`Sent to ${request?.sentTo ?? 'your registered mobile'} for ${request?.maskedAadhaar}.`}
            />

            <input
              ref={otpRef}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="······"
              className={`h-16 w-full rounded-[20px] border bg-white text-center text-[28px] font-bold tracking-[0.4em] tabular-nums text-slate-900 transition-colors placeholder:tracking-[0.3em] placeholder:text-slate-200 focus:outline-none focus:ring-4 focus:ring-blue-500/12 ${
                error ? 'border-red-300' : 'border-slate-200 focus:border-blue-600'
              }`}
            />

            <div className="mt-3 min-h-[38px]">
              {error ? (
                <p className="text-[13px] font-medium text-red-600">{error}</p>
              ) : (
                <p className="text-[12.5px] text-slate-500">
                  The code is valid for five minutes.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setStage('number')
                setError(null)
              }}
              className="text-[13px] font-semibold text-slate-500 transition-colors hover:text-blue-600"
            >
              Wrong number? Change it
            </button>
          </motion.div>
        )}

        {/* ── what came back ─────────────────────────────────────────── */}
        {stage === 'confirm' && subject && (
          <motion.div
            key="confirm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex-1"
          >
            <ScreenTitle title="Is this you?" subtitle="Straight from your Aadhaar record." />

            <div className="rounded-[24px] border border-slate-200/80 bg-white shadow-[var(--shadow-soft)]">
              <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-emerald-600">
                <ShieldCheck size={16} strokeWidth={2.3} />
                <span className="text-[12.5px] font-bold uppercase tracking-[0.1em]">Verified</span>
              </div>

              <dl className="px-5 py-1">
                {[
                  ['Name', subject.name],
                  ['Date of birth', subject.dateOfBirth],
                  ['Gender', subject.gender],
                  ['Aadhaar', subject.maskedAadhaar],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-3 last:border-0"
                  >
                    <dt className="text-[12.5px] font-medium text-slate-400">{label}</dt>
                    <dd className="text-right text-[14px] font-semibold capitalize text-slate-900">
                      {/* A partial Aadhaar record can be missing a field; the row stays. */}
                      {value || 'Not on record'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {error && <p className="mt-3 text-[13px] font-medium text-red-600">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pt-6">
        {stage === 'number' && !scanning && (
          <PrimaryButton
            onClick={sendOtp}
            loading={busy}
            disabled={digits.length !== 12 || !consent}
            icon={ArrowRight}
            tone="brand"
          >
            Send OTP
          </PrimaryButton>
        )}

        {stage === 'otp' && (
          <PrimaryButton
            onClick={confirmOtp}
            loading={busy}
            disabled={otp.length !== 6}
            icon={ArrowRight}
            tone="brand"
          >
            Verify
          </PrimaryButton>
        )}

        {stage === 'confirm' && (
          <PrimaryButton onClick={next} icon={ArrowRight} tone="success">
            Yes, continue
          </PrimaryButton>
        )}
      </div>
    </Screen>
  )
}
