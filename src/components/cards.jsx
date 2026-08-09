import { motion } from 'framer-motion'
import { BedDouble, Building2, Check, Fingerprint, MapPin, Scan, ScanFace, ShieldCheck, UserRound } from 'lucide-react'
import { Card, Skeleton } from './ui'

/* ------------------------------------------------------------------ */
/* Hotel Card (High-End Luxury Visual Render)                         */
/* ------------------------------------------------------------------ */

export function HotelCard({ hotel, loading = false }) {
  if (loading) {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-2xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-slate-200/90 shadow-md bg-white">
      <div className="relative h-36 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 p-5 flex flex-col justify-between overflow-hidden">
        {/* Subtle Architectural Glow & Grid Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.25),transparent_70%)]" />
        <div className="absolute -bottom-6 -right-6 size-32 rounded-full bg-blue-400/20 blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex items-center justify-between text-white/90">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold backdrop-blur-md border border-white/20">
            <Building2 size={12} strokeWidth={2.4} />
            HOTEL AURORA
          </span>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-white/90 bg-black/20 px-2.5 py-1 rounded-full backdrop-blur-sm">
            <MapPin size={11} strokeWidth={2.4} className="text-blue-300" />
            Bandra West, Mumbai
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-[10.5px] font-extrabold uppercase tracking-widest text-blue-200">Assigned Stay</p>
          <h2 className="text-[21px] font-black text-white tracking-tight">
            Deluxe Room · {HOTEL.roomNumber}
          </h2>
        </div>
      </div>
    </Card>
  )
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-2xl bg-blue-50/50 p-3.5 border border-blue-100/60">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
        <Icon size={13} strokeWidth={2.2} className="text-blue-600" />
        {label}
      </div>
      <p className="mt-1 truncate text-[14.5px] font-bold tracking-tight text-slate-900">
        {value}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Camera card (Face Scan)                                             */
/* ------------------------------------------------------------------ */

export function CameraCard({ state }) {
  const scanning = state === 'scanning'
  const done = state === 'done'

  return (
    <div className="relative mx-auto grid size-64 place-items-center">
      {/* Expanding Ring Halos */}
      <motion.div
        animate={
          scanning
            ? { scale: [1, 1.08, 1], opacity: [0.6, 0.15, 0.6] }
            : { scale: 1, opacity: done ? 0.4 : 0.2 }
        }
        transition={{ duration: 1.8, repeat: scanning ? Infinity : 0 }}
        className={`absolute size-full rounded-full ${
          done ? 'bg-emerald-500/20 ring-2 ring-emerald-500/30' : 'bg-blue-600/15 ring-2 ring-blue-500/30'
        }`}
      />

      <div
        className={`relative size-56 overflow-hidden rounded-full border-2 bg-slate-50 transition-all duration-500 grid place-items-center ${
          done
            ? 'border-emerald-500 shadow-[0_0_35px_rgba(16,185,129,0.3)]'
            : scanning
              ? 'border-blue-600 shadow-[0_0_40px_rgba(37,99,235,0.35)]'
              : 'border-slate-200'
        }`}
      >
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.1),transparent_70%)]">
          <UserRound
            size={108}
            strokeWidth={1}
            className={`transition-all duration-500 ${
              done ? 'text-emerald-500/70' : scanning ? 'text-blue-600/80' : 'text-slate-300'
            }`}
          />
        </div>

        {scanning && (
          <>
            <div className="animate-scan absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-blue-500/35 to-transparent" />
            <div className="absolute inset-0 rounded-full border border-blue-400/40 animate-ping opacity-30" />
          </>
        )}

        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 grid place-items-center bg-emerald-500/10 backdrop-blur-[1px]"
          >
            <motion.span
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 380, damping: 20 }}
              className="grid size-16 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.45)]"
            >
              <Check size={32} strokeWidth={3.4} />
            </motion.span>
          </motion.div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Device Biometric Card                                               */
/* ------------------------------------------------------------------ */

export function BiometricCard({ state, onClick }) {
  const scanning = state === 'scanning'
  const done = state === 'done'

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="relative mx-auto grid size-56 place-items-center cursor-pointer group focus:outline-none"
    >
      <motion.div
        animate={
          scanning
            ? { scale: [1, 1.12, 1], opacity: [0.7, 0.2, 0.7] }
            : { scale: 1, opacity: done ? 0.5 : 0.25 }
        }
        transition={{ duration: 1.6, repeat: scanning ? Infinity : 0 }}
        className={`absolute size-full rounded-full transition-colors duration-500 ${
          done
            ? 'bg-emerald-500/20 ring-2 ring-emerald-500/40'
            : 'bg-blue-600/15 ring-2 ring-blue-500/30'
        }`}
      />

      <div
        className={`relative size-44 overflow-hidden rounded-full border-2 bg-white transition-all duration-500 grid place-items-center ${
          done
            ? 'border-emerald-500 shadow-[0_0_36px_rgba(16,185,129,0.3)]'
            : scanning
              ? 'border-blue-600 shadow-[0_0_40px_rgba(37,99,235,0.35)]'
              : 'border-slate-200 hover:border-blue-500 shadow-md'
        }`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,99,235,0.1),transparent_75%)]" />

        {!done ? (
          <motion.div
            animate={scanning ? { scale: [1, 0.94, 1] } : { scale: 1 }}
            transition={{ duration: 1.2, repeat: scanning ? Infinity : 0 }}
            className="relative z-10 flex flex-col items-center gap-1.5"
          >
            <div className="flex items-center gap-2">
              <ScanFace
                size={34}
                strokeWidth={1.5}
                className={`transition-colors duration-500 ${
                  scanning ? 'text-blue-600' : 'text-blue-600/80 group-hover:text-blue-600'
                }`}
              />
              <span className="h-5 w-[1px] bg-slate-200" />
              <Fingerprint
                size={34}
                strokeWidth={1.5}
                className={`transition-colors duration-500 ${
                  scanning ? 'text-blue-600' : 'text-blue-600/80 group-hover:text-blue-600'
                }`}
              />
            </div>
            <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase mt-0.5">
              Face ID / Fingerprint
            </span>
          </motion.div>
        ) : (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className="relative z-10 grid size-16 place-items-center rounded-full bg-emerald-600 text-white shadow-[0_8px_24px_rgba(16,185,129,0.45)]"
          >
            <Check size={32} strokeWidth={3.4} />
          </motion.span>
        )}

        {scanning && (
          <div className="animate-scan absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-blue-500/35 to-transparent" />
        )}
      </div>
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/* Document Scan Card                                                  */
/* ------------------------------------------------------------------ */

