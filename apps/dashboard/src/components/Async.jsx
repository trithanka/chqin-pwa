import { AlertCircle, LoaderCircle } from 'lucide-react'
import { Button, Panel } from './ui'

/**
 * The waiting and failing states, in one place.
 *
 * A dashboard that shows nothing while it loads reads as broken, and one that
 * shows an empty table on a failed request lies. Both get said out loud.
 */
export default function Async({ loading, error, onRetry, children, empty }) {
  if (loading) {
    return (
      <Panel className="flex items-center justify-center gap-2.5 px-6 py-12 text-slate-400">
        <LoaderCircle size={17} className="animate-spin" />
        <span className="text-[13.5px] font-medium">Loading…</span>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <AlertCircle size={20} className="text-red-500" strokeWidth={1.8} />
        <p className="text-[14px] font-semibold text-slate-900">{error.message}</p>
        {onRetry && (
          <div className="mt-2">
            <Button tone="secondary" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </Panel>
    )
  }

  return empty ?? children
}
