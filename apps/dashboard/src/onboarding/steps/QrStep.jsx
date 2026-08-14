import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Printer } from 'lucide-react'
import { Button, Panel } from '../../components/ui'
import StepHeader from '../../components/StepHeader'
import Logo from '../../components/Logo'

// Where the guest app lives, not where the dashboard does — the printed card
// sends a guest to check in. Hardcoding it means a card printed from staging
// points at production, or the reverse.
const guestApp = import.meta.env.VITE_GUEST_APP_URL ?? window.location.origin

/**
 * The desk card. One code per property, printed once and left on the counter —
 * it identifies the venue, and each scan mints that guest their own check-in
 * session, so the printed code never has to be reissued.
 *
 * `token` comes from the API. During setup there isn't one yet, so the card
 * renders as an obvious preview: a QR that looks scannable but resolves to
 * nothing is worse than one that admits it.
 */
export default function QrStep({ data, token, preview = false }) {
  const [png, setPng] = useState(null)
  const [copied, setCopied] = useState(false)

  const url = useMemo(
    () => `${guestApp}/c/${token ?? 'preview'}`,
    [token],
  )

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

  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div>
      <div className="print-hide">
        <StepHeader
          eyebrow="Step 5"
          title="Your check-in code"
          body="Print this and put it where guests arrive. One code for the whole property — each scan starts a separate, private check-in."
        />
      </div>

      {/* The card itself — the only thing that survives printing */}
      <Panel className="print-card mx-auto flex max-w-[380px] flex-col items-center px-8 py-9 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand">
          {data.property.name || 'Your property'}
        </p>
        <h2 className="mt-3 text-[24px] font-extrabold leading-tight tracking-[-0.03em] text-slate-900">
          Scan to check in
        </h2>
        <p className="mt-1.5 text-[13.5px] text-slate-500">
          Point your phone camera at the code
        </p>

        <div className="relative my-6 rounded-2xl border border-slate-200 bg-white p-3">
          {png ? (
            <img
              src={png}
              alt={`Check-in QR code for ${data.property.name}`}
              className={`size-44 ${preview ? 'opacity-25 blur-[1px]' : ''}`}
            />
          ) : (
            <div className="size-44 animate-pulse rounded-lg bg-slate-100" />
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
      </Panel>

      <div className="print-hide mt-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            tone="secondary"
            icon={Printer}
            onClick={() => window.print()}
            disabled={preview}
          >
            Print card
          </Button>
          <Button tone="ghost" icon={copied ? Check : Copy} onClick={copy} disabled={preview}>
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
        </div>

        <p className="text-[12.5px] leading-relaxed text-slate-500">
          {preview ? (
            <>
              This is how the card will look. The real code appears on your
              dashboard as soon as setup is finished.
            </>
          ) : (
            <>
              Guests without a camera app can open{' '}
              <span className="font-semibold text-slate-700">{url}</span>{' '}
              directly. The same code stays valid, so a printed card keeps
              working.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
