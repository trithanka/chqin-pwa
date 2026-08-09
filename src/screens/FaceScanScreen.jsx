import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PrimaryButton, Screen, ScreenTitle } from '../components/ui'
import { CameraCard } from '../components/cards'

export default function FaceScanScreen({ next }) {
  const [state, setState] = useState('scanning')

  useEffect(() => {
    if (state !== 'scanning') return
    const t = setTimeout(() => setState('done'), 2200)
    return () => clearTimeout(t)
  }, [state])

  return (
    <Screen className="justify-between pt-7 pb-8 px-7">
      <div>
        <ScreenTitle
          title="Face scan"
          subtitle="Look at the camera."
        />

        <div className="my-auto py-6">
          <CameraCard state={state} />
        </div>

        <div className="h-8 flex items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={state}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-[14px] font-bold tracking-tight ${
                state === 'done'
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                  : 'bg-blue-50 text-blue-600 border border-blue-200'
              }`}
            >
              {state === 'scanning' ? (
                <>
                  <motion.span
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                    className="size-2 rounded-full bg-blue-600"
                  />
                  Looking for face...
                </>
              ) : (
                '✓ Face captured'
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="pt-6">
        {state === 'done' ? (
          <PrimaryButton onClick={next} tone="success">
            Continue
          </PrimaryButton>
        ) : (
          <PrimaryButton
            onClick={() => setState('scanning')}
            loading={true}
            tone="brand"
          >
            Scanning...
          </PrimaryButton>
        )}
      </div>
    </Screen>
  )
}
