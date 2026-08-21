import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

/**
 * Suggestions for a partial property name.
 *
 * Debounced because every keystroke is a request otherwise, and the API's
 * upstream (Nominatim) allows about one a second for the whole application —
 * one impatient typist would spend the budget for everyone.
 *
 * A failed lookup returns no suggestions rather than an error: the field still
 * accepts anything typed into it, so a place search that's down is a missing
 * convenience, not a blocked step.
 */
export function usePlaceSearch(term, { country, enabled = true } = {}) {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(false)

  // Answers can come back out of order — "hote" after "hotel". Only the newest
  // query is allowed to write.
  const latest = useRef(0)

  useEffect(() => {
    const query = term.trim()
    if (!enabled || query.length < 3) {
      setPlaces([])
      setLoading(false)
      return
    }

    const id = ++latest.current
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query })
        if (country) params.set('country', country)
        const data = await api.get(`/places?${params}`)
        if (latest.current === id) setPlaces(data.places ?? [])
      } catch {
        if (latest.current === id) setPlaces([])
      } finally {
        if (latest.current === id) setLoading(false)
      }
    }, 350)

    return () => clearTimeout(timer)
  }, [term, country, enabled])

  return { places, loading }
}
