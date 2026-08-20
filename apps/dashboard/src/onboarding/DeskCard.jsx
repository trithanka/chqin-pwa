import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Printer } from 'lucide-react'
import { Button } from './kit'
import Logo from '../components/Logo'

// Where the guest app lives, not where the dashboard does — the printed card
// sends a guest to check in. Hardcoding it means a card printed from staging
// points at production, or the reverse.
const guestApp = import.meta.env.VITE_GUEST_APP_URL ?? window.location.origin

/**
 * The desk card. One code per property, printed once and left on the counter —
 * it identifies the venue, and each scan mints that guest their own check-in
 * session, so the printed code never has to be reissued.
 *
 * `token` comes from the API once the property is live. Without one the card
 * renders as an obvious preview: a QR that looks scannable but resolves to
 * nothing is worse than one that admits it.
 *
 * Printed on white on purpose — the rest of setup is dark, and a dark QR card
 * is a page of toner and a code a camera reads badly. `onLight` is for the
 * dashboard's own Check-in code page, which is not dark: the card is
 * identical, only the controls under it change.
 */
export default function DeskCard({ propertyName, token, onLight = false }) {
  const [png, setPng] = useState(null)
  const [copied, setCopied] = useState(false)

  const preview = !token
  const url = useMemo(() => `${guestApp}/c/${token ?? 'preview'}`, [token])

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(url, {
      width: 640,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then((dataUrl) => {
      if (!cancelled) setPng(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [url])

  // The card is the same on both; only the chrome around it changes.
  const light = onLight
    ? 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'
    : ''

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div>
      <div
        className={`print-card mx-auto flex max-w-[340px] flex-col items-center rounded-2xl bg-white px-7 py-8 text-center ${
          onLight ? 'border border-slate-200 shadow-[var(--shadow-panel)]' : ''
        }`}
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">
          {propertyName || 'Your property'}
        </p>
        <h2 className="mt-2.5 text-[22px] font-extrabold leading-tight tracking-[-0.03em] text-slate-900">
          Scan to check in
        </h2>
        <p className="mt-1.5 text-[13px] text-slate-500">Point your phone camera at the code</p>

        <div className="relative my-6 rounded-2xl border border-slate-200 p-3">
          {png ? (
            <img
              src={png}
              alt={`Check-in QR code for ${propertyName}`}
              className={`size-40 ${preview ? 'opacity-20 blur-[1px]' : ''}`}
            />
          ) : (
            <div className="size-40 animate-pulse rounded-lg bg-slate-100" />
          )}
          {preview && (
            <span className="absolute inset-0 grid place-items-center px-4 text-center text-[12px] font-semibold leading-snug text-slate-500">
              Your code is created when you go live
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-400">
          <span>Powered by</span>
          <Logo className="h-3.5 w-auto text-slate-500" />
        </div>
      </div>

      <div className="print-hide mx-auto mt-5 flex max-w-[340px] gap-2.5">
        <Button
          tone="secondary"
          icon={Printer}
          onClick={() => window.print()}
          disabled={preview}
          className={`flex-1 ${light}`}
        >
          Print card
        </Button>
        <Button
          tone="secondary"
          icon={copied ? Check : Copy}
          onClick={copy}
          disabled={preview}
          className={`flex-1 ${light}`}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>

      {!preview && (
        <p
          className={`print-hide mx-auto mt-3 max-w-[340px] text-[12.5px] leading-relaxed ${
            onLight ? 'text-slate-500' : 'text-onb-muted'
          }`}
        >
          A guest without a camera app can open{' '}
          {/* A session token has no spaces in it, so without break-all the
              line decides how wide the page is. */}
          <span
            className={`break-all font-semibold ${onLight ? 'text-slate-700' : 'text-onb-text'}`}
          >
            {url}
          </span>{' '}
          directly. The
          same code stays valid, so a printed card keeps working.
        </p>
      )}
    </div>
  )
}
