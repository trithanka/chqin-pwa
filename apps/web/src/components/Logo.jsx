/**
 * The ChqIn mark, inline so it can take `currentColor` and animate with the
 * rest of the UI. `wordmark` is the full CIn; without it you get the C and the
 * bar, which is what survives at small sizes.
 *
 * The green never changes. The C follows whatever colour it's given.
 */
export default function Logo({ wordmark = true, className = '', ...props }) {
  if (!wordmark) {
    return (
      <svg viewBox="0 0 64 64" fill="none" role="img" aria-label="ChqIn" className={className} {...props}>
        <path
          d="M32.6 16.9 A15 15 0 1 0 32.6 47.1"
          stroke="currentColor"
          strokeWidth="10"
          strokeLinecap="butt"
        />
        <rect x="49" y="12" width="10" height="40" fill="#22DD66" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 258 120" fill="none" role="img" aria-label="ChqIn" className={className} {...props}>
      <path
        d="M91.6 33.9 A40 40 0 1 0 91.6 86.1"
        stroke="currentColor"
        strokeWidth="24"
        strokeLinecap="butt"
      />
      <rect x="146" y="8" width="24" height="104" fill="#22DD66" />
      <path
        d="M190 112 V70 a23 23 0 0 1 46 0 V112"
        stroke="#22DD66"
        strokeWidth="24"
        strokeLinecap="butt"
      />
    </svg>
  )
}
