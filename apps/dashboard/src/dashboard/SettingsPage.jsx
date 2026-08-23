import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  BedDouble,
  BellRing,
  BriefcaseBusiness,
  Building2,
  Car,
  Check,
  Clock,
  Coffee,
  Copy,
  CupSoda,
  DoorClosed,
  Eye,
  EyeOff,
  Flower2,
  Globe,
  Layers,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Sparkles,
  Sun,
  Trash2,
  UtensilsCrossed,
  WashingMachine,
  Wifi,
  Wrench,
  X,
} from 'lucide-react'
import { GUEST_SERVICES } from '@chqin/shared'
import { api } from '../api'
import { useApi } from '../useApi'
import Async from '../components/Async'
import { Button, Field, Input, PageHeader, Panel, Select } from '../components/ui'
import { SERVICE } from '../onboarding/services'
import { planRooms } from '../onboarding/rooms'

/**
 * Everything about the property that isn't a guest or a booking.
 * Four modular sections: Property Profile, Rooms & Inventory, Guest Services (WhatsApp), and Stay Essentials & Wi-Fi.
 */

const KINDS = [
  { value: 'hotel', label: 'Hotel' },
  { value: 'resort', label: 'Resort' },
  { value: 'apartment', label: 'Apartment / Homestay' },
  { value: 'villa', label: 'Villa' },
  { value: 'temple', label: 'Temple / Ashram' },
  { value: 'station', label: 'Transit / Station' },
  { value: 'office', label: 'Office / Co-living' },
  { value: 'other', label: 'Other Property' },
]

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST, UTC+05:30)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST, UTC+04:00)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT, UTC+08:00)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (ICT, UTC+07:00)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST, UTC+09:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST, UTC+00:00)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST, UTC+01:00)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST, UTC+01:00)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT, UTC-05:00)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT, UTC-06:00)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT, UTC-08:00)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT, UTC+10:00)' },
]

const ROOM_TYPES = [
  'Standard Room',
  'Deluxe Room',
  'Executive Suite',
  'King Suite',
  'Twin Room',
  'Family Suite',
  'Penthouse',
]

/** Phone validation matching the API schema */
const PHONE = /^\+?[0-9][0-9 -]{7,17}$/
const ROOMS_SHOWN = 24
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function useSavedFlag() {
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [saved])
  return [saved, setSaved]
}

/** Modern iOS-style toggle switch */
function Switch({ checked, onChange, disabled = false, ariaLabel }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
        checked ? 'bg-brand' : 'bg-slate-200'
      } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

