import { useEffect, useState } from 'react'
import { GeanLoader, type LoaderPhase } from './GeanLoader'

/**
 * Development only — never bundled into a production build. Holds the
 * loading screen in a chosen state so its look can be judged at leisure.
 */
export function GeanPreview({ mode }: { mode: string }) {
  const fixed = Number(mode)
  const [phase, setPhase] = useState<LoaderPhase>('loading')
  const [band, setBand] = useState<[number, number]>(
    Number.isFinite(fixed) ? [fixed, fixed] : mode === 'error' ? [0.5, 0.5] : [0.08, 0.34],
  )
  const [since, setSince] = useState(() => performance.now())
  const [finished, setFinished] = useState(false)

  useEffect(() => {
    if (mode !== 'error') return
    const timer = setTimeout(() => setPhase('error'), 1500)
    return () => clearTimeout(timer)
  }, [mode])

  useEffect(() => {
    if (mode !== 'demo') return
    const steps: [number, [number, number]][] = [
      [900, [0.34, 0.5]],
      [1700, [0.5, 0.72]],
      [2600, [0.72, 1]],
    ]
    const timers = steps.map(([at, next]) =>
      setTimeout(() => {
        setBand(next)
        setSince(performance.now())
      }, at),
    )
    timers.push(setTimeout(() => setPhase('complete'), 3800))
    return () => timers.forEach(clearTimeout)
  }, [mode])

  if (finished) return <p style={{ padding: 24, color: '#888' }}>Revealed.</p>

  return (
    <GeanLoader
      reached={band[0]}
      next={band[1]}
      stageSince={since}
      phase={phase}
      label={phase === 'error' ? '' : `Preview ${mode}`}
      error={{ title: "Couldn't load your tracker", body: 'Something interrupted loading, usually a brief connection problem. Nothing you have saved is affected.', action: 'Try again' }}
      completion={{ rise: 400, flare: 270, fade: 230 }}
      onRetry={() => setPhase('loading')}
      onFinished={() => setFinished(true)}
    />
  )
}
