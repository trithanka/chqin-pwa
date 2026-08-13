import { useMemo, useState } from 'react'
import { BedDouble, Plus, Trash2 } from 'lucide-react'
import { Button, EmptyState, Field, Input, Panel, Pill, Select } from '../../components/ui'
import StepHeader from '../../components/StepHeader'

const ROOM_TYPES = ['Standard', 'Deluxe', 'Suite', 'Twin', 'Accessible']

const MAX_BATCH = 200

/** Floor 3 + room 7 → "307", the way it reads on the door. No floor → "7". */
const doorNumber = (floor, n) =>
  floor.trim() ? `${floor.trim()}${String(n).padStart(2, '0')}` : String(n)

/**
 * The numbers this range would create, or a reason it can't.
 *
 * Showing the actual door numbers beats describing the rule: "301, 302, 303 …
 * 312" is checkable at a glance, where "creates 301 through 312" asks the
 * reader to do the arithmetic and trust us.
 */
function planRooms({ floor, first, last }) {
  const from = Number(first)
  const to = Number(last)

  if (first === '' || last === '') return { error: null, numbers: [] }
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0) {
    return { error: 'Room numbers have to be whole numbers.', numbers: [] }
  }
  if (to < from) return { error: 'The last room has to be the same or higher than the first.', numbers: [] }
  if (to - from + 1 > MAX_BATCH) {
    return { error: `That's over ${MAX_BATCH} rooms. Add them a floor at a time.`, numbers: [] }
  }

  const numbers = []
  for (let n = from; n <= to; n++) numbers.push(doorNumber(floor, n))
  return { error: null, numbers }
}

/**
 * Nobody types 80 rooms one at a time, so the range builder is the primary
 * control and single-room entry is the fallback — the opposite of the obvious
 * layout, and the right way round for the person doing this once.
 */
export default function RoomsStep({ data, patch, errors }) {
  const [mode, setMode] = useState('range')
  const [range, setRange] = useState({ floor: '3', first: '1', last: '12', type: 'Deluxe' })
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

  const plan = useMemo(() => planRooms(range), [range])

  const addRange = () => {
    if (plan.error || !plan.numbers.length) return
    addRooms(plan.numbers.map((number) => ({ number, type: range.type })))
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
            <p className="text-[13px] leading-relaxed text-slate-500">
              Rooms are numbered floor-first, so floor{' '}
              <span className="font-semibold text-slate-700">3</span> with rooms{' '}
              <span className="font-semibold text-slate-700">1</span> to{' '}
              <span className="font-semibold text-slate-700">12</span> gives you 301 to 312.
              Leave the floor blank if your rooms aren't numbered that way.
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Floor">
                <Input
                  value={range.floor}
                  onChange={(e) => setRange({ ...range, floor: e.target.value })}
                  placeholder="3"
                />
              </Field>
              <Field label="First room">
                <Input
                  inputMode="numeric"
                  value={range.first}
                  onChange={(e) => setRange({ ...range, first: e.target.value })}
                />
              </Field>
              <Field label="Last room">
                <Input
                  inputMode="numeric"
                  value={range.last}
                  invalid={!!plan.error}
                  onChange={(e) => setRange({ ...range, last: e.target.value })}
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

            {/* The result, spelled out — no arithmetic asked of the reader. */}
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              {plan.error ? (
                <p className="text-[13px] font-medium text-red-600">{plan.error}</p>
              ) : plan.numbers.length === 0 ? (
                <p className="text-[13px] text-slate-500">
                  Fill in the first and last room to see what will be added.
                </p>
              ) : (
                <p className="text-[13.5px] text-slate-600">
                  <span className="font-bold text-slate-900">
                    {plan.numbers.length === 1
                      ? 'Adds 1 room:'
                      : `Adds ${plan.numbers.length} rooms:`}
                  </span>{' '}
                  <span className="font-semibold tabular-nums text-slate-800">
                    {plan.numbers.length <= 5
                      ? plan.numbers.join(', ')
                      : `${plan.numbers.slice(0, 3).join(', ')} … ${plan.numbers.at(-1)}`}
                  </span>
                </p>
              )}
            </div>

            <div>
              <Button
                tone="secondary"
                icon={Plus}
                onClick={addRange}
                disabled={!!plan.error || plan.numbers.length === 0}
              >
                {plan.numbers.length === 1 ? 'Add room' : `Add ${plan.numbers.length || ''} rooms`.trim()}
              </Button>
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
