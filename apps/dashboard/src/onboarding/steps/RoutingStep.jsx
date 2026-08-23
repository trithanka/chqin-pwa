import { useState } from 'react'
import { Button, Card, Field, StepHeader } from '../kit'
import { SERVICE } from '../services'
import { MessageSquare } from 'lucide-react'

/** Clean to 10 digits */
const to10Digits = (val) => {
  const digits = (val ?? '').replace(/\D/g, '')
  if (digits.length > 10 && digits.startsWith('91')) {
    return digits.slice(2, 12)
  }
  return digits.slice(0, 10)
}

export default function RoutingStep({ data, patch, errors }) {
  const [reception, setReception] = useState('')

  const set = (service, value) => {
    patch('contacts', { ...data.contacts, [service]: to10Digits(value) })
  }

  const useReceptionForAll = () => {
    const number = to10Digits(reception)
    if (!number) return
    patch('contacts', Object.fromEntries(data.services.map((s) => [s, number])))
  }

  return (
    <div>
      <StepHeader
        title="Who should receive requests?"
        body="A guest's request goes straight to this number on WhatsApp. Enter your 10-digit number."
      />

      <Card className="p-4">
        <Field label="Reception number" hint="Fills every service below in one tap.">
          <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/10 transition-all">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border-r border-slate-200 text-slate-700 text-[13px] font-bold select-none shrink-0">
              <MessageSquare size={14} className="text-emerald-600" />
              <span>+91</span>
            </div>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={reception}
              onChange={(e) => setReception(to10Digits(e.target.value))}
              placeholder="9876543210"
              className="h-10 w-full bg-transparent px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none tabular-nums"
            />
          </div>
        </Field>
        <Button
          tone="secondary"
          onClick={useReceptionForAll}
          disabled={to10Digits(reception).length !== 10}
          className="mt-4 w-full"
        >
          Use reception number for all
        </Button>
      </Card>

      <div className="mt-5 flex flex-col gap-4">
        {data.services.map((service) => {
          const { label, icon: Icon } = SERVICE[service]
          const val = to10Digits(data.contacts[service] ?? '')
          const invalid = !!errors[service]

          return (
            <Field
              key={service}
              label={
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <Icon size={14} strokeWidth={2.2} />
                    {label}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400 font-mono">
                    {val.length}/10
                  </span>
                </div>
              }
              error={errors[service]}
            >
              <div
                className={`flex items-center rounded-xl border bg-white overflow-hidden transition-all ${
                  invalid
                    ? 'border-red-300 ring-3 ring-red-500/10'
                    : 'border-slate-200 focus-within:border-brand focus-within:ring-3 focus-within:ring-brand/10'
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
                  value={val}
                  onChange={(e) => set(service, e.target.value)}
                  placeholder="9876543210"
                  className="h-10 w-full bg-transparent px-3 text-[14px] font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none tabular-nums"
                />
              </div>
            </Field>
          )
        })}
      </div>
    </div>
  )
}