export function DocumentScanCard({ state }) {
  const scanning = state === 'scanning'
  const done = state === 'done'

  return (
    <div
      className={`relative aspect-[1.6/1] w-full overflow-hidden rounded-[24px] border-2 transition-all duration-500 ${
        done
          ? 'border-emerald-500/80 bg-emerald-50/50 shadow-[0_0_24px_rgba(16,185,129,0.12)]'
          : scanning
            ? 'border-blue-600 bg-blue-50/40 shadow-[0_0_30px_rgba(37,99,235,0.18)]'
            : 'border-slate-200 bg-white shadow-sm'
      }`}
    >
      <div className="absolute inset-0 p-5 flex flex-col justify-between">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`size-11 rounded-xl grid place-items-center ${done ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
              <UserRound size={22} strokeWidth={1.8} />
            </div>
            <div className="space-y-1.5">
              <div className={`h-3 w-32 rounded-full ${done ? 'bg-emerald-200' : 'bg-slate-200'}`} />
              <div className={`h-2.5 w-20 rounded-full ${done ? 'bg-emerald-100' : 'bg-slate-100'}`} />
            </div>
          </div>

          <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
            done ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-700 border border-blue-100'
          }`}>
            {done ? 'ID Verified' : 'Scan Frame'}
          </span>
        </div>

        <div className={`rounded-xl p-3 border transition-colors ${
          done
            ? 'bg-white border-emerald-200'
            : 'bg-slate-50 border-slate-100'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Document No.</span>
            <span className={`font-mono text-[13px] font-bold tracking-widest ${done ? 'text-emerald-700' : 'text-slate-700'}`}>
              {done ? '•••• •••• 5678' : 'CAPTURE IN PROGRESS'}
            </span>
          </div>
        </div>
      </div>

      {scanning && (
        <div className="animate-scan absolute inset-x-0 h-20 bg-gradient-to-b from-transparent via-blue-500/35 to-transparent" />
      )}

      {!done &&
        [
          'left-3.5 top-3.5 rounded-tl-lg border-l-2 border-t-2',
          'right-3.5 top-3.5 rounded-tr-lg border-r-2 border-t-2',
          'bottom-3.5 left-3.5 rounded-bl-lg border-b-2 border-l-2',
          'bottom-3.5 right-3.5 rounded-br-lg border-b-2 border-r-2',
        ].map((pos) => (
          <span key={pos} className={`absolute size-6 ${scanning ? 'border-blue-600' : 'border-slate-300'} ${pos}`} />
        ))}

      {done && (
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          className="absolute right-4 top-4 grid size-8 place-items-center rounded-full bg-emerald-600 text-white shadow-md"
        >
          <Check size={18} strokeWidth={3.2} />
        </motion.span>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Success Card                                                        */
/* ------------------------------------------------------------------ */

export function SuccessCard({ children }) {
  return (
    <div className="flex flex-col items-center text-center my-auto">
      <motion.div
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 18 }}
        className="relative mb-7 grid size-28 place-items-center"
      >
        <motion.span
          animate={{ scale: [1, 1.35, 1], opacity: [0.35, 0, 0.35] }}
          transition={{ duration: 2.4, repeat: Infinity }}
          className="absolute size-full rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/30"
        />
        <span className="relative grid size-24 place-items-center rounded-full bg-emerald-600 shadow-[0_16px_48px_rgba(16,185,129,0.38)]">
          <motion.svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <motion.path
              d="M4 12.5 9.5 18 20 6.5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
            />
          </motion.svg>
        </span>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-[34px] font-black leading-tight tracking-[-0.04em] text-slate-900"
      >
        You&apos;re checked in.
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.24 }}
        className="mt-6 w-full rounded-[24px] bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 p-6 text-white shadow-xl text-left relative overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.2),transparent_70%)]" />
        <p className="relative z-10 text-[11px] font-extrabold uppercase tracking-[0.18em] text-blue-200">
          HOTEL AURORA
        </p>
        <p className="relative z-10 mt-1 text-[30px] font-black tracking-tight text-white">
          ROOM 305
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.32 }}
        className="mt-5 text-[15.5px] font-semibold text-slate-500"
      >
        Your stay is ready.
      </motion.p>

      {children && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 w-full"
        >
          {children}
        </motion.div>
      )}
    </div>
  )
}
