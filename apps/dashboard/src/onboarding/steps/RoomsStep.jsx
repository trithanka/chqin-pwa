import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, Pill, Select, StepHeader } from '../kit'
import { planRooms } from '../rooms'

const ROOM_TYPES = ['Standard', 'Deluxe', 'Suite', 'Twin', 'Accessible']

/**
 * Nobody types 80 rooms one at a time, so the range is the primary control
 * and single-room entry is the fallback — the opposite of the obvious layout,
 * and the right way round for the person doing this once.
 */
export default function RoomsStep({ data, patch, errors }) {
  const [range, setRange] = useState({ from: '', to: '', type: 'Standard' })
  const [single, setSingle] = useState({ number: '', type: 'Standard' })
  const [showSingle, setShowSingle] = useState(false)
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
    setRange({ ...range, from: '', to: '' })
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
        title="How are your rooms numbered?"
        body="Check-in assigns a guest to one of these. You can edit the list any time from settings."
      />

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-4">
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
              invalid={!!plan.error}
              onChange={(e) => setRange({ ...range, to: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Room type" className="mt-4">
          <Select
            value={range.type}
            onChange={(e) => setRange({ ...range, type: e.target.value })}
          >
            {ROOM_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>

        {/* The result, spelled out — no arithmetic asked of the reader. */}
        <div className="mt-4 rounded-xl bg-onb-raised px-4 py-3">
          {plan.error ? (
            <p className="text-[13px] font-medium text-red-400">{plan.error}</p>
          ) : plan.numbers.length === 0 ? (
            <p className="text-[13px] text-onb-muted">
              Type the first and last room to see what will be added.
            </p>
          ) : (
            <p className="text-[13.5px] text-onb-muted">
              <span className="font-bold text-onb-text">
                {plan.numbers.length === 1 ? 'Adds 1 room:' : `Adds ${plan.numbers.length} rooms:`}
              </span>{' '}
              <span className="font-semibold tabular-nums text-onb-text">
                {plan.numbers.length <= 5
                  ? plan.numbers.join(', ')
                  : `${plan.numbers.slice(0, 3).join(', ')} … ${plan.numbers.at(-1)}`}
              </span>
            </p>
          )}
        </div>

        <Button
          tone="secondary"
          icon={Plus}
          onClick={addRange}
          disabled={!!plan.error || plan.numbers.length === 0}
          className="mt-4 w-full"
        >
          Add another range
        </Button>
      </Card>

      {showSingle ? (
        <Card className="mt-3 p-4">
          <div className="flex gap-3">
            <Field label="Room number" className="flex-1">
              <Input
                value={single.number}
                onChange={(e) => setSingle({ ...single, number: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && addSingle()}
              />
            </Field>
            <Field label="Type" className="w-[42%]">
              <Select
                value={single.type}
                onChange={(e) => setSingle({ ...single, type: e.target.value })}
              >
                {ROOM_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Button tone="secondary" icon={Plus} onClick={addSingle} className="mt-4 w-full">
            Add room
          </Button>
        </Card>
      ) : (
        <button
          type="button"
          onClick={() => setShowSingle(true)}
          className="mt-3 w-full rounded-xl py-3 text-[14px] font-semibold text-onb-green"
        >
          + Add individual room
        </button>
      )}

      {note && <p className="mt-3 text-[13px] font-medium text-onb-muted">{note}</p>}

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-bold tracking-[-0.02em] text-onb-text">
            {data.rooms.length} room{data.rooms.length === 1 ? '' : 's'} found
          </h2>
          <div className="flex flex-wrap justify-end gap-1.5">
            {Object.entries(byType).map(([type, count]) => (
              <Pill key={type}>
                {type} · {count}
              </Pill>
            ))}
          </div>
        </div>

        {errors.rooms && (
          <p className="mb-3 text-[13px] font-medium text-red-400">{errors.rooms}</p>
        )}

        {data.rooms.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-onb-line px-5 py-8 text-center text-[13.5px] leading-relaxed text-onb-muted">
            No rooms yet. Most properties are set up in one range.
          </p>
        ) : (
          <Card className="divide-y divide-onb-line overflow-hidden">
            {data.rooms.map((room) => (
              <div key={room.number} className="flex items-center gap-3 px-4 py-2.5">
                <span className="w-16 text-[15px] font-bold tabular-nums text-onb-text">
                  {room.number}
                </span>
                <span className="flex-1 text-[13.5px] text-onb-muted">{room.type}</span>
                <button
                  type="button"
                  onClick={() => remove(room.number)}
                  aria-label={`Remove room ${room.number}`}
                  className="grid size-10 place-items-center rounded-lg text-onb-muted"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
