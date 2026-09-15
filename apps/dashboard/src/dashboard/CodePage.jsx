import { Check, Copy, Download, ExternalLink, Printer, QrCode, Sparkles } from 'lucide-react'
import { Badge, Button, PageHeader, Panel } from '../components/ui'
import Async from '../components/Async'
import DeskCard from '../onboarding/DeskCard'
import { api } from '../api'
import { useApi } from '../useApi'
import { useSession } from '../session'

export default function CodePage() {
  const { user } = useSession()
  const { data, error, loading, reload } = useApi(() => api.get('/staff/checkin-code'))

  return (
    <div className="space-y-6">
      <div className="print-hide">
        <PageHeader
          title="Check-in QR Code"
          subtitle="One universal QR code for your reception counter. Each guest scan begins an isolated, private check-in session."
          showBack
          badge={
            <Badge tone="good" size="sm">
              <QrCode size={12} /> Counter Ready
            </Badge>
          }
        />
      </div>

      <Async loading={loading} error={error} onRetry={reload}>
        <div className="grid gap-6 lg:grid-cols-12 items-start">
          {/* Desk Card Counter Mockup */}
          <div className="lg:col-span-5 flex justify-center">
            <DeskCard
              propertyName={user?.venue?.name ?? 'Your property'}
              token={data?.token}
              onLight
            />
          </div>

          {/* Instructions & Counter Guide */}
          <div className="lg:col-span-7 print-hide space-y-4">
            <Panel className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Sparkles className="size-4 text-brand" />
                <h2 className="text-[15px] font-bold">Front Desk Instructions</h2>
              </div>

              <div className="space-y-3 text-[13px] text-slate-600 leading-relaxed">
                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200/70">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand text-white font-bold text-[12px]">
                    1
                  </span>
                  <div>
                    <strong className="text-slate-900">Print the Counter Card:</strong>
                    <p className="mt-0.5 text-slate-500">
                      Print this card on sturdy stock or place it inside an acrylic counter stand at the front reception desk.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200/70">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white font-bold text-[12px]">
                    2
                  </span>
                  <div>
                    <strong className="text-slate-900">Guest Scans Code:</strong>
                    <p className="mt-0.5 text-slate-500">
                      Arriving travelers point their default smartphone camera at the code to launch their instant zero-install check-in session.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-3.5 border border-slate-200/70">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white font-bold text-[12px]">
                    3
                  </span>
                  <div>
                    <strong className="text-slate-900">Automatic Room Keys & Wi-Fi:</strong>
                    <p className="mt-0.5 text-slate-500">
                      Upon biometric passkey confirmation, the guest receives their room details and hotel Wi-Fi credentials directly on their device.
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        </div>
      </Async>
    </div>
  )
}

