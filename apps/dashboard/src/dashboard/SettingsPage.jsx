import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { GUEST_SERVICES } from '@chqin/shared'
import { api } from '../api'
import { useApi } from '../useApi'
import Async from '../components/Async'
import { Button, Field, Input, PageHeader, Panel } from '../components/ui'
import { SERVICE } from '../onboarding/services'

/**
 * What the property offers, editable after onboarding.
 *
 * The same three fields the wizard collects — which services are on, where
 * each one's requests go, and the four answers every guest asks the desk. A
 * property changes these far more often than it registers, so they cannot live
 * only inside a one-time wizard.
 *
 * ponytail: turning on Food still doesn't ask for a menu, and Laundry doesn't
 * ask for a rate card — same deferral as onboarding's ServicesStep. A request
 * routes to a number on WhatsApp and the guest says what they want in words.
 * Revisit when the guest app can show a menu and the API can hold an order.
 */

const ESSENTIALS = [
  { key: 'wifiSsid', label: 'Wi-Fi network', placeholder: 'HotelPalacio_Guest' },
  { key: 'wifiPassword', label: 'Wi-Fi password', placeholder: 'The guest sees this in full' },
  { key: 'breakfastFrom', label: 'Breakfast from', placeholder: '07:00' },
  { key: 'breakfastTo', label: 'Breakfast until', placeholder: '10:30' },
  { key: 'checkoutTime', label: 'Check-out by', placeholder: '11:00' },
]

/** Mirrors the API's phoneSchema — a 400 is a poor way to learn the format. */
const PHONE = /^\+?[0-9][0-9 -]{7,17}$/

export default function SettingsPage() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/settings'))

  return (
    <Async loading={loading} error={error} onRetry={reload}>
      {data && <SettingsForm initial={data} />}
    </Async>
  )
}

function SettingsForm({ initial }) {
  const [services, setServices] = useState(initial.services ?? [])
  const [contacts, setContacts] = useState(initial.contacts ?? {})
  const [essentials, setEssentials] = useState(initial.essentials ?? {})
  const [showErrors, setShowErrors] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [failure, setFailure] = useState(null)

  // A saved badge that stays up forever stops meaning "just now".
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [saved])

  /**
   * A service with no number behind it is invisible to the guest — the stay
   * screen drops it — so an owner who ticks Spa and leaves the field blank
   * would otherwise save a setting that quietly does nothing.
   */
  const errors = {}
  for (const key of services) {
    const number = (contacts[key] ?? '').trim()
    if (!number) errors[key] = 'Add a number, or turn this off — guests never see it otherwise.'
    else if (!PHONE.test(number)) errors[key] = 'Include the country code, like +91 98765 43210.'
  }

  const toggle = (key) => {
    setSaved(false)
    setServices((list) => (list.includes(key) ? list.filter((s) => s !== key) : [...list, key]))
  }

  const save = async () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true)
      return
    }
    setShowErrors(false)
    setFailure(null)
    setSaving(true)
    try {
      const next = await api.post('/staff/settings', {
        services,
        essentials,
        // Trimmed here so a trailing space isn't what a 400 is about.
        contacts: Object.fromEntries(services.map((k) => [k, (contacts[k] ?? '').trim()])),
      })
      setContacts(next.contacts ?? {})
      setSaved(true)
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader
        title="What your property offers"
        subtitle="Guests see these on their room screen once they've checked in."
        actions={
          <div className="flex items-center gap-3">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
                <Check size={15} strokeWidth={2.4} />
                Saved
              </span>
            )}
            <Button onClick={save} loading={saving}>
              Save changes
            </Button>
          </div>
        }
      />

      {failure && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-[13.5px] font-medium text-red-700">
          {failure}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-slate-900">Services</h2>
          <p className="mt-1 mb-4 text-[13px] text-slate-500">
            Each one on becomes a button in the guest's room, and the requests go to the number
            beside it on WhatsApp.
          </p>

          <div className="divide-y divide-slate-100">
            {GUEST_SERVICES.map((key) => {
              const { label, sub, icon: Icon } = SERVICE[key]
              const on = services.includes(key)
              return (
                <div key={key} className="py-3 first:pt-0 last:pb-0">
                  <label className="flex cursor-pointer items-center gap-3">
                    <Icon size={17} className={on ? 'text-brand' : 'text-slate-300'} strokeWidth={2} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[14px] font-semibold text-slate-800">
                        {label}
                      </span>
                      <span className="block truncate text-[12.5px] text-slate-500">{sub}</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(key)}
                      className="size-5 shrink-0 accent-brand"
                    />
                  </label>

                  {on && (
                    <div className="mt-2.5 pl-[29px]">
                      <Input
                        value={contacts[key] ?? ''}
                        onChange={(e) => {
                          setSaved(false)
                          setContacts((c) => ({ ...c, [key]: e.target.value }))
                        }}
                        placeholder="+91 98765 43210"
                        inputMode="tel"
                        aria-label={`${label} number`}
                        invalid={showErrors && Boolean(errors[key])}
                      />
                      {showErrors && errors[key] && (
                        <p className="mt-1.5 text-[12.5px] font-medium text-red-600">
                          {errors[key]}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Panel>

        <Panel className="h-fit p-5">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-slate-900">Essentials</h2>
          <p className="mt-1 mb-4 text-[13px] text-slate-500">
            The questions every guest asks the desk. Anything left blank is simply not shown.
          </p>

          <div className="grid gap-3.5 sm:grid-cols-2">
            {ESSENTIALS.map(({ key, label, placeholder }) => (
              <Field key={key} label={label}>
                <Input
                  value={essentials[key] ?? ''}
                  onChange={(e) => {
                    setSaved(false)
                    setEssentials((s) => ({ ...s, [key]: e.target.value }))
                  }}
                  placeholder={placeholder}
                />
              </Field>
            ))}
          </div>

          <Field
            className="mt-3.5"
            label="Anything else"
            hint="One or two lines — pool hours, a parking note, the lift being out."
          >
            <textarea
              value={essentials.notes ?? ''}
              onChange={(e) => {
                setSaved(false)
                setEssentials((s) => ({ ...s, notes: e.target.value }))
              }}
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14.5px] text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/12"
            />
          </Field>
        </Panel>
      </div>
    </>
  )
}
