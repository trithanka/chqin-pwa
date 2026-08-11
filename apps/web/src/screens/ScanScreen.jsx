import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, Check, QrCode, Zap } from 'lucide-react'
import { PrimaryButton } from '../components/ui'
import { useQrCamera } from '../useCamera'

/**
 * The SCAN beat — a live rear camera looking for the hotel's QR code.
 *
 * Decoding needs both a secure context and `BarcodeDetector`; where either is
 * missing the camera still runs and "Continue without scanning" resolves the
 * session, so the flow is never blocked by the environment.
 *
 * The prototype controls below are device-state switches, not journey
 * pickers — detection still decides what the guest sees.
 */
export default function ScanScreen({ onScanned, onForgetDevice, onResetAll }) {
  const [found, setFound] = useState(false)

  const handleDecode = useCallback(() => setFound(true), [])
  const { status, reason, videoRef, start, resolveManually } = useQrCamera({
    onDecode: handleDecode,
  })

  // Hold the confirmation beat for a moment, then hand over to detection.
  useEffect(() => {
    if (!found) return
    const t = setTimeout(onScanned, 700)
    return () => clearTimeout(t)
  }, [found, onScanned])

  const showVideo = status === 'live' || status === 'requesting'
  const blocked = status === 'denied' || status === 'unavailable'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex min-h-full flex-col bg-gradient-to-b from-[#090d1a] via-[#0f172a] to-[#1e293b] pt-safe pb-safe px-5 text-white [--pb-safe-min:2rem] [--pt-safe-min:3.5rem]"
    >
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-white/10 backdrop-blur border border-white/15 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
          <Zap size={17} strokeWidth={2.6} className="text-blue-400" />
        </span>
        <span className="text-[17px] font-extrabold tracking-[-0.03em]">ChqIn</span>
      </div>

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
          <p className="text-[12.5px] font-semibold text-emerald-400">QR code recognised</p>
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
            onClick={resolveManually}
            disabled={found}
            icon={found ? undefined : QrCode}
            tone={found ? 'success' : blocked ? 'brand' : 'dark'}
          >
            {found ? 'Hotel Aurora' : 'Continue without scanning'}
          </PrimaryButton>
        )}

        <div className="mt-5 flex items-center justify-center gap-3 text-[11px] font-semibold text-zinc-500">
          <button
            type="button"
            onClick={onForgetDevice}
            className="transition-colors hover:text-zinc-300"
          >
            Forget this device
          </button>
          <span className="text-zinc-700">·</span>
          <button
            type="button"
            onClick={onResetAll}
            className="transition-colors hover:text-zinc-300"
          >
            Reset everything
          </button>
        </div>

        <p className="mt-3 text-center text-[11px] text-zinc-600">
          Live camera · simulated passkeys
        </p>
      </div>
    </motion.div>
  )
}
