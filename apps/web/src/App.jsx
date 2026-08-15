import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { ChevronLeft, CircleQuestionMark, X } from 'lucide-react'
import {
  BottomSheet,
  IconButton,
  Modal,
  ProgressBar,
  Stepper,
  Toast,
} from './components/ui'
import ScanScreen from './screens/ScanScreen'
import HotelWelcomeScreen from './screens/HotelWelcomeScreen'
import DeviceVerificationScreen from './screens/DeviceVerificationScreen'
import IdentityVerificationScreen from './screens/IdentityVerificationScreen'
import SecureDeviceScreen from './screens/SecureDeviceScreen'
import SuccessScreen from './screens/SuccessScreen'
import { forgetDevice } from './device'
import {
  attachBooking,
  authenticate,
  clearTokenFromLocation,
  completeCheckin,
  enrolDevice,
  start,
  tokenFromLocation,
  verifyIdentity,
} from './checkin'

/* ------------------------------------------------------------------ */
/* Flow definitions — derived for step progress                       */
/* ------------------------------------------------------------------ */

// `bare` and `final` screens carry their own layout — no header, no stepper.
const welcome = { key: 'hotelWelcome', label: 'Welcome', Screen: HotelWelcomeScreen, bare: true }
const done = { key: 'done', label: 'Done', Screen: SuccessScreen, final: true, fullBleed: true }

const FLOWS = {
  returning: [welcome, { key: 'deviceVerify', label: 'Verify', Screen: DeviceVerificationScreen }, done],
  firstTime: [
    welcome,
    { key: 'identity', label: 'Identity', Screen: IdentityVerificationScreen },
    { key: 'secureDevice', label: 'Secure', Screen: SecureDeviceScreen },
    done,
  ],
  newDevice: [
    welcome,
    { key: 'identity', label: 'Confirm', Screen: IdentityVerificationScreen },
    { key: 'secureDevice', label: 'Secure', Screen: SecureDeviceScreen },
    done,
  ],
}

const HELP = {
  hotelWelcome: 'Confirm the details match your booking. ChqIn works out the rest from your device.',
  deviceVerify: 'Whatever unlocks your phone releases the passkey stored on it. ChqIn only ever sees the signed proof.',
  findBooking: 'The code on the desk knows the hotel but not you. Your last name is usually enough — only today\'s arrivals are searched.',
  identity: 'Lay your government ID flat in good light inside the frame. This is a one-time step.',
  secureDevice: 'Creates a passkey for this device, protected by your phone’s own unlock. The private key never leaves your phone.',
  done: 'Check-in is complete. Enjoy your stay.',
}

