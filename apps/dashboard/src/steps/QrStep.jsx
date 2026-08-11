import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Printer } from 'lucide-react'
import { Button, Panel } from '../components/ui'
import StepHeader from '../components/StepHeader'

/**
 * The desk card. One QR per property, printed once and left on the counter —
 * it identifies the hotel, and each scan mints that guest their own check-in
 * session, so the printed code never has to be reissued.
 *
 * The token here is a local placeholder; the real one comes from the API when
 * this is wired up.
 */
export default function QrStep({ data }) {
  const [png, setPng] = useState(null)
  const [copied, setCopied] = useState(false)

  const token = useMemo(
    () =>
      // Stable for a given property name so the card doesn't change on every
      // keystroke or re-render.
      'demo-' +
      Array.from(data.property.name || 'chqin')
        .reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)
        .toString(36)
        .padStart(8, '0'),
    [data.property.name],
  )

  const url = `https://chqin.app/c/${token}`

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

        <div className="my-6 rounded-2xl border border-slate-200 bg-white p-3">
          {png ? (
            <img src={png} alt={`Check-in QR code for ${data.property.name}`} className="size-44" />
          ) : (
            <div className="size-44 animate-pulse rounded-lg bg-slate-100" />
          )}
        </div>

        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-400">
          <span className="grid size-4 place-items-center rounded bg-slate-900 text-[8px] font-black text-white">
            C
          </span>
          Powered by ChqIn
        </div>
      </Panel>

      <div className="print-hide mt-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Button tone="secondary" icon={Printer} onClick={() => window.print()}>
            Print card
          </Button>
          <Button tone="ghost" icon={copied ? Check : Copy} onClick={copy}>
            {copied ? 'Link copied' : 'Copy link'}
          </Button>
        </div>

        <p className="text-[12.5px] leading-relaxed text-slate-500">
          Guests without a camera app can open{' '}
          <span className="font-semibold text-slate-700">{url}</span> directly. The
          code stays valid — revoke and reprint it from settings if a card ever
          goes missing.
        </p>
      </div>
    </div>
  )
}
