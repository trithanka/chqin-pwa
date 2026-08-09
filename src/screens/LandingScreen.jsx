import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Fingerprint, QrCode, ScanFace, ShieldAlert, Smartphone, Zap } from 'lucide-react'
import { Card, PrimaryButton } from '../components/ui'

/**
 * Entry screen. Preserves existing landing page design while connecting
 * to the three new guest check-in UX flows after QR scan.
 */
export default function LandingScreen({ onPick }) {
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)

  useEffect(() => {
    if (!scanning) return
    const t = setTimeout(() => {
      setScanning(false)
      setScanned(true)
    }, 1400)
    return () => clearTimeout(t)
  }, [scanning])

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
          Scan. Smile.
          <br />
          You&apos;re checked in.
        </h1>
        <p className="mt-2.5 max-w-[300px] text-[13.5px] leading-relaxed text-zinc-400">
          Point your camera at the QR code on the reception desk. The whole
          thing takes under a minute.
        </p>
      </div>

      {/* Simulated scanner viewfinder */}
      <div className="relative mx-auto mt-7 grid size-52 place-items-center">
        <div className="absolute inset-0 rounded-[32px] bg-white/5 backdrop-blur-sm border border-white/10" />
        {[
          'left-0 top-0 rounded-tl-[26px] border-l-3 border-t-3',
          'right-0 top-0 rounded-tr-[26px] border-r-3 border-t-3',
          'bottom-0 left-0 rounded-bl-[26px] border-b-3 border-l-3',
          'bottom-0 right-0 rounded-br-[26px] border-b-3 border-r-3',
        ].map((pos) => (
          <span
            key={pos}
            className={`absolute size-11 border-blue-500/80 ${pos}`}
          />
        ))}

        {scanning && (
          <div className="animate-scan absolute inset-x-6 h-20 rounded-full bg-gradient-to-b from-transparent via-blue-500/45 to-transparent" />
        )}

        <motion.div
          animate={scanning ? { scale: [1, 0.94, 1] } : { scale: 1 }}
          transition={{ duration: 1.2, repeat: scanning ? Infinity : 0 }}
          className="relative"
        >
          <QrCode
            size={88}
            strokeWidth={1.3}
            className={scanned ? 'text-emerald-400' : 'text-white/85'}
          />
        </motion.div>
      </div>

      <div className="mt-auto pt-6">
        {!scanned ? (
          <PrimaryButton
            onClick={() => setScanning(true)}
            loading={scanning}
            icon={QrCode}
            tone="brand"
          >
            {scanning ? 'Scanning QR…' : 'Scan QR Code'}
          </PrimaryButton>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2.5"
          >
            <p className="text-center text-[12px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
              Select Demo User Flow
            </p>
            <Choice
              icon={Fingerprint}
              title="Returning guest"
              body="SCAN QR → VERIFY → YOU'RE IN"
              onClick={() => onPick('returning')}
            />
            <Choice
              icon={ScanFace}
              title="First time here"
              body="One-time identity setup & face scan"
              onClick={() => onPick('firstTime')}
            />
            <Choice
              icon={ShieldAlert}
              title="New device"
              body="Unrecognized device identity recovery"
              onClick={() => onPick('newDevice')}
            />
          </motion.div>
        )}

        <p className="mt-4 text-center text-[11px] text-zinc-500">
          UI-only Prototype · simulated interactions
        </p>
      </div>
    </motion.div>
  )
}

function Choice({ icon: Icon, title, body, onClick }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.975 }}
      onClick={onClick}
      className="w-full text-left"
    >
      <Card className="flex items-center gap-3.5 p-3.5 border-zinc-200/90 hover:border-blue-500/40 transition-colors">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
          <Icon size={19} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold tracking-[-0.02em] text-zinc-900">
            {title}
          </p>
          <p className="text-[12px] text-zinc-500">{body}</p>
        </div>
        <ChevronRight size={17} className="shrink-0 text-zinc-400" />
      </Card>
    </motion.button>
  )
}
