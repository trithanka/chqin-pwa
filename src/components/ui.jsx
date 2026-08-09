import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, LoaderCircle, ScanFace, ShieldCheck, X } from 'lucide-react'

/**
 * Overlays portal into the phone shell so they cover the header too, no
 * matter which screen opened them.
 */
function Overlay({ children }) {
  const host =
    typeof document === 'undefined'
      ? null
      : document.getElementById('phone-shell')
  if (!host) return children
  return createPortal(children, host)
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

const tap = { scale: 0.975 }

export function PrimaryButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  icon: Icon,
  tone = 'brand',
}) {
  const tones = {
    brand: 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-[0_10px_30px_rgba(37,99,235,0.32)] hover:from-blue-700 hover:to-blue-800 active:scale-[0.98] border border-blue-400/30',
    dark: 'bg-slate-900 text-white shadow-[0_6px_24px_rgba(15,23,42,0.15)] hover:bg-slate-950 active:scale-[0.98] border border-slate-800/40',
    success: 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white shadow-[0_10px_30px_rgba(16,185,129,0.32)] hover:from-emerald-700 hover:to-emerald-800 active:scale-[0.98] border border-emerald-400/30',
  }

  return (
    <motion.button
      type="button"
      whileTap={disabled || loading ? undefined : tap}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={`relative overflow-hidden flex h-14 w-full items-center justify-center gap-2.5 rounded-[20px] text-[15.5px] font-bold tracking-[-0.01em] transition-all duration-200 disabled:opacity-45 ${tones[tone]}`}
    >
      {/* Subtle button glossy sheen */}
      <span className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-transparent pointer-events-none" />

      {loading ? (
        <LoaderCircle size={19} className="animate-spin text-white/90" />
      ) : (
        Icon && <Icon size={19} strokeWidth={2.4} className="text-white/90" />
      )}
      <span className="relative z-10">{children}</span>
    </motion.button>
  )
}

export function SecondaryButton({ children, onClick, icon: Icon }) {
  return (
    <motion.button
      type="button"
      whileTap={tap}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      onClick={onClick}
      className="flex h-14 w-full items-center justify-center gap-2 rounded-[20px] border border-slate-200/90 bg-white text-[15px] font-semibold tracking-[-0.01em] text-slate-800 shadow-xs transition-all hover:bg-slate-50 active:bg-slate-100"
    >
      {Icon && <Icon size={19} strokeWidth={2.2} />}
      {children}
    </motion.button>
  )
}

export function IconButton({ icon: Icon, label, onClick, subtle = false }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`grid size-9 place-items-center rounded-full border transition-all ${
        subtle
          ? 'border-transparent text-slate-400 hover:text-slate-700'
          : 'border-slate-200/80 bg-white/90 text-slate-700 shadow-xs hover:bg-white'
      }`}
    >
      <Icon size={17} strokeWidth={2.2} />
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/* Progress + stepper                                                  */
/* ------------------------------------------------------------------ */

export function ProgressBar({ value }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
      <motion.div
        className="h-full rounded-full bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.5)]"
        initial={false}
        animate={{ width: `${Math.max(6, value * 100)}%` }}
        transition={{ type: 'spring', stiffness: 180, damping: 26 }}
      />
    </div>
  )
}

