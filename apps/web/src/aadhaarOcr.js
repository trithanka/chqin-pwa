import { isValidAadhaar } from '@chqin/shared'
import workerPath from 'tesseract.js/dist/worker.min.js?url'
// ponytail: SIMD build only (Safari 16.4+, Chrome 91+); older phones fail the
// scan and type the number. Add tesseract-core-lstm as a fallback if that bites.
import corePath from 'tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url'

/**
 * Read the Aadhaar number off the card, on the device.
 *
 * The card's QR is no help here: the Secure QR on current cards carries only
 * the last four digits. So it's OCR — Tesseract in the browser, and the photo
 * never leaves the phone.
 *
 * Speed comes from four things: every file (worker, engine, English model) is
 * served from our own origin and kept by the service worker, so after the first
 * time nothing is downloaded at all; the worker starts when the identity screen
 * opens, so it's ready by the time the card is lined up; it's kept for the next
 * attempt instead of torn down; and it only sees what the guest saw in the
 * frame, scaled down to a size the digits still read at.
 *
 * Each line is reduced to its digits and a line of exactly twelve that passes
 * Verhoeff wins. That skips the 16-digit VID and the date of birth, and a
 * misread digit fails the checksum instead of filling in a wrong number.
 */

const MAX_WIDTH = 1000

let workerPromise = null

/** Start loading Tesseract now; safe to call as often as you like. */
export function warmUp() {
  workerPromise ??= import('tesseract.js')
    .then(({ createWorker }) => createWorker('eng', undefined, { workerPath, corePath, langPath: '/ocr' }))
    .then(async (worker) => {
      await worker.setParameters({ tessedit_char_whitelist: '0123456789 ' })
      return worker
    })
    .catch((err) => {
      workerPromise = null // let the next tap try again
      throw err
    })
  return workerPromise
}

/**
 * The part of the video the guest could see — the <video> is object-cover, so
 * the edges of the camera frame are cropped off screen — at most MAX_WIDTH wide.
 * Call before the camera stops.
 */
export function snapshot(video) {
  if (!video || video.readyState < 2 || !video.videoWidth) return null
  const { videoWidth: vw, videoHeight: vh, clientWidth: cw, clientHeight: ch } = video
  const scale = Math.max(cw / vw, ch / vh)
  const sw = cw / scale
  const sh = ch / scale
  const out = Math.min(1, MAX_WIDTH / sw)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(sw * out)
  canvas.height = Math.round(sh * out)
  canvas
    .getContext('2d')
    .drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height)
  return canvas
}

export async function readAadhaar(image) {
  const worker = await warmUp()
  const { data } = await worker.recognize(image)
  return (
    data.text
      .split('\n')
      .map((line) => line.replace(/\D/g, ''))
      .find((digits) => digits.length === 12 && isValidAadhaar(digits)) ?? null
  )
}
