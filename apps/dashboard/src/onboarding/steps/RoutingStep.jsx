import { useState } from 'react'
import { Button, Card, Field, Input, StepHeader } from '../kit'
import { SERVICE } from '../services'

/**
 * Where each service's requests go.
 *
 * Only the services switched on two screens back appear here — asking for a
 * spa number from a property with no spa is how a five-minute setup becomes a
 * fifteen-minute one.
 *
 * Most small properties route everything to one phone at reception, so that
 * is one tap rather than six copy-pastes.
 */
export default function RoutingStep({ data, patch, errors }) {
  const [reception, setReception] = useState('')

  const set = (service, value) => patch('contacts', { ...data.contacts, [service]: value })

  const useReceptionForAll = () => {
    const number = reception.trim()
    if (!number) return
    patch('contacts', Object.fromEntries(data.services.map((s) => [s, number])))
  }

  return (
    <div>
      <StepHeader
        title="Who should receive requests?"
        body="A guest's request goes straight to this number on WhatsApp. Include the country code."
      />

      <Card className="p-4">
        <Field label="Reception number" hint="Fills every service below in one tap.">
          <Input
            type="tel"
            inputMode="tel"
            value={reception}
            onChange={(e) => setReception(e.target.value)}
          />
        </Field>
        <Button
          tone="secondary"
          onClick={useReceptionForAll}
          disabled={!reception.trim()}
          className="mt-4 w-full"
        >
          Use reception number for all
        </Button>
      </Card>

      <div className="mt-5 flex flex-col gap-4">
        {data.services.map((service) => {
          const { label, icon: Icon } = SERVICE[service]
          return (
            <Field
              key={service}
              label={
                <span className="inline-flex items-center gap-2">
                  <Icon size={14} strokeWidth={2.2} />
                  {label}
                </span>
              }
              error={errors[service]}
            >
              <Input
                type="tel"
                inputMode="tel"
                value={data.contacts[service] ?? ''}
                invalid={!!errors[service]}
                onChange={(e) => set(service, e.target.value)}
              />
            </Field>
          )
        })}
      </div>
    </div>
  )
}
