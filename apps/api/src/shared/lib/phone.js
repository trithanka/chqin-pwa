/** Phone numbers as WhatsApp wants them. */

export const digits = (value) => String(value ?? '').replace(/\D/g, '')

/** Meta wants the country code and nothing else. A bare 10-digit number is Indian. */
export const waNumber = (value) => {
  const d = digits(value)
  return d.length === 10 ? `91${d}` : d
}
