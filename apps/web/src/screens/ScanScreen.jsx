import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Check, QrCode } from 'lucide-react'
import Logo from '../components/Logo'
import { PrimaryButton } from '../components/ui'
import { useQrCamera } from '../useCamera'

/**
 * A desk card encodes a URL, so the scanned value is usually
 * https://app.chqin.com/c/<token> rather than a bare token. Accept both.
 */
const tokenFrom = (value) => {
  if (!value) return null
  const path = value.match(/\/c\/([A-Za-z0-9_-]{16,128})/)
  if (path) return path[1]
  return /^[A-Za-z0-9_-]{16,128}$/.test(value.trim()) ? value.trim() : null
}

/**
 * The SCAN beat — a live rear camera looking for the venue's QR code.
 *
 * Decoding needs both a secure context and `BarcodeDetector`; where either is
 * missing the camera still runs and "Continue without scanning" resolves the
 * session, so the flow is never blocked by the environment.
 *
 * The prototype controls below are device-state switches, not journey
 * pickers — detection still decides what the guest sees.
 */
export default function ScanScreen({ onToken, onForgetDevice }) {
  const [found, setFound] = useState(null)

  // The decoded value is the session token — the thing the whole flow hangs
  // off. It used to be thrown away and the app pretended to know the hotel.
  const handleDecode = useCallback((value) => setFound(tokenFrom(value)), [])
  const { status, reason, videoRef, start } = useQrCamera({ onDecode: handleDecode })

  // Hold the confirmation beat, then start the session.
  useEffect(() => {
    if (!found) return
    const t = setTimeout(() => onToken(found), 700)
    return () => clearTimeout(t)
  }, [found, onToken])

  const showVideo = status === 'live' || status === 'requesting'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-full flex-col bg-gradient-to-b from-[#090d1a] via-[#0f172a] to-[#1e293b] pt-safe pb-safe px-5 text-white [--pb-safe-min:2rem] [--pt-safe-min:3.5rem]"
    >
      <Logo className="h-7 w-auto self-start text-white" />

      <div className="mt-7">
        <h1 className="text-[30px] font-bold leading-[1.15] tracking-[-0.035em]">
          Scan.
          <br />
          You&apos;re checked in.
        </h1>
        <p className="mt-2.5 max-w-[300px] text-[13.5px] leading-relaxed text-zinc-400">
          Point your camera at the QR code on the reception desk.
        </p>
      </div>

      {/* Viewfinder — live camera behind the bracket overlay */}
      <div className="relative mx-auto mt-7 grid size-52 place-items-center">
        <div className="absolute inset-0 overflow-hidden rounded-[32px] bg-white/5 backdrop-blur-sm border border-white/10">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className={`size-full object-cover transition-opacity duration-500 ${
              showVideo && !found ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </div>

        {[
          'left-0 top-0 rounded-tl-[26px] border-l-3 border-t-3',
          'right-0 top-0 rounded-tr-[26px] border-r-3 border-t-3',
          'bottom-0 left-0 rounded-bl-[26px] border-b-3 border-l-3',
          'bottom-0 right-0 rounded-br-[26px] border-b-3 border-r-3',
        ].map((pos) => (
          <span
            key={pos}
            className={`absolute size-11 transition-colors ${
              found ? 'border-emerald-400/80' : 'border-blue-500/80'
            } ${pos}`}
          />
        ))}

        {status === 'live' && !found && (
          <div className="animate-scan pointer-events-none absolute inset-x-6 h-20 rounded-full bg-gradient-to-b from-transparent via-blue-500/45 to-transparent" />
        )}

        <div className="relative">
          {found ? (
            <motion.span
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              className="grid size-[88px] place-items-center rounded-full bg-emerald-500/15 ring-2 ring-emerald-400/40 backdrop-blur-sm"
            >
              <Check size={44} strokeWidth={2.6} className="text-emerald-400" />
            </motion.span>
          ) : (
            !showVideo && <QrCode size={88} strokeWidth={1.3} className="text-white/85" />
          )}
        </div>
      </div>

      {/* Camera status line */}
      <div className="mt-4 h-8 text-center">
        {found ? (
          <p className="text-[12.5px] font-semibold text-emerald-400">Code recognised</p>
        ) : (
          reason && (
            <p className="mx-auto max-w-[280px] text-[12px] leading-snug font-medium text-zinc-400">
              {reason}
            </p>
          )
        )}
      </div>

      <div className="mt-auto pt-4">
        {status === 'idle' || status === 'requesting' ? (
          <PrimaryButton
            onClick={start}
            loading={status === 'requesting'}
            icon={Camera}
            tone="brand"
          >
            {status === 'requesting' ? 'Opening camera…' : 'Open camera'}
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={start}
            disabled={Boolean(found) || status === 'live'}
            icon={found ? undefined : QrCode}
            tone={found ? 'success' : 'dark'}
          >
            {found ? 'Code recognised' : status === 'live' ? 'Looking for a code…' : 'Try again'}
          </PrimaryButton>
        )}

        <div className="mt-5 flex items-center justify-center text-[11px] font-semibold text-zinc-500">
          <button
            type="button"
            onClick={onForgetDevice}
            className="transition-colors hover:text-zinc-300"
          >
            Forget this device
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-600">
          Or open the link printed on the card
        </p>
      </div>
    </motion.div>
  )
}
