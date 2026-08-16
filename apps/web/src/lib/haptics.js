/**
 * Haptic feedback.
 *
 * The cheapest "this is an app" cue on a phone: a tap that answers physically
 * feels responsive even when the network isn't.
 *
 * Android fires these through the Vibration API; iOS Safari ignores them
 * entirely, so nothing here can be load-bearing — it's decoration that some
 * devices happen to render.
 */

const buzz = (pattern) => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* unsupported, or switched off — never worth an error */
  }
}

/** A press landed. */
export const tapped = () => buzz(8)

/** Something completed. */
export const succeeded = () => buzz([12, 40, 24])

/** Something went wrong: longer and blunter. */
export const failed = () => buzz([30, 60, 30])
