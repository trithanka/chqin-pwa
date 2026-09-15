import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  BedDouble,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  DoorClosed,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react'
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Panel,
  SearchInput,
  StatTile,
  StatusPill,
  TableWrap,
  Td,
  Th,
} from '../components/ui'
import { api } from '../api'
import Async from '../components/Async'
import { journeyOf, statusOf } from '../labels'
import { useApi } from '../useApi'

const time = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Modern Front Desk Overview.
 * High-aesthetic desk tool designed for fast glanceability, real-time tracking,
 * and quick room assignments.
 */
export default function TodayPage() {
  const { data, error, loading, reload } = useApi(() => api.get('/staff/overview'))
  const { data: roomData, reload: reloadRooms } = useApi(() =>
    api.get('/staff/rooms').catch(() => ({ rooms: [] })),
  )

  const [activeFilter, setActiveFilter] = useState('all') // 'all' | 'awaiting' | 'checked_in'
  const [searchQuery, setSearchQuery] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)

  const arrivals = data?.arrivals ?? []
  const checkedIn = arrivals.filter((b) => b.status === 'checked_in')
  const awaiting = arrivals.filter((b) => b.status === 'confirmed')
  const totalRooms = data?.rooms ?? 0
  const inHouse = data?.inHouse ?? 0
  const occupancyRate = totalRooms > 0 ? inHouse / totalRooms : 0

  const refresh = async () => {
    setIsRefreshing(true)
    await Promise.allSettled([reload(), reloadRooms()])
    setTimeout(() => setIsRefreshing(false), 400)
  }

  // Filter and sort arrivals
  const rows = useMemo(() => {
    let list = [...arrivals]

    if (activeFilter === 'checked_in') {
      list = list.filter((b) => b.status === 'checked_in')
    } else if (activeFilter === 'awaiting') {
      list = list.filter((b) => b.status === 'confirmed')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(
        (b) =>
          b.guestName?.toLowerCase().includes(q) ||
          b.reference?.toLowerCase().includes(q) ||
          b.room?.toString().toLowerCase().includes(q),
      )
    }

    return list.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'confirmed' ? -1 : 1
      return (b.checkedInAt ?? '').localeCompare(a.checkedInAt ?? '')
    })
  }, [arrivals, activeFilter, searchQuery])

  const dateFormatted = new Date().toLocaleDateString([], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="space-y-6">
      {/* Top Header with Greeting & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">
              Front Desk Active
            </span>
          </div>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-[-0.03em] text-slate-900 sm:text-[26px]">
            {getGreeting()}, Front Desk
          </h1>
          <p className="mt-0.5 text-[13.5px] font-medium text-slate-500">{dateFormatted}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            tone="secondary"
            size="sm"
            onClick={refresh}
            disabled={isRefreshing || loading}
            icon={RefreshCw}
            className={isRefreshing ? 'animate-spin' : ''}
          >
            Refresh
          </Button>
          <Link to="/app/code">
            <Button tone="primary" size="sm">
              Desk QR Card
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatTile
          label="Total Arrivals"
          value={arrivals.length}
          sub="Expected today"
          icon={CalendarCheck}
          tone="neutral"
        />
        <StatTile
          label="Checked In"
          value={checkedIn.length}
          sub={`${Math.round((checkedIn.length / Math.max(arrivals.length, 1)) * 100)}% of today's arrivals`}
          icon={CheckCircle2}
          tone="good"
          progress={arrivals.length > 0 ? checkedIn.length / arrivals.length : 0}
        />
        <StatTile
          label="Still to Arrive"
          value={awaiting.length}
          sub={awaiting.length ? 'Awaiting guest check-in' : 'All guests arrived'}
          icon={Clock}
          tone={awaiting.length ? 'warn' : 'good'}
        />
        <StatTile
          label="In House"
          value={inHouse}
          sub={`${inHouse} of ${totalRooms} rooms occupied`}
          icon={BedDouble}
          tone="brand"
          progress={occupancyRate}
        />
      </div>

      {/* Arrivals Management Section */}
      <Panel className="p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-[17px] font-bold tracking-tight text-slate-900">
              Today's Arrivals
            </h2>
            <p className="text-[12.5px] font-medium text-slate-500">
              Real-time check-in status and room assignments
            </p>
          </div>

          {/* Filter Tabs & Search Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-xl bg-slate-100/90 p-1 ring-1 ring-slate-200/50">
              {[
                ['all', `All (${arrivals.length})`],
                ['awaiting', `Awaiting (${awaiting.length})`],
                ['checked_in', `Checked in (${checkedIn.length})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveFilter(key)}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-all ${
                    activeFilter === key
                      ? 'bg-white text-slate-900 shadow-xs ring-1 ring-black/5'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by name, ref, or room..."
              className="w-full sm:w-auto"
            />
          </div>
        </div>

        <Async loading={loading} error={error} onRetry={reload}>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title={arrivals.length === 0 ? 'Nobody due today' : 'No matching arrivals'}
              body={
                arrivals.length === 0
                  ? 'Arrivals appear here as soon as reservations land for today.'
                  : 'Try adjusting your search query or filter tab.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <thead>
                  <tr>
                    <Th>Guest</Th>
                    <Th>Room Assigned</Th>
                    <Th>Booking Reference</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Check-in Time</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100/80">
                  {rows.map((booking) => (
                    <tr
                      key={booking.id}
                      className="group transition-colors hover:bg-slate-50/70"
                    >
                      <Td className="py-3.5">
                        <div className="flex items-center gap-3">
                          <Avatar name={booking.guestName} size="md" />
                          <div className="min-w-0">
                            <ArrivalName arrival={booking} />
                            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                              {journeyOf(booking.journey) && (
                                <span className="text-[11.5px] font-medium text-slate-400">
                                  {journeyOf(booking.journey).label}
                                </span>
                              )}
                              {booking.roomsCount > 1 && (
                                <Badge tone="brand" size="xs">
                                  {booking.roomsCount} Rooms
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </Td>
                      <Td className="py-3.5">
                        <RoomCell
                          arrival={booking}
                          rooms={roomData?.rooms ?? []}
                          onAssigned={refresh}
                        />
                      </Td>
                      <Td className="py-3.5 font-mono text-[13px] font-medium text-slate-600">
                        {booking.reference ?? '—'}
                      </Td>
                      <Td className="py-3.5">
                        <StatusPill
                          tone={statusOf(booking.status).tone}
                          pulse={booking.status === 'confirmed'}
                        >
                          {statusOf(booking.status).label}
                        </StatusPill>
                      </Td>
                      <Td className="py-3.5 text-right font-medium tabular-nums text-slate-600">
                        {booking.checkedInAt ? time(booking.checkedInAt) : '—'}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Panel>
    </div>
  )
}

/**
 * Clickable guest name link.
 */
function ArrivalName({ arrival }) {
  const to =
    arrival.kind === 'booking'
      ? `/app/bookings/${arrival.id}`
      : arrival.guestId
        ? `/app/guests/${arrival.guestId}`
        : null

  if (!to) {
    return <span className="font-bold text-slate-900">{arrival.guestName}</span>
  }

  return (
    <Link
      to={to}
      className="font-bold text-slate-900 transition-colors hover:text-brand hover:underline underline-offset-2"
    >
      {arrival.guestName}
    </Link>
  )
}

/**
 * Modern floating room picker modal rendered via React portal.
 */
function RoomPickerModal({
  isOpen,
  onClose,
  arrival,
  rooms = [],
  chosen = [],
  onSave,
  saving,
}) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'available' | 'occupied'
  const [selectedIds, setSelectedIds] = useState(chosen)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setSelectedIds(chosen)
      setSearch('')
      setFilter('all')
      setTimeout(() => inputRef.current?.focus(), 60)
    }
  }, [isOpen, chosen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const wanted = arrival.roomsCount ?? 1
  const isMulti = wanted > 1

  const q = search.trim().toLowerCase()
  const filteredRooms = rooms.filter((r) => {
    const isSelected = selectedIds.includes(r.id)
    const isOccupied = Boolean(r.takenBy) && !isSelected

    if (filter === 'available' && isOccupied) return false
    if (filter === 'occupied' && !isOccupied) return false

    if (!q) return true
    return (
      (r.number ?? '').toLowerCase().includes(q) ||
      (r.roomType ?? '').toLowerCase().includes(q)
    )
  })

  const availableCount = rooms.filter((r) => !r.takenBy || selectedIds.includes(r.id)).length
  const occupiedCount = rooms.filter((r) => r.takenBy && !selectedIds.includes(r.id)).length

  const handleToggle = (room) => {
    const isCurrentlySelected = selectedIds.includes(room.id)
    const isBlocked = Boolean(room.takenBy) && !isCurrentlySelected
    if (isBlocked) return

    if (isCurrentlySelected) {
      setSelectedIds(selectedIds.filter((id) => id !== room.id))
    } else {
      if (!isMulti) {
        setSelectedIds([room.id])
      } else {
        setSelectedIds([...selectedIds, room.id])
      }
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-lg rounded-2xl border border-slate-200/90 bg-white shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-picker-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand ring-1 ring-blue-500/20">
              <DoorClosed size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h3 id="room-picker-title" className="text-[16px] font-extrabold text-slate-900">
                Assign Room
              </h3>
              <p className="text-[13px] text-slate-500">
                <span className="font-bold text-slate-800">{arrival.guestName}</span>
                {wanted && (
                  <span className="ml-1.5 text-slate-400">
                    · {wanted} {wanted === 1 ? 'room requested' : 'rooms requested'}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Multi-room selection status banner */}
        {isMulti && (
          <div className="flex items-center justify-between border-b border-slate-100 bg-blue-50/50 px-6 py-2.5">
            <div className="text-[12.5px] font-medium text-slate-700">
              Selected <span className="font-bold text-slate-900">{selectedIds.length}</span> of{' '}
              <span className="font-bold text-slate-900">{wanted}</span> rooms
            </div>
            {selectedIds.length === wanted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <Check size={12} strokeWidth={2.5} /> All assigned
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-700 ring-1 ring-amber-200">
                {wanted - selectedIds.length} more needed
              </span>
            )}
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 space-y-3 bg-white">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              ref={inputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search room number or type (e.g. 101, Deluxe)..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-8 text-[13.5px] text-slate-900 placeholder:text-slate-400 focus:border-brand focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand/10 transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {[
              ['all', `All (${rooms.length})`],
              ['available', `Available (${availableCount})`],
              ['occupied', `Occupied (${occupiedCount})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-2.5 py-1 text-[12px] font-bold transition-all ${
                  filter === key
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Rooms Grid */}
        <div className="flex-1 overflow-y-auto p-4 max-h-[340px] bg-slate-50/30">
          {filteredRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <DoorClosed size={28} className="mb-2 text-slate-300" strokeWidth={1.5} />
              <p className="text-[13.5px] font-bold text-slate-700">No rooms found</p>
              <p className="text-[12.5px] text-slate-400 max-w-xs mt-0.5">
                {search ? `No rooms matching "${search}"` : 'No rooms match the selected filter.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredRooms.map((room) => {
                const isSelected = selectedIds.includes(room.id)
                const isBlocked = Boolean(room.takenBy) && !isSelected

                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={isBlocked}
                    onClick={() => handleToggle(room)}
                    className={`relative flex items-center justify-between rounded-xl p-3 text-left transition-all ${
                      isSelected
                        ? 'border-2 border-brand bg-brand-soft shadow-xs ring-2 ring-brand/20'
                        : isBlocked
                          ? 'border border-slate-200/60 bg-slate-100/60 opacity-55 cursor-not-allowed'
                          : 'border border-slate-200/90 bg-white hover:border-brand/60 hover:bg-slate-50/90 hover:shadow-xs cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          isSelected
                            ? 'bg-brand text-white'
                            : isBlocked
                              ? 'bg-slate-200 text-slate-400'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <BedDouble size={16} />
                      </div>
                      <div className="truncate">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`font-extrabold text-[14.5px] tabular-nums tracking-tight ${
                              isSelected
                                ? 'text-brand'
                                : isBlocked
                                  ? 'text-slate-400'
                                  : 'text-slate-900'
                            }`}
                          >
                            {room.number}
                          </span>
                        </div>
                        {room.roomType && (
                          <p className="truncate text-[11.5px] font-medium text-slate-400">
                            {room.roomType}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 ml-2">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-brand text-white px-2 py-0.5 text-[11px] font-bold shadow-2xs">
                          <Check size={11} strokeWidth={3} /> Selected
                        </span>
                      ) : isBlocked ? (
                        <span className="text-[11px] font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          Occupied
                        </span>
                      ) : (
                        <span className="text-[11.5px] font-semibold text-emerald-600">
                          Available
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3.5">
          <div>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-[12.5px] font-bold text-slate-500 hover:text-red-600 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button tone="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              tone="primary"
              size="sm"
              loading={saving}
              onClick={() => onSave(selectedIds)}
              icon={Check}
            >
              Save Assignment
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/**
 * Interactive room cell for desk staff.
 */
function RoomCell({ arrival, rooms, onAssigned }) {
  const [chosen, setChosen] = useState(() => (arrival.roomIds ?? []).filter(Boolean))
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const checkinId = arrival.checkinId ?? (arrival.kind === 'walkin' ? arrival.id : null)

  useEffect(() => {
    setChosen((arrival.roomIds ?? []).filter(Boolean))
  }, [arrival.roomIds])

  const numberOf = (id) => rooms.find((r) => r.id === id)?.number ?? '?'
  const wanted = arrival.roomsCount ?? null

  if (!checkinId) {
    if (arrival.room) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 border border-slate-200/80 px-2.5 py-1 text-[13px] font-bold text-slate-800 shadow-2xs">
          <BedDouble size={14} className="text-slate-400" />
          <span>Room {arrival.room}</span>
          {arrival.roomType && (
            <span className="text-[11.5px] font-normal text-slate-400">· {arrival.roomType}</span>
          )}
        </span>
      )
    }
    return <span className="text-[13px] font-medium text-slate-400 italic">Unassigned</span>
  }

  const saveRooms = async (next) => {
    const previous = chosen
    setChosen(next)
    setSaving(true)
    setFailed(false)
    try {
      await api.post(`/staff/checkins/${checkinId}/room`, { roomIds: next })
      setOpen(false)
      if (onAssigned) onAssigned()
    } catch {
      setChosen(previous)
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const short = wanted && chosen.length && chosen.length < wanted
  const satisfied = wanted && chosen.length && chosen.length >= wanted

  return (
    <div className="inline-flex items-center gap-2 flex-wrap">
      {chosen.length > 0 ? (
        <button
          type="button"
          disabled={saving}
          onClick={() => setOpen(true)}
          className={`group inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left text-[13px] font-semibold transition-all shadow-2xs hover:shadow-xs cursor-pointer ${
            failed
              ? 'border-red-300 bg-red-50/50 text-red-700'
              : 'border-blue-200/90 bg-blue-50/70 text-blue-900 hover:border-blue-300 hover:bg-blue-100/70'
          }`}
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin text-brand" />
          ) : (
            <BedDouble size={14} className="text-brand shrink-0" />
          )}
          <span className="font-bold tracking-tight">
            {chosen.length === 1
              ? `Room ${numberOf(chosen[0])}`
              : `Rooms ${chosen.map(numberOf).sort().join(', ')}`}
          </span>
          <ChevronDown
            size={13}
            className="text-blue-500 opacity-70 group-hover:opacity-100 group-hover:translate-y-0.5 transition-all"
          />
        </button>
      ) : (
        <button
          type="button"
          disabled={saving}
          onClick={() => setOpen(true)}
          className="group inline-flex items-center gap-1.5 rounded-xl border border-dashed border-brand/40 bg-brand/5 px-3 py-1.5 text-[12.5px] font-bold text-brand hover:border-brand hover:bg-brand hover:text-white transition-all shadow-2xs hover:shadow-xs cursor-pointer"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Plus size={14} className="group-hover:scale-110 transition-transform" />
          )}
          <span>Assign Room</span>
        </button>
      )}

      {/* Multi-room status indicators */}
      {short && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200/70">
          {chosen.length} of {wanted} assigned
        </span>
      )}
      {satisfied && wanted > 1 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200/70">
          ✓ {wanted} rooms
        </span>
      )}
      {!chosen.length && wanted > 1 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {wanted} requested
        </span>
      )}

      {failed && (
        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-red-600">
          <AlertCircle size={12} /> Failed to save
        </span>
      )}

      <RoomPickerModal
        isOpen={open}
        onClose={() => setOpen(false)}
        arrival={arrival}
        rooms={rooms}
        chosen={chosen}
        onSave={saveRooms}
        saving={saving}
      />
    </div>
  )
}


