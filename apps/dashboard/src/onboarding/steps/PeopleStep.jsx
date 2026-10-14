import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button, Card, Field, Input, StepHeader } from '../kit'

const to10Digits = (val) => {
  const digits = (val ?? '').replace(/\D/g, '')
  return (digits.length > 10 && digits.startsWith('91') ? digits.slice(2, 12) : digits).slice(0, 10)
}

/**
 * The people and teams a visitor can ask to see. Optional here: it can be done
 * from the dashboard any time, but a venue with nobody listed has nobody for a
 * visitor to pick.
 */
export default function PeopleStep({ data, patch, errors }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

  const add = () => {
    if (!name.trim()) return
    patch('hosts', [...data.hosts, { name: name.trim(), phone: to10Digits(phone) }])
    setName('')
    setPhone('')
  }

  const remove = (i) => patch('hosts', data.hosts.filter((_, j) => j !== i))

  return (
    <div>
      <StepHeader
        title="Who can visitors meet?"
        body="Add the people or teams a visitor can ask to see. Their WhatsApp number is where the arrival notice goes. You can change this any time."
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name or team">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CEO Office" maxLength={120} />
          </Field>
          <Field label="WhatsApp number" hint="Optional, 10 digits">
            <Input
              value={phone}
              onChange={(e) => setPhone(to10Digits(e.target.value))}
              placeholder="98765 43210"
              inputMode="tel"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Button tone="secondary" icon={Plus} onClick={add} disabled={!name.trim()}>
            Add
          </Button>
        </div>
      </Card>

      {data.hosts.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {data.hosts.map((h, i) => (
            <li
              key={`${h.name}-${i}`}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-white">{h.name}</p>
                <p className="text-[12.5px] text-slate-400">{h.phone ? `+91 ${h.phone}` : 'No number'}</p>
                {errors[`phone${i}`] && <p className="text-[12px] text-red-400">{errors[`phone${i}`]}</p>}
              </div>
              <button
                type="button"
                aria-label={`Remove ${h.name}`}
                onClick={() => remove(i)}
                className="grid size-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