/** Standard section wrapper with unified header rhythm and save state */
function Section({
  icon: Icon,
  title,
  description,
  dirty,
  saving,
  saved,
  failure,
  onSave,
  saveLabel = 'Save changes',
  disabled,
  badge,
  children,
  className = '',
}) {
  return (
    <Panel className={`flex flex-col p-6 sm:p-7 ${className}`}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5">
        <div className="flex items-start gap-3.5 min-w-0">
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-blue-500/15">
            <Icon size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-[17px] font-bold tracking-[-0.02em] text-slate-900">{title}</h2>
              {badge}
            </div>
            <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>

        {onSave && (
          <div className="flex shrink-0 items-center gap-3">
            <span aria-live="polite" className="sr-only">
              {saved ? `${title} saved` : ''}
            </span>
            {saved && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[12.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200/80 animate-in fade-in">
                <Check size={14} strokeWidth={2.5} />
                Saved
              </span>
            )}
            {!saved && dirty && (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-amber-600">
                <span className="size-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
            <Button
              size="sm"
              onClick={onSave}
              loading={saving}
              disabled={disabled || !dirty}
              tone={dirty ? 'primary' : 'secondary'}
            >
              {saveLabel}
            </Button>
          </div>
        )}
      </div>

      {failure && (
        <div className="mb-5 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700 border border-red-100">
          <AlertCircle size={16} className="shrink-0" />
          <span>{failure}</span>
        </div>
      )}

      {children}
    </Panel>
  )
}

export default function SettingsPage() {
  const [tab, setTab] = useState('all')

  const TABS = [
    { id: 'all', label: 'All Settings', icon: Layers },
    { id: 'property', label: 'Property Profile', icon: Building2 },
    { id: 'rooms', label: 'Rooms & Inventory', icon: DoorClosed },
    { id: 'services', label: 'Guest Services', icon: Sparkles },
    { id: 'essentials', label: 'Stay Essentials & Wi-Fi', icon: Wifi },
  ]

  return (
    <div className="pb-12">
      <PageHeader
        title="Settings"
        subtitle="Manage your property profile, room inventory, WhatsApp guest services, and on-stay amenities."
      />

      {/* Segmented Sub-Navigation Bar */}
      <div className="mb-7 flex overflow-x-auto rounded-2xl bg-slate-200/70 p-1.5 shadow-2xs gap-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold transition-all cursor-pointer ${
              tab === id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Icon size={16} className={tab === id ? 'text-brand' : 'text-slate-400'} />
            {label}
          </button>
        ))}
      </div>

      {/* Content views */}
      <div className="space-y-7">
        {(tab === 'all' || tab === 'property') && <PropertyPanel />}
        {(tab === 'all' || tab === 'rooms') && <RoomsPanel />}
        {(tab === 'all' || tab === 'services' || tab === 'essentials') && (
          <div className="space-y-7">
            {(tab === 'all' || tab === 'services') && <GuestServicesPanel />}
            {(tab === 'all' || tab === 'essentials') && <StayEssentialsPanel />}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Property Profile Panel                                          */
/* ------------------------------------------------------------------ */

function PropertyPanel() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/property'))

  return (
    <Async loading={loading} error={error} onRetry={reload}>
      {data && <PropertyForm initial={data} />}
    </Async>
  )
}

function PropertyForm({ initial }) {
  const [form, setForm] = useState(initial)
  const [saved, setSaved] = useSavedFlag()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)

  const dirty = !same(form, initial)

  const set = (key) => (e) => {
    setSaved(false)
    setForm((f) => ({ ...f, [key]: e.target.value }))
  }

  const save = async () => {
    setFailure(null)
    setSaving(true)
    try {
      await api.post('/staff/property', {
        name: form.name,
        kind: form.kind,
        location: form.location || null,
        timezone: form.timezone,
        address: form.address ?? {},
      })
      setSaved(true)
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSaving(false)
    }
  }

  // Get current time string in selected timezone
  const currentTimeInTz = useMemo(() => {
    try {
      return new Date().toLocaleTimeString([], {
        timeZone: form.timezone || 'UTC',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return null
    }
  }, [form.timezone])

  return (
    <Section
      icon={Building2}
      title="Property Profile"
      description="The public identity, location and timezone your guests see when they scan your desk code."
      dirty={dirty}
      saving={saving}
      saved={saved}
      failure={failure}
      onSave={save}
      disabled={!form.name?.trim()}
      badge={
        form.kind && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-600">
            {KINDS.find((k) => k.value === form.kind)?.label ?? form.kind}
          </span>
        )
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Property Name" required className="sm:col-span-2">
          <Input
            value={form.name ?? ''}
            onChange={set('name')}
            placeholder="e.g. Hotel Sahara, Palacio Luxury Resort"
          />
        </Field>

        <Field label="Property Type" hint="Defines how your venue is categorized.">
          <Select value={form.kind ?? 'hotel'} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Location / Area"
          hint="Displayed under the property name on guest mobile screens."
        >
          <div className="relative">
            <MapPin
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              value={form.location ?? ''}
              onChange={set('location')}
              placeholder="e.g. Downtown Guwahati, Assam"
              className="pl-9.5"
            />
          </div>
        </Field>

        <Field
          label="Operating Timezone"
          hint={
            currentTimeInTz
              ? `Local time is currently ${currentTimeInTz}`
              : 'Used to calculate daily check-in cut-offs.'
          }
          className="sm:col-span-2"
        >
          <div className="relative">
            <Globe
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Select
              value={form.timezone ?? 'UTC'}
              onChange={set('timezone')}
              className="pl-9.5"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </Select>
          </div>
        </Field>
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Rooms & Inventory Panel                                         */
/* ------------------------------------------------------------------ */

function RoomsPanel() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/rooms'))
  const [mode, setMode] = useState('range') // 'range' | 'single'
  const [range, setRange] = useState({ from: '', to: '', type: 'Standard Room' })
  const [single, setSingle] = useState({ number: '', type: 'Standard Room' })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'free' | 'taken'
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState(null)
  const [failure, setFailure] = useState(null)
  const [expanded, setExpanded] = useState(false)

  const plan = planRooms(range)
  const rooms = data?.rooms ?? []

  const freeCount = rooms.filter((r) => !r.takenBy).length
  const takenCount = rooms.filter((r) => r.takenBy).length

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rooms.filter((r) => {
      if (filter === 'free' && r.takenBy) return false
      if (filter === 'taken' && !r.takenBy) return false
      if (!q) return true
      return (
        (r.number ?? '').toLowerCase().includes(q) ||
        (r.roomType ?? '').toLowerCase().includes(q)
      )
    })
  }, [rooms, query, filter])

  const shown = expanded ? filteredRooms : filteredRooms.slice(0, ROOMS_SHOWN)
  const hidden = filteredRooms.length - shown.length

  const addRange = async () => {
    setFailure(null)
    setNote(null)
    setBusy(true)
    try {
      const result = await api.post('/staff/rooms', {
        rooms: plan.numbers.map((number) => ({ number, type: range.type })),
      })
      setNote(
        result.skipped
          ? `Added ${result.added.length} rooms. ${result.skipped} already existed.`
          : `Successfully added ${result.added.length} rooms.`,
      )
      setRange((r) => ({ ...r, from: '', to: '' }))
      reload()
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  const addSingle = async () => {
    if (!single.number.trim()) return
    setFailure(null)
    setNote(null)
    setBusy(true)
    try {
      const result = await api.post('/staff/rooms', {
        rooms: [{ number: single.number.trim(), type: single.type }],
      })
      setNote(
        result.skipped
          ? `Room ${single.number} already exists.`
          : `Successfully added Room ${single.number}.`,
      )
      setSingle((s) => ({ ...s, number: '' }))
      reload()
    } catch (err) {
      setFailure(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (room) => {
    setFailure(null)
    setNote(null)
    try {
      await api.del(`/staff/rooms/${room.id}`)
      reload()
    } catch (err) {
      setFailure(err.message)
    }
  }

  return (
    <Section
      icon={DoorClosed}
      title="Rooms & Inventory"
      description="Manage all guest rooms and room types. Occupied rooms cannot be deleted."
      failure={failure}
      badge={
        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-brand ring-1 ring-blue-200">
          {rooms.length} total rooms
        </span>
      }
    >
      {/* Quick Inventory Summary Stat Tiles */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Rooms</p>
          <p className="mt-1 text-[22px] font-extrabold text-slate-900 tabular-nums">{rooms.length}</p>
        </div>
        <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/40 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Available</p>
          <p className="mt-1 text-[22px] font-extrabold text-emerald-700 tabular-nums">{freeCount}</p>
        </div>
        <div className="rounded-xl border border-blue-200/60 bg-blue-50/40 p-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">In House</p>
          <p className="mt-1 text-[22px] font-extrabold text-blue-700 tabular-nums">{takenCount}</p>
        </div>
      </div>

      {/* Add Rooms Card */}
      <div className="mb-6 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4.5">
        <div className="mb-3.5 flex items-center justify-between">
          <h3 className="text-[13.5px] font-bold text-slate-800">Add New Rooms</h3>
          <div className="inline-flex rounded-lg bg-slate-200/70 p-0.5">
            <button
              type="button"
              onClick={() => setMode('range')}
              className={`rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition-all cursor-pointer ${
                mode === 'range' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Number Range
            </button>
            <button
              type="button"
              onClick={() => setMode('single')}
              className={`rounded-[7px] px-2.5 py-1 text-[12px] font-semibold transition-all cursor-pointer ${
                mode === 'single' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Single Room
            </button>
          </div>
        </div>

        {mode === 'range' ? (
          <div>
            <div className="grid gap-3 sm:grid-cols-4 items-end">
              <Field label="From number">
                <Input
                  value={range.from}
                  inputMode="numeric"
                  onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                  placeholder="101"
                />
              </Field>
              <Field label="To number">
                <Input
                  value={range.to}
                  inputMode="numeric"
                  onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                  placeholder="110"
                />
              </Field>
              <Field label="Room Category">
                <Select
                  value={range.type}
                  onChange={(e) => setRange((r) => ({ ...r, type: e.target.value }))}
                >
                  {ROOM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                icon={Plus}
                onClick={addRange}
                loading={busy}
                disabled={!plan.numbers.length || Boolean(plan.error)}
              >
                Add {plan.numbers.length ? `${plan.numbers.length} Rooms` : 'Rooms'}
              </Button>
            </div>

            <p className="mt-2 min-h-[18px] text-[12.5px]">
              {plan.error ? (
                <span className="font-semibold text-red-600">{plan.error}</span>
              ) : note ? (
                <span className="font-semibold text-emerald-600">{note}</span>
              ) : plan.numbers.length > 0 ? (
                <span className="text-slate-500">
                  Adds {plan.numbers.length} rooms: {plan.numbers.slice(0, 8).join(', ')}
                  {plan.numbers.length > 8 ? ` … ${plan.numbers.at(-1)}` : ''} ({range.type})
                </span>
              ) : null}
            </p>
          </div>
        ) : (
          <div>
            <div className="grid gap-3 sm:grid-cols-3 items-end">
              <Field label="Room Number">
                <Input
                  value={single.number}
                  onChange={(e) => setSingle((s) => ({ ...s, number: e.target.value }))}
                  placeholder="e.g. 205, PH-1"
                />
              </Field>
              <Field label="Room Category">
                <Select
                  value={single.type}
                  onChange={(e) => setSingle((s) => ({ ...s, type: e.target.value }))}
                >
                  {ROOM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                icon={Plus}
                onClick={addSingle}
                loading={busy}
                disabled={!single.number.trim()}
              >
                Add Room
              </Button>
            </div>

            {note && (
              <p className="mt-2 text-[12.5px] font-semibold text-emerald-600">{note}</p>
            )}
          </div>
        )}
      </div>

      {/* Inventory Search & Filters */}
      <Async loading={loading} error={error} onRetry={reload}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              {[
                ['all', `All (${rooms.length})`],
                ['free', `Available (${freeCount})`],
                ['taken', `In Use (${takenCount})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all cursor-pointer ${
                    filter === key
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search rooms..."
                className="h-9 w-44 rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/10"
              />
            </div>
          </div>

          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 rounded-2xl border border-dashed border-slate-200 text-center">
              <BedDouble size={28} className="mb-2 text-slate-300" strokeWidth={1.5} />
              <p className="text-[14px] font-semibold text-slate-700">No rooms found</p>
              <p className="text-[12.5px] text-slate-400 max-w-xs mt-0.5">
                {rooms.length === 0
                  ? 'Add your first room range above to begin assigning rooms to walk-in guests.'
                  : 'No rooms match your filter or search query.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {shown.map((room) => {
                const isTaken = Boolean(room.takenBy)
                return (
                  <div
                    key={room.id}
                    className={`group relative flex items-center justify-between rounded-xl border p-2.5 transition-all ${
                      isTaken
                        ? 'border-slate-200/70 bg-slate-50/70 text-slate-400'
                        : 'border-slate-200 bg-white hover:border-brand/50 hover:shadow-2xs'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <BedDouble
                          size={14}
                          className={isTaken ? 'text-slate-400' : 'text-slate-600'}
                        />
                        <span
                          className={`font-bold text-[14px] tabular-nums tracking-tight ${
                            isTaken ? 'text-slate-500' : 'text-slate-900'
                          }`}
                        >
                          {room.number}
                        </span>
                      </div>
                      {room.roomType && (
                        <p className="truncate text-[11px] font-medium text-slate-400 mt-0.5">
                          {room.roomType}
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 ml-1.5">
                      {isTaken ? (
                        <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
                          in use
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => remove(room)}
                          aria-label={`Remove room ${room.number}`}
                          className="opacity-0 group-hover:opacity-100 rounded-md p-1 text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {hidden > 0 && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                Show all {filteredRooms.length} rooms (+{hidden} more)
              </button>
            </div>
          )}
          {expanded && filteredRooms.length > ROOMS_SHOWN && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer"
              >
                Show fewer
              </button>
            </div>
          )}
        </div>
      </Async>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Guest Services Panel (WhatsApp Routing)                         */
/* ------------------------------------------------------------------ */

/** Helper to extract only the 10-digit mobile number */
const to10Digits = (phone) => {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2, 12)
  }
  return digits.slice(0, 10)
}

/** Format 10 digits to standard +91 E.164 string for API */
const toApiPhone = (digits) => {
  const clean = (digits ?? '').replace(/\D/g, '').slice(0, 10)
  return clean ? `+91 ${clean}` : ''
}

function GuestServicesPanel() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/settings'))

  return (
    <Async loading={loading} error={error} onRetry={reload}>
      {data && <GuestServicesForm initial={data} />}
    </Async>
  )
}

function GuestServicesForm({ initial }) {
  const [services, setServices] = useState(initial.services ?? [])
  const [contacts, setContacts] = useState(() => {
    const raw = initial.contacts ?? {}
    const parsed = {}
    for (const [k, v] of Object.entries(raw)) {
      parsed[k] = to10Digits(v)
    }
    return parsed
  })
  const [showErrors, setShowErrors] = useState(false)
  const [saved, setSaved] = useSavedFlag()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)

  const initial10Digits = useMemo(() => {
    const raw = initial.contacts ?? {}
    const parsed = {}
    for (const [k, v] of Object.entries(raw)) {
      parsed[k] = to10Digits(v)
    }
    return parsed
  }, [initial.contacts])

  const dirty =
    !same([...services].sort(), [...(initial.services ?? [])].sort()) ||
    !same(contacts, initial10Digits)

  const errors = {}
  for (const key of services) {
    const digits = (contacts[key] ?? '').trim()
    if (!digits) {
      errors[key] = 'Enter a 10-digit mobile number, or turn off this service.'
    } else if (digits.length !== 10) {
      errors[key] = `Please enter all 10 digits (${digits.length}/10 entered).`
    }
  }

  const touch = (fn) => {
    setSaved(false)
    fn()
  }

  const handlePhoneChange = (key, val) => {
    // Only digits allowed, max 10 digits
    const digits = val.replace(/\D/g, '').slice(0, 10)
    touch(() => setContacts((c) => ({ ...c, [key]: digits })))
  }

  const toggle = (key, nextVal) =>
    touch(() => {
      setServices((list) => (nextVal ? [...new Set([...list, key])] : list.filter((s) => s !== key)))
    })

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
        essentials: initial.essentials ?? {},
        contacts: Object.fromEntries(
          services.map((k) => [k, toApiPhone(contacts[k])]),
        ),
      })
      const parsed = {}
      for (const [k, v] of Object.entries(next.contacts ?? {})) {
        parsed[k] = to10Digits(v)
      }
      setContacts(parsed)
      setSaved(true)
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      icon={Sparkles}
      title="Guest Room Services"
      description="Active services appear as interactive tiles on the guest's mobile stay screen. Inquiries route directly to your WhatsApp desk numbers."
      dirty={dirty}
      saving={saving}
      saved={saved}
      failure={failure}
      onSave={save}
      saveLabel="Save Services"
      badge={
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
          {services.length} active services
        </span>
      }
    >
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {GUEST_SERVICES.map((key) => {
          const { label, sub, icon: Icon } = SERVICE[key]
          const on = services.includes(key)
          const invalid = showErrors && Boolean(errors[key])

          return (
            <div
              key={key}
              className={`flex flex-col justify-between rounded-2xl border p-4.5 transition-all ${
                on
                  ? 'border-brand/40 bg-brand-soft/30 shadow-2xs'
                  : 'border-slate-200/80 bg-white hover:border-slate-300'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
                        on
                          ? 'bg-brand text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon size={19} strokeWidth={2} />
                    </div>
                    <div>
                      <h4 className="text-[14px] font-bold text-slate-900 leading-tight">
                        {label}
                      </h4>
                      <p className="text-[12px] font-medium text-slate-400">{sub}</p>
                    </div>
                  </div>

                  <Switch
                    checked={on}
                    onChange={(val) => toggle(key, val)}
                    ariaLabel={`Toggle ${label}`}
                  />
                </div>

                {on && (
                  <div className="mt-4 pt-3.5 border-t border-blue-100/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-[12px] font-semibold text-slate-700">
                        WhatsApp Number
                      </label>
                      <span className="text-[11px] font-medium text-slate-400">
                        {(contacts[key] ?? '').length}/10 digits
                      </span>
                    </div>

                    <div
                      className={`flex items-center rounded-xl border bg-white overflow-hidden transition-all ${
                        invalid
                          ? 'border-red-300 ring-3 ring-red-500/10'
                          : 'border-slate-200 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border-r border-slate-200 text-slate-700 text-[13px] font-bold select-none shrink-0">
                        <MessageSquare size={14} className="text-emerald-600" />
                        <span>+91</span>
                      </div>
                      <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        value={contacts[key] ?? ''}
                        onChange={(e) => handlePhoneChange(key, e.target.value)}
                        placeholder="9876543210"
                        aria-label={`${label} 10-digit WhatsApp number`}
                        className="h-10 w-full bg-transparent px-3 text-[14px] font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none tabular-nums tracking-wide"
                      />
                    </div>

                    {invalid && (
                      <p className="mt-1.5 text-[11.5px] font-medium text-red-600">
                        {errors[key]}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Stay Essentials & Wi-Fi Panel                                   */
/* ------------------------------------------------------------------ */

function StayEssentialsPanel() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/settings'))

  return (
    <Async loading={loading} error={error} onRetry={reload}>
      {data && <StayEssentialsForm initial={data} />}
    </Async>
  )
}

function StayEssentialsForm({ initial }) {
  const [essentials, setEssentials] = useState(initial.essentials ?? {})
  const [showPassword, setShowPassword] = useState(false)
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useSavedFlag()
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState(null)

  const dirty = !same(essentials, initial.essentials ?? {})

  const touch = (fn) => {
    setSaved(false)
    fn()
  }

  const set = (key) => (e) => {
    touch(() => setEssentials((s) => ({ ...s, [key]: e.target.value })))
  }

  const copyPassword = () => {
    if (!essentials.wifiPassword) return
    navigator.clipboard.writeText(essentials.wifiPassword)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const save = async () => {
    setFailure(null)
    setSaving(true)
    try {
      await api.post('/staff/settings', {
        services: initial.services ?? [],
        contacts: initial.contacts ?? {},
        essentials,
      })
      setSaved(true)
    } catch (err) {
      setFailure(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Section
      icon={Wifi}
      title="Stay Essentials & Amenities"
      description="Essential Wi-Fi credentials, meal timings, and house guidelines shown to checked-in guests."
      dirty={dirty}
      saving={saving}
      saved={saved}
      failure={failure}
      onSave={save}
      saveLabel="Save Essentials"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Wi-Fi & Connectivity Card */}
        <div className="rounded-2xl border border-blue-200/80 bg-blue-50/30 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500 text-white">
                <Wifi size={17} strokeWidth={2.2} />
              </div>
              <h3 className="text-[14.5px] font-bold text-slate-900">Guest Wi-Fi Connection</h3>
            </div>

            <div className="space-y-3.5">
              <Field label="Wi-Fi Network Name (SSID)">
                <Input
                  value={essentials.wifiSsid ?? ''}
                  onChange={set('wifiSsid')}
                  placeholder="e.g. HotelSahara_Guest_5G"
                />
              </Field>

              <Field label="Wi-Fi Password" hint="Guests see and copy this from their phone.">
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={essentials.wifiPassword ?? ''}
                    onChange={set('wifiPassword')}
                    placeholder="Guest Wi-Fi Password"
                    className="pr-20"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label="Toggle password visibility"
                      className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                    {essentials.wifiPassword && (
                      <button
                        type="button"
                        onClick={copyPassword}
                        aria-label="Copy password"
                        className="rounded-lg p-1.5 text-slate-400 hover:text-brand hover:bg-blue-50 transition-colors cursor-pointer"
                      >
                        {copied ? (
                          <Check size={15} className="text-emerald-600" />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </Field>
            </div>
          </div>

          {/* Live Mobile Guest Preview Badge */}
          {essentials.wifiSsid && (
            <div className="mt-5 rounded-xl border border-blue-200/90 bg-white p-3.5 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand">
                Guest View Preview
              </p>
              <div className="mt-2 flex items-center justify-between">
                <div>
                  <p className="text-[13.5px] font-bold text-slate-900">{essentials.wifiSsid}</p>
                  <p className="text-[12px] font-mono text-slate-500">
                    {essentials.wifiPassword ? '••••••••' : 'No password'}
                  </p>
                </div>
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700">
                  Auto-connectable
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Timings & House Guidelines */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500 text-white">
                <Coffee size={17} strokeWidth={2.2} />
              </div>
              <h3 className="text-[14.5px] font-bold text-slate-900">Breakfast & Check-Out</h3>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Breakfast Starts">
                <div className="relative">
                  <Sun
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    value={essentials.breakfastFrom ?? ''}
                    onChange={set('breakfastFrom')}
                    placeholder="07:00"
                    className="pl-9.5"
                  />
                </div>
              </Field>

              <Field label="Breakfast Until">
                <div className="relative">
                  <Coffee
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    value={essentials.breakfastTo ?? ''}
                    onChange={set('breakfastTo')}
                    placeholder="10:30"
                    className="pl-9.5"
                  />
                </div>
              </Field>

              <Field label="Check-Out By" className="sm:col-span-2">
                <div className="relative">
                  <Clock
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <Input
                    value={essentials.checkoutTime ?? ''}
                    onChange={set('checkoutTime')}
                    placeholder="11:00 AM"
                    className="pl-9.5"
                  />
                </div>
              </Field>
            </div>
          </div>

          <Field
            label="Additional Guidelines & Notes"
            hint="Swimming pool timings, parking instructions, or lift maintenance notes."
          >
            <div className="relative">
              <textarea
                value={essentials.notes ?? ''}
                onChange={(e) => touch(() => setEssentials((s) => ({ ...s, notes: e.target.value })))}
                rows={3}
                maxLength={500}
                placeholder="e.g. Swimming pool is open from 6 AM to 9 PM on the 4th floor. Valet parking is available at the main porch."
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 transition-colors placeholder:text-slate-400 focus:border-brand focus:outline-none focus:ring-4 focus:ring-brand/12"
              />
              <span className="absolute bottom-2.5 right-3 text-[11px] font-medium text-slate-400">
                {(essentials.notes ?? '').length}/500
              </span>
            </div>
          </Field>
        </div>
      </div>
    </Section>
  )
}