export default function App() {
  // 'scan' → waiting for a QR. 'flow' → a live session with the server.
  const [phase, setPhase] = useState('scan')
  const [session, setSession] = useState(null)
  const [checkin, setCheckin] = useState(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message })
    toastTimer.current = setTimeout(() => setToast(null), 3200)
  }, [])

  const activeMode = session?.journey ?? 'firstTime'

  // A check-in doesn't need a reservation: it records that this person arrived
  // here. When the QR already carries a booking the room shows up anyway; when
  // it doesn't, nobody is asked to go and find one.
  //
  // screens/FindBookingScreen.jsx is still in the tree — importing it and
  // splicing it in after the welcome step is the one change needed if matching
  // a reservation becomes required again.
  const currentFlowSteps = FLOWS[activeMode]

  const step = currentFlowSteps[stepIndex]

  /* -------------------------------------------------------------- */
  /* Starting a session                                              */
  /* -------------------------------------------------------------- */

  const begin = useCallback(
    async (token) => {
      const started = await start(token)
      clearTokenFromLocation()
      setSession({ ...started, needsBooking: !started.booking })
      setStepIndex(0)
      setPhase('flow')
      return started
    },
    [],
  )

  // A QR opened by the phone's camera app arrives as /c/<token> rather than
  // through our scanner, so that path starts the same conversation.
  useEffect(() => {
    const token = tokenFromLocation()
    if (!token) return
    begin(token).catch((err) => {
      clearTokenFromLocation()
      showToast(err.message)
    })
  }, [begin, showToast])

  const reset = useCallback(() => {
    setPhase('scan')
    setSession(null)
    setCheckin(null)
    setStepIndex(0)
    setExitOpen(false)
  }, [])

  const next = useCallback(() => setStepIndex((i) => i + 1), [])

  const back = () => {
    if (stepIndex <= 0) reset()
    else setStepIndex((i) => i - 1)
  }

  /* -------------------------------------------------------------- */
  /* The steps, each one a call to the server                        */
  /* -------------------------------------------------------------- */

  /** Records the one-time check and returns the id enrolment needs. */
  const runIdentityCheck = useCallback(async () => {
    const { verificationId } = await verifyIdentity(session.sessionId)
    setSession((s) => ({ ...s, verificationId }))
    return verificationId
  }, [session])

  /** Enrol this device, then finish. First-time and new-device end here. */
  const runEnrolment = useCallback(async () => {
    await enrolDevice(session.sessionId, session.verificationId ?? null)
    const result = await completeCheckin(session.sessionId, session.idempotencyKey)
    setCheckin(result)
  }, [session])

  /** Prove an existing passkey, then finish. */
  const runAuthentication = useCallback(async () => {
    await authenticate(session.sessionId)
    const result = await completeCheckin(session.sessionId, session.idempotencyKey)
    setCheckin(result)
  }, [session])

  /**
   * A rejected assertion means this device isn't the one the server knows, so
   * send the guest down the new-device path rather than dead-ending them.
   */
  const fallBackToNewDevice = useCallback(() => {
    setSession((s) => ({ ...s, journey: 'newDevice' }))
    setStepIndex(0)
  }, [])

  /** Names the reservation, which also gives the passkey a name to show. */
  const linkBooking = useCallback(
    async (lookup) => {
      const { booking } = await attachBooking(session.sessionId, lookup)
      setSession((s) => ({ ...s, booking }))
      return booking
    },
    [session],
  )

  const screenProps = {
    next,
    attachBooking: linkBooking,
    showToast,
    onDone: reset,
    onRescan: reset,
    activeMode,
    session,
    checkin,
    runIdentityCheck,
    runEnrolment,
    runAuthentication,
    fallBackToNewDevice,
  }

  const trackedSteps = currentFlowSteps.filter((s) => !s.bare && !s.final)
  const trackedIndex = trackedSteps.indexOf(step)
  const showChrome =
    phase === 'flow' && !step?.final && !step?.bare && trackedSteps.length > 1

  return (
    <div className="grid min-h-dvh place-items-center sm:p-6 bg-slate-200/80">
      {/* Phone shell — 390px centered mobile layout */}
      <div
        id="phone-shell"
        className="relative flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-white sm:h-[844px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[40px] sm:border-[8px] sm:border-slate-900 sm:shadow-[0_25px_70px_rgba(15,23,42,0.25)]"
      >
        <Toast toast={toast} />

        {phase === 'flow' && !step?.fullBleed && !step?.bare && (
          <header className="pt-safe z-20 flex shrink-0 items-center justify-between px-6 pb-2.5 sm:pt-6 bg-white">
            <IconButton icon={ChevronLeft} label="Back" onClick={back} />
            <p className="text-[12px] font-extrabold tracking-tight uppercase text-blue-600">
              Check-In
            </p>
            <div className="flex items-center gap-1.5">
              <IconButton
                icon={CircleQuestionMark}
                label="Help"
                onClick={() => setHelpOpen(true)}
              />
              <IconButton icon={X} label="Close" onClick={() => setExitOpen(true)} />
            </div>
          </header>
        )}

        <main className="no-scrollbar relative flex-1 overflow-y-auto bg-white">
          <AnimatePresence mode="wait" initial={false}>
            {phase === 'scan' ? (
              <ScanScreen
                key="scan"
                onToken={(token) =>
                  begin(token).catch((err) => showToast(err.message))
                }
                onForgetDevice={() => {
                  forgetDevice()
                  showToast('This device will be treated as new')
                }}
              />
            ) : (
              <step.Screen key={`${activeMode}-${step.key}`} {...screenProps} />
            )}
          </AnimatePresence>
        </main>

        {showChrome && (
          <footer className="pb-safe glass z-20 shrink-0 border-t border-slate-200/80 px-6 pt-3.5 sm:pb-5">
            <div className="mb-3 flex items-center justify-between">
              <Stepper steps={trackedSteps.map((s) => s.label)} current={trackedIndex} />
              <span className="text-[11px] font-bold text-slate-400">
                {trackedIndex + 1}/{trackedSteps.length}
              </span>
            </div>
            <ProgressBar value={(trackedIndex + 1) / trackedSteps.length} />
          </footer>
        )}

        <BottomSheet
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
          title="Need Assistance?"
        >
          <p className="text-[14px] leading-relaxed text-slate-500">
            {HELP[step?.key] ?? HELP.hotelWelcome}
          </p>
          <div className="mt-4 rounded-2xl bg-blue-50/50 px-4 py-3.5 text-[13px] text-slate-600 border border-blue-100/60">
            Need help? Ask at the desk — they can check you in by hand.
          </div>
        </BottomSheet>

        <Modal
          open={exitOpen}
          onClose={() => setExitOpen(false)}
          title="Leave check-in?"
          body="You'll need to scan the code again to start over."
          confirmLabel="Leave"
          onConfirm={reset}
        />
      </div>
    </div>
  )
}
