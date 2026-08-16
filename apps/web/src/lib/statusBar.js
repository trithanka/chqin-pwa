/**
 * Tints the phone's status bar to match the screen underneath.
 *
 * Android paints its browser chrome with `theme-color`, so a dark screen under
 * a white bar reads as a web page in a browser. Matching them is most of what
 * makes an app look like it owns the display.
 */
export const DARK_SCREEN = '#0f172a'
export const LIGHT_SCREEN = '#ffffff'

export function setStatusBar(color) {
  if (typeof document === 'undefined') return

  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', color)

  // iOS standalone has its own vocabulary and accepts only a few values.
  const ios = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (ios) ios.setAttribute('content', color === LIGHT_SCREEN ? 'default' : 'black-translucent')
}
