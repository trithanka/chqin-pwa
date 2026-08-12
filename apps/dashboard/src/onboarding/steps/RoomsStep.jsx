import { useState } from 'react'
import { BedDouble, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState, Field, Input, Panel, Pill, Select } from '../../components/ui'
import StepHeader from '../../components/StepHeader'

const ROOM_TYPES = ['Standard', 'Deluxe', 'Suite', 'Twin', 'Accessible']

/**
 * Nobody types 80 rooms one at a time, so the range builder is the primary
 * control and single-room entry is the fallback — the opposite of the obvious
 * layout, and the right way round for the person doing this once.
 */
export default function RoomsStep({ data, patch, errors }) {
  const [mode, setMode] = useState('range')
  const [range, setRange] = useState({ floor: '3', from: '1', to: '12', type: 'Deluxe' })
  const [single, setSingle] = useState({ number: '', type: 'Standard' })
  const [note, setNote] = useState(null)

  const existing = new Set(data.rooms.map((r) => r.number))

  const addRooms = (rooms) => {
    const fresh = rooms.filter((r) => !existing.has(r.number))
    const skipped = rooms.length - fresh.length
    if (fresh.length) patch('rooms', [...data.rooms, ...fresh])
    setNote(
      skipped
        ? `Added ${fresh.length}. Skipped ${skipped} already on the list.`
        : `Added ${fresh.length} room${fresh.length === 1 ? '' : 's'}.`,
    )
  }

  const addRange = () => {
    const from = Number(range.from)
    const to = Number(range.to)
    if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) {
      setNote('Give a valid range — the last number has to be higher than the first.')
      return
    }
    if (to - from > 199) {
      setNote('That range is over 200 rooms. Add them in a couple of batches.')
      return
    }
    const rooms = []
    for (let n = from; n <= to; n++) {
      // "3" + 07 → 307, the way room numbers actually read on a door.
      rooms.push({
        number: `${range.floor}${String(n).padStart(2, '0')}`,
        type: range.type,
      })
    }
    addRooms(rooms)
  }

  const addSingle = () => {
    const number = single.number.trim()
    if (!number) return
    addRooms([{ number, type: single.type }])
    setSingle({ ...single, number: '' })
  }

  const remove = (number) => patch('rooms', data.rooms.filter((r) => r.number !== number))

  const byType = data.rooms.reduce((acc, r) => ({ ...acc, [r.type]: (acc[r.type] ?? 0) + 1 }), {})

  return (
    <div>
      <StepHeader
        eyebrow="Step 3"
        title="Add your rooms"
        body="Check-in assigns a guest to one of these. You can edit the list any time from settings."
      />

      <Panel className="p-5">
        <div className="mb-4 inline-flex rounded-lg bg-slate-100 p-0.5">
          {[
            ['range', 'A floor at a time'],
            ['single', 'One room'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-[7px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                mode === value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'range' ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Floor">
                <Input
                  value={range.floor}
                  onChange={(e) => setRange({ ...range, floor: e.target.value })}
                  placeholder="3"
                />
              </Field>
              <Field label="From">
                <Input
                  inputMode="numeric"
                  value={range.from}
                  onChange={(e) => setRange({ ...range, from: e.target.value })}
                />
              </Field>
              <Field label="To">
                <Input
                  inputMode="numeric"
                  value={range.to}
                  onChange={(e) => setRange({ ...range, to: e.target.value })}
                />
              </Field>
              <Field label="Type">
                <Select
                  value={range.type}
                  onChange={(e) => setRange({ ...range, type: e.target.value })}
                >
                  {ROOM_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button tone="secondary" icon={Plus} onClick={addRange}>
                Add rooms
              </Button>
              <p className="text-[13px] text-slate-500">
                Creates{' '}
                <span className="font-semibold text-slate-700">
                  {range.floor}
                  {String(range.from || 1).padStart(2, '0')}
                </span>{' '}
                through{' '}
                <span className="font-semibold text-slate-700">
                  {range.floor}
                  {String(range.to || 1).padStart(2, '0')}
                </span>
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Room number" className="flex-1">
              <Input
                value={single.number}
                onChange={(e) => setSingle({ ...single, number: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addSingle()}
                placeholder="412"
              />
            </Field>
            <Field label="Type" className="sm:w-44">
              <Select
                value={single.type}
                onChange={(e) => setSingle({ ...single, type: e.target.value })}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
            <Button tone="secondary" icon={Plus} onClick={addSingle} className="sm:mb-0">
              Add
            </Button>
          </div>
        )}

        {note && <p className="mt-3 text-[13px] font-medium text-slate-500">{note}</p>}
      </Panel>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-slate-900">
            {data.rooms.length} room{data.rooms.length === 1 ? '' : 's'}
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(byType).map(([type, count]) => (
              <Pill key={type}>
                {type} · {count}
              </Pill>
            ))}
          </div>
        </div>

        {errors.rooms && (
          <p className="mb-3 text-[13px] font-medium text-red-600">{errors.rooms}</p>
        )}

        {data.rooms.length === 0 ? (
          <EmptyState
            icon={BedDouble}
            title="No rooms yet"
            body="Add a floor at a time — most properties are set up in under a minute this way."
          />
        ) : (
          <Panel className="divide-y divide-slate-100 overflow-hidden">
            {data.rooms.map((room) => (
              <div key={room.number} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-16 text-[14px] font-bold tabular-nums text-slate-900">
                  {room.number}
                </span>
                <span className="flex-1 text-[13.5px] text-slate-500">{room.type}</span>
                <Button
                  tone="danger"
                  size="icon"
                  icon={Trash2}
                  onClick={() => remove(room.number)}
                  aria-label={`Remove room ${room.number}`}
                />
              </div>
            ))}
          </Panel>
        )}
      </div>
    </div>
  )
}
