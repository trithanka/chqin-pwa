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
import HotelWelcomeScreen from './screens/HotelWelcomeScreen'
import DeviceVerificationScreen from './screens/DeviceVerificationScreen'
import IdentityVerificationScreen from './screens/IdentityVerificationScreen'
import FaceScanScreen from './screens/FaceScanScreen'
import SecureDeviceScreen from './screens/SecureDeviceScreen'
import SuccessScreen from './screens/SuccessScreen'
import NewDeviceScreen from './screens/NewDeviceScreen'

/* ------------------------------------------------------------------ */
/* Flow definitions — derived for step progress                       */
/* ------------------------------------------------------------------ */

const FLOWS = {
  returning: [
    { key: 'hotelWelcome', label: 'Welcome', Screen: HotelWelcomeScreen },
    { key: 'deviceVerify', label: 'Verify', Screen: DeviceVerificationScreen },
    {
      key: 'done',
      label: 'Done',
      Screen: SuccessScreen,
      final: true,
      fullBleed: true,
    },
  ],
  firstTime: [
    { key: 'hotelWelcome', label: 'Welcome', Screen: HotelWelcomeScreen },
    { key: 'identity', label: 'Identity', Screen: IdentityVerificationScreen },
    { key: 'faceScan', label: 'Face Scan', Screen: FaceScanScreen },
    { key: 'secureDevice', label: 'Secure', Screen: SecureDeviceScreen },
    {
      key: 'done',
      label: 'Done',
      Screen: SuccessScreen,
      final: true,
      fullBleed: true,
    },
  ],
  newDevice: [
    { key: 'hotelWelcome', label: 'Welcome', Screen: HotelWelcomeScreen },
    { key: 'identity', label: 'Verify', Screen: IdentityVerificationScreen },
    { key: 'secureDevice', label: 'Secure', Screen: SecureDeviceScreen },
    {
      key: 'done',
      label: 'Done',
      Screen: SuccessScreen,
      final: true,
      fullBleed: true,
    },
  ],
}

const HELP = {
  hotelWelcome: 'Confirm hotel details match your booking. The system automatically detects your check-in state.',
  deviceVerify: 'Verify identity using your phone’s Face ID or fingerprint.',
  identity: 'Lay your government ID flat in good light inside the frame.',
  faceScan: 'Look straight at the camera.',
  secureDevice: 'Enable Face ID or fingerprint access.',
  done: 'Check-in is complete! Enjoy your stay at Hotel Aurora.',
}

export default function App() {
  const [activeMode, setActiveMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const modeParam = params.get('mode') || params.get('flow')
      if (modeParam && ['returning', 'firstTime', 'newDevice'].includes(modeParam)) {
        return modeParam
      }
    }
    return 'returning'
  })

  const [flowStarted, setFlowStarted] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [toast, setToast] = useState(null)
  const toastTimer = useRef(null)

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const showToast = useCallback((message) => {
    clearTimeout(toastTimer.current)
    setToast({ id: Date.now(), message })
    toastTimer.current = setTimeout(() => setToast(null), 2600)
  }, [])

  const currentFlowSteps = FLOWS[activeMode] || FLOWS.returning
  const step = flowStarted ? currentFlowSteps[stepIndex] : currentFlowSteps[0]

  const reset = () => {
    setFlowStarted(false)
    setStepIndex(0)
    setExitOpen(false)
  }

  const startFlow = (modeName) => {
    if (modeName) setActiveMode(modeName)
    setFlowStarted(true)
    setStepIndex(1) // Advance from Welcome screen to next step
  }

  const next = useCallback(() => setStepIndex((i) => i + 1), [])

  const back = () => {
    if (stepIndex <= 1) reset()
    else setStepIndex((i) => i - 1)
  }

  const screenProps = {
    next,
    showToast,
    onDone: reset,
    onStartFlow: startFlow,
    activeMode,
    setMode: setActiveMode,
  }

  const showChrome = flowStarted && !step?.final

  return (
    <div className="grid min-h-dvh place-items-center sm:p-6 bg-slate-200/80">
      {/* Phone shell — 390px centered mobile layout */}
      <div
        id="phone-shell"
        className="relative flex h-dvh w-full max-w-[390px] flex-col overflow-hidden bg-white sm:h-[844px] sm:max-h-[calc(100dvh-3rem)] sm:rounded-[40px] sm:border-[8px] sm:border-slate-900 sm:shadow-[0_25px_70px_rgba(15,23,42,0.25)]"
      >
        <Toast toast={toast} />

        {/* Header — Back / Help / Close on in-flow screens */}
        {flowStarted && !step?.fullBleed && (
          <header className="pt-safe z-20 flex shrink-0 items-center justify-between px-6 pb-2.5 sm:pt-6 bg-white">
            {step?.final ? (
              <span className="size-9" />
            ) : (
              <IconButton icon={ChevronLeft} label="Back" onClick={back} />
            )}
            <p className="text-[12px] font-extrabold tracking-tight uppercase text-blue-600">
              Check-In
            </p>
            <div className="flex items-center gap-1.5">
              <IconButton
                icon={CircleQuestionMark}
                label="Help"
                onClick={() => setHelpOpen(true)}
              />
              {!step?.final && (
                <IconButton
                  icon={X}
                  label="Close"
                  onClick={() => setExitOpen(true)}
                />
              )}
            </div>
          </header>
        )}

        {/* Screen Viewport */}
        <main className="no-scrollbar relative flex-1 overflow-y-auto bg-white">
          <AnimatePresence mode="wait" initial={false}>
            {!flowStarted ? (
              <HotelWelcomeScreen
                key="welcome-entry"
                onStartFlow={startFlow}
                activeMode={activeMode}
                setMode={setActiveMode}
              />
            ) : (
              <step.Screen key={`${activeMode}-${step.key}`} {...screenProps} />
            )}
          </AnimatePresence>
        </main>

        {/* Bottom progress indicator + stepper */}
        {showChrome && (
          <footer className="pb-safe glass z-20 shrink-0 border-t border-slate-200/80 px-6 pt-3.5 sm:pb-5">
            <div className="mb-3 flex items-center justify-between">
              <Stepper steps={currentFlowSteps.map((s) => s.label)} current={stepIndex} />
              <span className="text-[11px] font-bold text-slate-400">
                {stepIndex + 1}/{currentFlowSteps.length}
              </span>
            </div>
            <ProgressBar value={(stepIndex + 1) / currentFlowSteps.length} />
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
            Need desk support? Tap the bell at reception or call{' '}
            <span className="font-bold text-slate-900">+91 22 4000 0000</span>.
          </div>
        </BottomSheet>

        <Modal
          open={exitOpen}
          onClose={() => setExitOpen(false)}
          title="Leave check-in?"
          body="Your current session progress will be reset."
          confirmLabel="Exit Session"
          onConfirm={reset}
        />
      </div>
    </div>
  )
}
