import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Rear-camera access for the scan and identity screens.
 *
 * Real `getUserMedia`, not a simulation — but it needs a secure context, so
 * over a plain http:// LAN address the API simply isn't there. Every failure
 * mode is reported rather than thrown, and both screens offer a way forward,
 * because a hotel lobby demo can't dead-end on a permission prompt.
 *
 * status: 'idle' | 'requesting' | 'live' | 'stopped' | 'denied' | 'unavailable'
 */
export function useCamera() {
  const [status, setStatus] = useState('idle')
  const [reason, setReason] = useState(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const liveRef = useRef(true) // false once unmounted — guards async resolution

  /** Cutting the stream is time-sensitive: the OS camera indicator stays lit
   *  until every track is stopped, and the exit animation delays unmount. */
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus((s) => (s === 'live' ? 'stopped' : s))
  }, [])

  useEffect(() => {
    liveRef.current = true
    return () => {
      liveRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  /** Screens that mount the <video> only once the camera is live hand us a ref
   *  that was still null inside start(), so attach on the next render too. */
  useEffect(() => {
    const video = videoRef.current
    if (status !== 'live' || !video || !streamRef.current) return
    if (video.srcObject === streamRef.current) return
    video.srcObject = streamRef.current
    video.play().catch(() => {})
  }, [status])

  const start = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setStatus('unavailable')
      setReason(
        window.isSecureContext
          ? 'This browser has no camera API.'
          : 'The camera needs https:// or localhost.',
      )
      return
    }

    setStatus('requesting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
    } catch (err) {
      if (!liveRef.current) return
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError'
      setStatus(denied ? 'denied' : 'unavailable')
      setReason(denied ? 'Camera access was blocked.' : 'No camera available on this device.')
      return
    }

    // Unmounted while the permission prompt was up — don't leak the stream.
    if (!liveRef.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }

    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
      // iOS blocks autoplay until the element is muted + inline; both are set
      // on the element, and a rejected play() shouldn't kill the flow.
      videoRef.current.play().catch(() => {})
    }
    setStatus('live')
  }, [])

  /** Freeze the current frame as a data URL, then release the camera. */
  const capture = useCallback(() => {
    const video = videoRef.current
    if (!video || video.readyState < 2 || !video.videoWidth) {
      stop()
      return null
    }
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    const frame = canvas.toDataURL('image/jpeg', 0.8)
    stop()
    return frame
  }, [stop])

  return { status, reason, videoRef, start, stop, capture, setStatus, setReason }
}

/**
 * The camera plus a QR decode loop. Decoding needs `BarcodeDetector`, which
 * Safari lacks — where it's missing the camera still runs live and the screen
 * falls back to its manual control.
 */
export function useQrCamera({ onDecode }) {
  const camera = useCamera()
  const { status, videoRef, stop, setStatus, setReason } = camera
  const timerRef = useRef(null)

  useEffect(() => {
    if (status !== 'live') return

    const Detector = window.BarcodeDetector
    if (!Detector) {
      setReason('Live camera — this browser can’t decode QR codes.')
      return
    }

    let cancelled = false
    const detector = new Detector({ formats: ['qr_code'] })
    timerRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      let codes = []
      try {
        codes = await detector.detect(video)
      } catch {
        return
      }
      if (!codes.length || cancelled) return
      stop()
      setStatus('found')
      onDecode(codes[0].rawValue)
    }, 300)

    return () => {
      cancelled = true
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [status, videoRef, stop, setStatus, setReason, onDecode])

  /** Skip decoding and resolve the session anyway — the demo escape hatch. */
  const resolveManually = useCallback(() => {
    stop()
    setStatus('found')
    onDecode(null)
  }, [onDecode, stop, setStatus])

  return { ...camera, resolveManually }
}
