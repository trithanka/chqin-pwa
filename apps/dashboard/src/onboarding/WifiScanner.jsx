import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './kit'
import { parseWifiQr } from './wifiQr'

/**
 * Reads a Wi-Fi QR with the camera.
 *
 * Two things this is pointed at: the sticker on the back of the router, and
 * another phone showing its "Share Wi-Fi" code. Both carry the network and the
 * password in one payload, which is the only way both fields fill themselves —
 * no browser exposes the SSID of the network the device is already on.
 *
 * A phone can't scan its own screen, so on a phone the router label is the
 * only target. Typing stays available throughout.
 *
 * Decoding uses jsQR rather than the platform's `BarcodeDetector`, which iOS
 * Safari doesn't have — and an owner on an iPhone is exactly who this is for.
 * It's loaded on demand so it costs nothing to the eight steps that never open
 * the camera.
 */
export default function WifiScanner({ onFound, onClose }) {
  // requesting | live | denied | unavailable | wrong-code
  const [status, setStatus] = useState('requesting')
  const [reason, setReason] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const mounted = useRef(true)

  /** The OS camera indicator stays lit until every track is stopped. */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const close = useCallback(() => {
    stop()
    onClose()
  }, [stop, onClose])

  useEffect(() => {
    mounted.current = true
    let frame = null
    let decode = null

    const run = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unavailable')
        // The usual cause in this project: the dashboard opened over a plain
        // http:// LAN address for phone testing. getUserMedia needs a secure
        // context, so the API simply isn't there.
        setReason(
          window.isSecureContext
            ? 'This browser has no camera API.'
            : 'The camera needs https:// or localhost — this page is on plain http.',
        )
        return
      }

      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
      } catch (err) {
        if (!mounted.current) return
        const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
        setStatus(denied ? 'denied' : 'unavailable')
        setReason(
          denied ? 'Camera access was blocked.' : 'No camera available on this device.',
        )
        return
      }

      // Unmounted while the permission prompt was up — don't leak the stream.
      if (!mounted.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        // iOS blocks autoplay unless the element is muted and inline; both are
        // set below, and a rejected play() shouldn't kill the flow.
        videoRef.current.play().catch(() => {})
      }
      setStatus('live')

      const jsQR = (await import('jsqr')).default
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d', { willReadFrequently: true })

      decode = () => {
        const video = videoRef.current
        if (!mounted.current || !video || video.readyState < 2 || !video.videoWidth) {
          frame = requestAnimationFrame(decode)
          return
        }

        // Downscaled: jsQR walks every pixel, and a full 1080p frame per
        // animation frame is what makes a scanner heat a phone up.
        const scale = Math.min(1, 480 / video.videoWidth)
        canvas.width = Math.round(video.videoWidth * scale)
        canvas.height = Math.round(video.videoHeight * scale)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)

        const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(data, width, height, { inversionAttempts: 'dontInvert' })

        if (code) {
          const wifi = parseWifiQr(code.data)
          if (wifi) {
            stop()
            onFound(wifi)
            return
          }
          // A router label often carries a support URL too. Say what happened
          // instead of looking like the scan is still searching.
          setStatus('wrong-code')
        }

        frame = requestAnimationFrame(decode)
      }

      frame = requestAnimationFrame(decode)
    }

    run()

    return () => {
      mounted.current = false
      if (frame) cancelAnimationFrame(frame)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [onFound, stop])

  const live = status === 'live' || status === 'wrong-code'

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 pt-safe pb-safe">
      <div className="flex items-center justify-between px-5 py-3">
        <p className="text-[15px] font-bold text-onb-text">Scan Wi-Fi QR</p>
        <button
          type="button"
          onClick={close}
          aria-label="Close scanner"
          className="-mr-2 grid size-11 place-items-center rounded-xl text-onb-muted"
        >
          <X size={20} strokeWidth={2.4} />
        </button>
      </div>

      <div className="relative mx-5 flex-1 overflow-hidden rounded-2xl bg-onb-surface">
        <video
          ref={videoRef}
          muted
          playsInline
          className={`size-full object-cover ${live ? '' : 'opacity-0'}`}
        />

        {live && (
          <span className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="size-56 rounded-2xl border-2 border-onb-green/80" />
          </span>
        )}

        {!live && (
          <p className="absolute inset-0 grid place-items-center px-8 text-center text-[14px] leading-relaxed text-onb-muted">
            {status === 'requesting' ? 'Asking for the camera…' : reason}
          </p>
        )}
      </div>

      <div className="px-5 pt-4">
        <p className="mb-3 text-center text-[13px] leading-relaxed text-onb-muted">
          {status === 'wrong-code'
            ? "That code isn't a Wi-Fi one — keep pointing at the Wi-Fi QR."
            : 'Point at the QR on your router, or at another phone showing its "Share Wi-Fi" code.'}
        </p>
        <Button tone="secondary" onClick={close} className="w-full">
          {live ? 'Cancel' : 'Type it in instead'}
        </Button>
      </div>
    </div>
  )
}
