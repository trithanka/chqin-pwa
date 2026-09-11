import { config } from '../config.js'
import { ApiError } from '../lib/errors.js'

/**
 * Place lookup for onboarding — "type your hotel's name, pick it off a list".
 *
 * Proxied rather than called from the browser for two reasons that both come
 * from Nominatim's usage policy: it wants one identifiable User-Agent per
 * application, and it caps use at roughly one request a second across that
 * application. Neither is something a browser can promise.
 *
 * https://operations.osmfoundation.org/policies/nominatim/
 */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search'

// The policy asks for a real contact address, not a browser's UA string.
const USER_AGENT = `ChqIn/0.1 (+${config.CONTACT_URL})`

/**
 * ponytail: one in-process cache and one in-process gate. Correct for a single
 * API instance, which is what runs today. Two instances would each get their
 * own second — move both to Redis (or a shared token bucket) before scaling
 * out, or self-host Nominatim and drop the gate entirely.
 */
const cache = new Map()
const CACHE_TTL = 10 * 60_000
const CACHE_MAX = 300
const MIN_INTERVAL = 1100

let nextSlot = 0

/**
 * Oldest-out rather than a real LRU: this exists to blunt repeated keystroke
 * prefixes, not to be a cache anyone tunes. It matters more with Google, where
 * every miss is billed.
 */
function remember(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value)
  cache.set(key, { value, expires: Date.now() + CACHE_TTL })
}

/** Resolves when this caller is allowed to hit Nominatim. */
function waitForSlot() {
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + MIN_INTERVAL
  return at === now ? Promise.resolve() : new Promise((r) => setTimeout(r, at - now))
}

/**
 * Nominatim's address object is a bag of whatever the place happened to be
 * tagged with — a hotel might carry `city`, `town`, `village`, or only a
 * `state_district`. Take the first that exists rather than assuming one.
 */
const cityOf = (address = {}) =>
  address.city ??
  address.town ??
  address.village ??
  address.municipality ??
  address.county ??
  address.state_district ??
  address.state ??
  ''

/**
 * The street line, without the city and country repeated after it — those get
 * their own fields in the form, and a duplicate reads as a mistake.
 */
const streetOf = (address = {}) =>
  [address.house_number, address.road, address.suburb, address.neighbourhood]
    .filter(Boolean)
    .join(', ')

const toSuggestion = (row) => ({
  id: `${row.osm_type ?? 'n'}${row.osm_id}`,
  // `name` is the place itself ("Hotel Palacio"); display_name is the whole
  // comma-separated address, which is not what goes in a name field.
  name: row.name || row.display_name.split(',')[0].trim(),
  street: streetOf(row.address),
  city: cityOf(row.address),
  country: (row.address?.country_code ?? '').toUpperCase(),
  label: row.display_name,
  lat: Number(row.lat),
  lng: Number(row.lon),
})

/* ------------------------------------------------------------------ */
/* Google Places (New)                                                 */
/* ------------------------------------------------------------------ */

const GOOGLE_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'

/**
 * Text Search rather than Autocomplete: one billed call returns the address
 * components the form needs, where Autocomplete would need a second Details
 * call per pick. The field mask is what keeps it on the cheaper SKU — asking
 * for every field bills as if we used every field.
 */
const GOOGLE_FIELDS = [
  'places.id',
  'places.displayName',
  'places.shortFormattedAddress',
  'places.formattedAddress',
  'places.addressComponents',
  'places.location',
].join(',')

const componentOf = (components = [], type) =>
  components.find((c) => c.types?.includes(type))?.shortText ?? ''

const fromGoogle = (place) => {
  const parts = place.addressComponents ?? []
  return {
    id: place.id,
    name: place.displayName?.text ?? place.formattedAddress ?? '',
    street: [componentOf(parts, 'street_number'), componentOf(parts, 'route')]
      .filter(Boolean)
      .join(' '),
    city:
      componentOf(parts, 'locality') ||
      componentOf(parts, 'administrative_area_level_2') ||
      componentOf(parts, 'administrative_area_level_1'),
    country: componentOf(parts, 'country').toUpperCase(),
    label: place.formattedAddress ?? place.shortFormattedAddress ?? '',
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
  }
}

async function searchGoogle({ q, country }) {
  let response
  try {
    response = await fetch(GOOGLE_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': config.GOOGLE_PLACES_KEY,
        'x-goog-fieldmask': GOOGLE_FIELDS,
      },
      body: JSON.stringify({
        textQuery: q,
        // Hotels, guest houses and the like — the only thing anyone is
        // onboarding, and it keeps restaurants out of the list.
        includedType: 'lodging',
        maxResultCount: 10,
        languageCode: 'en',
        ...(country ? { regionCode: country.toUpperCase() } : {}),
      }),
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    throw new ApiError('places_unavailable', "Couldn't reach the place search. Type it in instead.", 503)
  }

  if (!response.ok) {
    // The body carries Google's own reason (bad key, API not enabled, quota),
    // which is the difference between a five-minute fix and an afternoon.
    const detail = await response.text().catch(() => '')
    console.warn(`[places] Google ${response.status} — ${detail.slice(0, 300)}`)
    throw new ApiError('places_unavailable', "Couldn't reach the place search. Type it in instead.", 503)
  }

  return ((await response.json()).places ?? []).map(fromGoogle)
}

/** Suggestions for a partial name. Empty array is a normal answer. */
export async function searchPlaces({ q, country }) {
  const query = q.trim()
  if (query.length < 3) return []

  const key = `${country ?? ''}:${query.toLowerCase()}`
  const hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.value

  if (config.GOOGLE_PLACES_KEY) {
    const value = await searchGoogle({ q: query, country })
    remember(key, value)
    return value
  }

  const url = new URL(ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('addressdetails', '1')
  // Enough to be worth scrolling. Nominatim's own cap is 40; more than this
  // is a sign the name was too vague to pick from a list anyway.
  url.searchParams.set('limit', '10')
  if (country) url.searchParams.set('countrycodes', country.toLowerCase())

  await waitForSlot()

  let response
  try {
    response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, 'accept-language': 'en' },
      signal: AbortSignal.timeout(6000),
    })
  } catch {
    // A place lookup being down must not block onboarding — the person can
    // still type the name themselves, so say that rather than failing hard.
    throw new ApiError('places_unavailable', "Couldn't reach the place search. Type it in instead.", 503)
  }

  if (!response.ok) {
    throw new ApiError('places_unavailable', "Couldn't reach the place search. Type it in instead.", 503)
  }

  const value = (await response.json()).map(toSuggestion)
  remember(key, value)
  return value
}
