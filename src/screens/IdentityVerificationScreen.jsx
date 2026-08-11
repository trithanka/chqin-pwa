import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Camera, Scan } from 'lucide-react'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { DocumentScanCard } from '../components/cards'
import { useCamera } from '../useCamera'

/**
 * One-time identity check. First-time guests are creating a ChqIn Identity;
 * new-device guests already have one and are confirming they're its owner
 * before this device gets a passkey.
 *
 * The camera and the photo are real. Reading the document is not — nothing is
 * extracted from the capture and it never leaves the page.
 *
 * Where the camera is unavailable (no https, no permission) the screen falls
 * back to the stylized scan card so the flow still runs.
 */
export default function IdentityVerificationScreen({ next, activeMode }) {
  const [stage, setStage] = useState('idle') // 'idle' | 'reading' | 'done'
  const [frame, setFrame] = useState(null)
  const { status, reason, videoRef, start, capture } = useCamera()
  const recovering = activeMode === 'newDevice'

  const cameraLive = status === 'live'
  const blocked = status === 'denied' || status === 'unavailable'
  // Keep the frozen capture on screen after the stream is released; if the
  // grab failed, fall back to the stylized card rather than a black rectangle.
  const showCamera = cameraLive || (status === 'stopped' && frame)

  const handleCapture = () => {
    // Freeze the frame and release the camera now — the still is what the
    // guest looks at while the read is simulated.
    setFrame(capture())
    setStage('reading')
  }

  // Fallback path: no camera, so the stylized card animates instead.
  const handleSimulatedScan = () => setStage('reading')

  useEffect(() => {
    if (stage !== 'reading') return
    const t = setTimeout(() => setStage('done'), 1800)
    return () => clearTimeout(t)
  }, [stage])

  const cardState = stage === 'done' ? 'done' : stage === 'reading' ? 'scanning' : 'idle'

  return (
    <Screen>
      <ScreenTitle
        title={recovering ? 'Confirm it’s you' : 'Verify your identity'}
        subtitle={
          recovering
            ? 'We found your ChqIn Identity. One quick check before this device gets its own passkey.'
            : 'A one-time check. After this, your device does the work.'
        }
      />

      <div className="mt-2">
        {!showCamera ? (
          <DocumentScanCard state={cardState} />
        ) : (
          <DocumentFrame
            videoRef={videoRef}
            frame={frame}
            reading={stage === 'reading'}
            done={stage === 'done'}
          />
        )}
      </div>

      <div className="mt-6 h-6 text-center">
        <AnimatePresence mode="wait">
          <motion.p
            key={`${stage}-${status}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className={`text-[14px] font-bold tracking-tight ${
              stage === 'done' ? 'text-emerald-600' : 'text-zinc-500'
            }`}
          >
            {stage === 'done'
              ? recovering
                ? '✓ Identity confirmed'
                : '✓ Identity verified'
              : stage === 'reading'
                ? 'Reading document…'
                : cameraLive
                  ? 'Fit your ID inside the frame'
                  : (reason ?? 'Position your ID inside the frame')}
          </motion.p>
        </AnimatePresence>
      </div>

      <div className="mt-auto pt-8">
        {stage === 'done' ? (
          <PrimaryButton onClick={next} tone="success" icon={ArrowRight}>
            Continue
          </PrimaryButton>
        ) : stage === 'reading' ? (
          <PrimaryButton onClick={() => {}} loading tone="dark">
            Reading…
          </PrimaryButton>
        ) : cameraLive ? (
          <PrimaryButton onClick={handleCapture} icon={Camera} tone="dark">
            Capture ID
          </PrimaryButton>
        ) : blocked ? (
          <PrimaryButton
            onClick={handleSimulatedScan}
            loading={stage === 'reading'}
            icon={Scan}
            tone="dark"
          >
            {stage === 'reading' ? 'Reading…' : 'Continue without camera'}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={start}
            loading={status === 'requesting'}
            icon={Camera}
            tone="dark"
          >
            {status === 'requesting' ? 'Opening camera…' : 'Open camera'}
          </PrimaryButton>
        )}
      </div>
    </Screen>
  )
}

/** ID-card-shaped viewfinder: live stream, then the frozen capture. */
function DocumentFrame({ videoRef, frame, reading, done }) {
  return (
    <div
      className={`relative aspect-[1.586] w-full overflow-hidden rounded-[24px] border-2 bg-slate-900 transition-colors ${
        done ? 'border-emerald-500' : reading ? 'border-blue-600' : 'border-slate-200'
      }`}
    >
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`size-full object-cover ${frame ? 'opacity-0' : 'opacity-100'}`}
      />

      {frame && (
        <img src={frame} alt="Captured ID" className="absolute inset-0 size-full object-cover" />
      )}

      {/* Corner guides */}
      {!done &&
        [
          'left-3 top-3 rounded-tl-lg border-l-2 border-t-2',
          'right-3 top-3 rounded-tr-lg border-r-2 border-t-2',
          'bottom-3 left-3 rounded-bl-lg border-b-2 border-l-2',
          'bottom-3 right-3 rounded-br-lg border-b-2 border-r-2',
        ].map((pos) => (
          <span key={pos} className={`absolute size-8 border-white/80 ${pos}`} />
        ))}

      {reading && (
        <div className="animate-scan absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-blue-400/40 to-transparent" />
      )}

      {done && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-emerald-600/15 backdrop-blur-[1px]"
        />
      )}
    </div>
  )
}