export function Stepper({ steps, current }) {
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <div key={step} className="flex items-center gap-1.5">
            <motion.div
              initial={false}
              animate={{ scale: active ? 1 : 0.92 }}
              className={`grid size-5 place-items-center rounded-full text-[10px] font-extrabold ${
                done
                  ? 'bg-emerald-600 text-white'
                  : active
                    ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                    : 'bg-slate-200 text-slate-400'
              }`}
            >
              {done ? <Check size={11} strokeWidth={3.4} /> : i + 1}
            </motion.div>
            {active && (
              <motion.span
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                className="whitespace-nowrap text-[11px] font-bold text-slate-700 tracking-tight"
              >
                {step}
              </motion.span>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({ children, className = '', glass = false }) {
  return (
    <div
      className={`rounded-[var(--radius-card)] border border-slate-200/80 ${
        glass ? 'glass' : 'bg-white'
      } shadow-[var(--shadow-soft)] ${className}`}
    >
      {children}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}

export function Screen({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={{ duration: 0.28, ease: [0.25, 1, 0.5, 1] }}
      className={`flex min-h-full flex-col px-6 pb-6 ${className}`}
    >
      {children}
    </motion.div>
  )
}

export function ScreenTitle({ title, subtitle, eyebrow }) {
  return (
    <div className="mb-6">
      {eyebrow && (
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-600">
          {eyebrow}
        </p>
      )}
      <h1 className="text-[28px] font-extrabold leading-[1.18] tracking-[-0.035em] text-slate-900">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2.5 text-[14.5px] leading-relaxed text-slate-500 font-medium">
          {subtitle}
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Bottom sheet + modal                                                */
/* ------------------------------------------------------------------ */

function Scrim({ onClick }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClick}
      className="absolute inset-0 z-40 bg-slate-900/30 backdrop-blur-[3px]"
    />
  )
}

export function BottomSheet({ open, onClose, title, children }) {
  return (
    <AnimatePresence>
      {open && (
        <Overlay>
          <Scrim onClick={onClose} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="pb-safe absolute inset-x-0 bottom-0 z-50 rounded-t-[28px] bg-white px-6 pt-3.5 shadow-[0_-16px_48px_rgba(15,23,42,0.12)] border-t border-slate-200/80"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-200" />
            <div className="mb-3 flex items-start justify-between">
              <h2 className="text-[18px] font-bold tracking-[-0.02em] text-slate-900">
                {title}
              </h2>
              <IconButton icon={X} label="Close" onClick={onClose} subtle />
            </div>
            {children}
          </motion.div>
        </Overlay>
      )}
    </AnimatePresence>
  )
}

export function Modal({ open, onClose, title, body, confirmLabel, onConfirm }) {
  return (
    <AnimatePresence>
      {open && (
        <Overlay>
          <Scrim onClick={onClose} />
          <div className="absolute inset-0 z-50 grid place-items-center px-7">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="w-full rounded-[24px] bg-white p-6 shadow-[var(--shadow-lift)] border border-slate-200/80"
            >
              <h2 className="text-[18px] font-bold tracking-[-0.02em] text-slate-900">
                {title}
              </h2>
              <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
                {body}
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                <PrimaryButton onClick={onConfirm} tone="brand">{confirmLabel}</PrimaryButton>
                <SecondaryButton onClick={onClose}>Keep going</SecondaryButton>
              </div>
            </motion.div>
          </div>
        </Overlay>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

export function Toast({ toast }) {
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -14, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 460, damping: 34 }}
          className="pointer-events-none absolute inset-x-5 top-[100px] z-[60] sm:top-[76px] flex items-center gap-2.5 rounded-2xl bg-slate-900 px-4 py-3 text-[13px] font-medium text-white shadow-xl border border-slate-800 backdrop-blur"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500">
            <Check size={12} strokeWidth={3.2} />
          </span>
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/* Apple/Passkey Simulated Biometric Sheet (Ultra-Beautified Light)   */
/* ------------------------------------------------------------------ */

export function BiometricPromptSheet({ open, onComplete, title = "Device Biometric Prompt" }) {
  return (
    <AnimatePresence>
      {open && (
        <Overlay>
          <Scrim onClick={() => {}} />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
            className="pb-safe absolute inset-x-0 bottom-0 z-50 rounded-t-[32px] bg-white/95 px-6 pt-5 pb-8 text-slate-900 shadow-[0_-20px_60px_rgba(15,23,42,0.18)] border-t border-slate-200/80 backdrop-blur-xl"
          >
            <div className="mx-auto mb-5 h-1.5 w-11 rounded-full bg-slate-200" />
            
            <div className="flex flex-col items-center text-center">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="relative mb-4 grid size-16 place-items-center rounded-full bg-blue-50 text-blue-600 ring-4 ring-blue-500/10 shadow-sm"
              >
                <ShieldCheck size={36} strokeWidth={1.8} />
              </motion.div>

              <h3 className="text-[18px] font-extrabold tracking-tight text-slate-900">
                {title}
              </h3>
              <p className="mt-1 text-[13px] font-medium text-slate-500 max-w-[250px]">
                Authenticating via Face ID / Fingerprint
              </p>

              <div className="mt-6 flex w-full justify-center">
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.4, ease: 'easeInOut' }}
                  onAnimationComplete={onComplete}
                  className="h-1 rounded-full bg-blue-600 shadow-[0_0_14px_rgba(37,99,235,0.7)]"
                />
              </div>
            </div>
          </motion.div>
        </Overlay>
      )}
    </AnimatePresence>
  )
}
