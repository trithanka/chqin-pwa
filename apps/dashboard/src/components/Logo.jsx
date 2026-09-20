import { useId } from 'react'

/**
 * The ChqIn wordmark, matching chqin-web: "Chq" in currentColor, "In" in the
 * brand gradient, set in Outfit 600. Drawn as SVG text so callers can keep
 * sizing it by height (`h-7 w-auto`) like any other icon.
 */
export default function Logo({ className = '', ...props }) {
  // Unique per instance: a gradient referenced from a display:none SVG
  // doesn't paint, so a shared id breaks when the first Logo is hidden.
  const gradient = useId()
  return (
    <svg viewBox="0 0 300 100" overflow="visible" role="img" aria-label="ChqIn" className={className} {...props}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7ee8fa" />
          <stop offset="0.55" stopColor="#5cc8f5" />
          <stop offset="1" stopColor="#3b7ff0" />
        </linearGradient>
      </defs>
      <text
        x="0"
        y="80"
        fontFamily="Outfit, system-ui, -apple-system, BlinkMacSystemFont, sans-serif"
        fontWeight="600"
        fontSize="100"
        letterSpacing="-1"
        fill="currentColor"
      >
        Chq<tspan fill={`url(#${gradient})`}>In</tspan>
        <tspan fontSize="28" dy="-38" letterSpacing="0">™</tspan>
      </text>
    </svg>
  )
}
