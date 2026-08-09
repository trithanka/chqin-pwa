import { motion } from 'framer-motion'
import { ArrowRight, ShieldCheck, UserCheck } from 'lucide-react'
import { Card, PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { GUEST, HOTEL } from '../data'

export default function ReturningGuestScreen({ next }) {
  return (
    <Screen>
      <ScreenTitle
        title="Welcome back."
        subtitle="Continue with your ChqIn Identity."
      />

      <Card className="p-5 border-zinc-200/90 shadow-sm bg-white">
        <div className="flex items-center gap-4">
          <div className="grid size-14 place-items-center rounded-2xl bg-zinc-950 text-white shadow-md">
            <UserCheck size={26} strokeWidth={1.8} />
          </div>
          <div>
            <p className="text-[17.5px] font-bold tracking-tight text-zinc-900">
              {GUEST.name}
            </p>
            <p className="text-[13px] text-zinc-500 font-mono">
              ChqIn ID · {GUEST.masked}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-xl bg-zinc-50 p-3.5 border border-zinc-100 flex items-center justify-between text-[13px]">
          <span className="text-zinc-500 font-medium">Hotel Booking</span>
          <span className="font-bold text-zinc-900">{HOTEL.name} (Room {HOTEL.roomNumber})</span>
        </div>
      </Card>

      <div className="mt-5 rounded-2xl bg-blue-50/70 p-4 border border-blue-100 flex items-center gap-3 text-blue-900 text-[13px]">
        <ShieldCheck size={20} className="text-blue-600 shrink-0" strokeWidth={2} />
        <span>One-step verification with your registered device biometric.</span>
      </div>

      <div className="mt-auto pt-8">
        <PrimaryButton onClick={next} icon={ArrowRight} tone="brand">
          Verify & Check In
        </PrimaryButton>
      </div>
    </Screen>
  )
}
