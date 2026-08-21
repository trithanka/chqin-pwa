import { useState } from 'react'
import { Check, LoaderCircle, MapPin } from 'lucide-react'
import { Field, Input, Select, StepHeader } from '../kit'
import { usePlaceSearch } from '../usePlaceSearch'

// Enough to cover the markets a first deployment plausibly touches. The list
// grows when a property outside it signs up, not before.
const TIMEZONES = [
  ['Asia/Kolkata', 'India — IST (UTC+5:30)'],
  ['Asia/Dubai', 'Gulf — GST (UTC+4)'],
  ['Asia/Singapore', 'Singapore — SGT (UTC+8)'],
  ['Europe/London', 'UK — GMT/BST'],
  ['America/New_York', 'US East — ET'],
]

export default function PropertyStep({ data, patch, errors }) {
  const set = (key, value) => patch('property', { ...data.property, [key]: value })

  // Suggestions are for finding the property, not for editing it afterwards:
  // once one is picked the list closes and typing is back to plain typing.
  const [searching, setSearching] = useState(false)
  const [picked, setPicked] = useState(null)

  const { places, loading } = usePlaceSearch(data.property.name, {
    country: data.property.country,
    enabled: searching,
  })

  const choose = (place) => {
    patch('property', {
      ...data.property,
      name: place.name,
      city: place.city || data.property.city,
      address: place.street || data.property.address,
      country: place.country || data.property.country,
      lat: place.lat,
      lng: place.lng,
    })
    setPicked(place)
    setSearching(false)
  }

  const typeName = (value) => {
    set('name', value)
    setPicked(null)
    setSearching(true)
  }

  const showList = searching && (loading || places.length > 0)

  return (
    <div>
      <StepHeader
        title="Find your property"
        body="Start typing the name — we'll fill in the address. Not listed? Type it all in yourself."
      />

      <div className="flex flex-col gap-5">
        <Field label="Property name" error={errors.name}>
          <div className="relative">
            <Input
              value={data.property.name}
              invalid={!!errors.name}
              onChange={(e) => typeName(e.target.value)}
              onFocus={() => !picked && setSearching(true)}
              autoComplete="off"
              className="pr-11"
            />
            <span className="pointer-events-none absolute inset-y-0 right-0 grid w-11 place-items-center text-onb-muted">
              {loading ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : picked ? (
                <Check size={16} strokeWidth={3} className="text-onb-green" />
              ) : (
                <MapPin size={16} />
              )}
            </span>
          </div>

          {/* Capped and scrolled rather than pushing the rest of the form down
              the page. `overscroll-contain` keeps a flick inside the list from
              carrying on into the page behind it. */}
          {showList && (
            <ul className="mt-2 max-h-[264px] overflow-y-auto overscroll-contain rounded-xl border border-onb-line bg-onb-surface">
              {places.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => choose(place)}
                    className="flex w-full items-start gap-3 border-b border-onb-line px-4 py-3 text-left last:border-0 active:bg-white/[0.03]"
                  >
                    <MapPin size={15} className="mt-0.5 shrink-0 text-onb-green" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold text-onb-text">
                        {place.name}
                      </span>
                      <span className="block truncate text-[12.5px] text-onb-muted">
                        {place.label}
                      </span>
                    </span>
                  </button>
                </li>
              ))}

              {loading && places.length === 0 && (
                <li className="px-4 py-3 text-[13px] text-onb-muted">Searching…</li>
              )}
            </ul>
          )}
        </Field>

        <Field label="City" error={errors.city}>
          <Input
            value={data.property.city}
            invalid={!!errors.city}
            onChange={(e) => set('city', e.target.value)}
          />
        </Field>

        <Field label="Street address" hint="Shown on the check-in confirmation and receipts.">
          <Input
            value={data.property.address}
            onChange={(e) => set('address', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Country">
            <Select value={data.property.country} onChange={(e) => set('country', e.target.value)}>
              <option value="IN">India</option>
              <option value="AE">UAE</option>
              <option value="SG">Singapore</option>
              <option value="GB">UK</option>
              <option value="US">US</option>
            </Select>
          </Field>

          <Field label="Time zone">
            <Select value={data.property.timezone} onChange={(e) => set('timezone', e.target.value)}>
              {TIMEZONES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="text-[13px] leading-relaxed text-onb-muted">
          {picked
            ? 'Location confirmed from the map. Edit anything above if it looks off.'
            : "Check-in and check-out cut-offs run on the property's local time, not the guest's."}
        </p>
      </div>
    </div>
  )
}
