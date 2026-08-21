/**
 * Reading a GST registration certificate (form REG-06).
 *
 * The certificate GSTN issues is a generated PDF with a real text layer, so
 * the registration number and the legal name are already in the file — no OCR,
 * no upload, no server. The parse runs in the browser and the file never
 * leaves the device.
 *
 * A photo of a printed certificate has no text layer. That case isn't handled:
 * it needs OCR, which costs a couple of megabytes of wasm and still misreads
 * 0/O and 1/I in exactly the field where a misread matters. The step falls
 * back to typing, which is what it did before.
 */

/**
 * 22AAAAA0000A1Z5 — two digits of state code, a ten-character PAN, one entity
 * character, a literal Z, and a checksum character.
 */
export const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/

/**
 * Labels as REG-06 writes them, and as a few state variants write them.
 *
 * Longest first, and matched in that order: "trade name" is a prefix of
 * "trade name, if any", so matching the short one first leaves ", if any" at
 * the front of the value.
 */
const byLength = (labels) => [...labels].sort((a, b) => b.length - a.length)

const LEGAL_NAME_LABELS = byLength([
  'legal name of the business',
  'legal name of business',
  'name of the business',
  'legal name',
])
const TRADE_NAME_LABELS = byLength(['trade name, if any', 'trade name if any', 'trade name'])

const clean = (value) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/^[:\-–—\s]+/, '')
    .trim()

/**
 * Not a name: the value slot on a certificate is sometimes the next label, an
 * empty dash, or the GSTIN itself when the layout puts them side by side.
 */
const looksLikeName = (value) =>
  value.length >= 3 &&
  value.length <= 120 &&
  !GSTIN.test(value) &&
  /[A-Za-z]{3}/.test(value) &&
  !/^(registration|certificate|trade name|legal name|address|constitution|date|type)\b/i.test(value)

/**
 * Certificates number their fields — "2. Legal Name" — and the numbering is
 * not part of the label anywhere else.
 */
const unnumber = (line) => line.replace(/^\(?[0-9a-z]{1,3}[.)]\s*/i, '')

/**
 * The value that follows a label.
 *
 * PDF text extraction gives lines, but not reliably in the shape a reader
 * sees: a label and its value can share a line or sit on consecutive ones. Try
 * the remainder of the label's own line first, then the lines after it.
 */
function valueAfter(lines, labels) {
  for (let i = 0; i < lines.length; i++) {
    const head = unnumber(lines[i])
    const lower = head.toLowerCase()
    const label = labels.find((l) => lower.startsWith(l))
    if (!label) continue

    const inline = clean(head.slice(label.length))
    if (looksLikeName(inline)) return inline

    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const next = clean(unnumber(lines[j]))
      if (!next) continue
      if (looksLikeName(next)) return next
      break
    }
  }
  return null
}

/**
 * What a certificate's text says. Every field is optional — a partial read
 * fills what it found and leaves the rest to be typed.
 */
export function parseGstText(text) {
  const lines = text
    .split('\n')
    .map(clean)
    .filter(Boolean)

  return {
    gstin: text.match(GSTIN)?.[0] ?? null,
    legalName: valueAfter(lines, LEGAL_NAME_LABELS),
    tradeName: valueAfter(lines, TRADE_NAME_LABELS),
  }
}

/**
 * Pulls the text out of a PDF file.
 *
 * pdf.js is loaded on demand: it is the largest dependency in the app and only
 * one step of nine ever needs it, so it stays out of the initial bundle.
 */
export async function readPdfText(file, { maxPages = 3 } = {}) {
  const [{ getDocument, GlobalWorkerOptions }, workerSrc] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url').then((m) => m.default),
  ])
  GlobalWorkerOptions.workerSrc = workerSrc

  // The loading task owns the worker, not the document — releasing it is what
  // frees the worker thread, and `document.destroy` doesn't exist.
  const task = getDocument({ data: await file.arrayBuffer() })
  const pdf = await task.promise
  try {
    const pages = []
    // A certificate's registration details are on page one; the annexures
    // after it are branch lists, and reading them only adds names to confuse
    // the parse.
    for (let n = 1; n <= Math.min(pdf.numPages, maxPages); n++) {
      const page = await pdf.getPage(n)
      const content = await page.getTextContent()

      // Items carry their own line breaks in `hasEOL`; without honouring it
      // the whole page arrives as one line and every label runs into the next.
      let line = ''
      const lines = []
      for (const item of content.items) {
        if (item.str) line += item.str
        if (item.hasEOL) {
          lines.push(line)
          line = ''
        }
      }
      if (line) lines.push(line)
      pages.push(lines.join('\n'))
    }
    return pages.join('\n')
  } finally {
    await task.destroy()
  }
}

/** Convenience: file in, fields out. Throws only if the PDF can't be opened. */
export async function extractGstDetails(file) {
  return parseGstText(await readPdfText(file))
}
