import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { GeanRenderer, type FireFrame } from './geanRenderer'

export type LoaderPhase = 'loading' | 'complete' | 'error'

export interface LoaderError {
  title: string
  body: string
  action: string
}

/** Durations, in milliseconds, of the moment between "ready" and revealed. */
export interface CompletionTiming {
  rise: number
  flare: number
  fade: number
}

interface GeanLoaderProps {
  /** Progress already earned by finished start-up steps, 0–1. */
  reached: number
  /** Where the step in progress will take it once it finishes. */
  next: number
  /** performance.now() when the current step began. */
  stageSince: number
  phase: LoaderPhase
  label: string
  error: LoaderError | null
  completion: CompletionTiming
  onRetry: () => void
  onFinished: () => void
}

/**
 * While a step is in progress the fire drifts upward into that step's share
 * of the vessel — but never more than this much of it, and ever more slowly.
 * It never claims a step is done before it is.
 */
const CREEP = 0.6
const CREEP_TIME = 1600

const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3)
const approach = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt))

/**
 * The loading screen: GEAN as four vessels, filling with fire as the app
 * starts up.
 *
 * Progress is the app's real initialisation, reported by Boot. On success
 * the fire rises to the lid, flares once inside the letters, and the screen
 * fades to reveal the app — briefly after a quick load, a little longer
 * after a slow one. On failure the fire gutters down to embers and a retry
 * appears. A tap or key press skips the completion moment.
 */
export function GeanLoader(props: GeanLoaderProps) {
  const { phase, label, error, completion, onRetry } = props
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const retryRef = useRef<HTMLButtonElement>(null)
  const latest = useRef(props)
  const skip = useRef(false)
  const finished = useRef(false)
  const [percent, setPercent] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useLayoutEffect(() => {
    latest.current = props
  })

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const shell = document.getElementById('gean-shell')

    let renderer: GeanRenderer | null = null
    try {
      renderer = new GeanRenderer(canvas)
    } catch (caught) {
      console.error('The loading screen could not draw:', caught)
    }

    // Drawing is decoration: if it fails, loading carries on regardless.
    // Before the first frame, the static letters from index.html stay in
    // view instead; after it, the last frame simply holds.
    let drawn = false
    const draw = (frame: FireFrame) => {
      if (!renderer) return
      try {
        renderer.draw(frame)
        drawn = true
      } catch (caught) {
        console.error('The loading screen stopped drawing:', caught)
        renderer.dispose()
        renderer = null
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const s = {
      time: 0,
      fill: 0,
      heat: 1,
      flare: 0,
      sparks: 1,
      last: performance.now(),
      completeAt: 0,
      completeFrom: 0,
      fading: false,
      done: false,
      shown: -1,
    }
    let frame = 0

    const tick = (now: number) => {
      const p = latest.current
      // Levels ease by real elapsed time, so a throttled or backgrounded tab
      // still shows true progress; the flames' own motion never jumps.
      const elapsed = Math.min(1, (now - s.last) / 1000)
      const dt = Math.min(0.05, elapsed)
      s.last = now
      const still = reduced.matches

      if (p.phase === 'complete') {
        if (!s.completeAt) {
          s.completeAt = now
          s.completeFrom = s.fill
        }
        const hurry = still || skip.current
        const rise = hurry ? 0 : p.completion.rise * (1 - s.completeFrom)
        const flare = hurry ? 0 : p.completion.flare
        const t = now - s.completeAt

        s.fill = rise > 0 && t < rise ? s.completeFrom + (1 - s.completeFrom) * easeOutCubic(t / rise) : 1
        const u = flare > 0 ? Math.min(1, Math.max(0, (t - rise) / flare)) : 1
        s.flare = flare > 0 ? Math.sin(Math.PI * u) : 0
        s.heat = 1 + 0.1 * s.flare
        s.sparks = 1 + 3.5 * s.flare

        if (!s.fading && t >= rise + flare) {
          s.fading = true
          s.completeAt = now - rise - flare // anchor the fade to now, even after a skip
          setLeaving(true)
          if (shell) {
            shell.style.transition = `opacity ${Math.round(p.completion.fade)}ms ease`
            shell.style.opacity = '0'
          }
        }
        if (s.fading && t >= rise + flare + p.completion.fade && !s.done) {
          s.done = true
          if (!finished.current) {
            finished.current = true
            p.onFinished()
          }
        }
      } else if (p.phase === 'error') {
        // The fire gutters to embers: dimmer, slower, no sparks.
        s.heat = approach(s.heat, 0.38, 1.4, elapsed)
        s.sparks = approach(s.sparks, 0, 3, elapsed)
        s.flare = 0
      } else {
        const since = now - p.stageSince
        const target = p.reached + (p.next - p.reached) * CREEP * (1 - Math.exp(-since / CREEP_TIME))
        s.fill = still ? Math.max(s.fill, target) : Math.max(s.fill, approach(s.fill, target, 2.6, elapsed))
        s.heat = approach(s.heat, 1, 2, elapsed)
        s.sparks = approach(s.sparks, 1, 2, elapsed)
      }

      if (!still) s.time += dt * (p.phase === 'error' ? 0.45 : 1)
      draw({ time: s.time, fill: s.fill, heat: s.heat, flare: s.flare, sparks: s.sparks })

      const shown = Math.round(s.fill * 100)
      if (shown !== s.shown) {
        s.shown = shown
        setPercent(shown)
      }
      if (!s.done) frame = requestAnimationFrame(tick)
    }

    // First frame now, before the browser paints, so the hand-over from the
    // static first paint in index.html is invisible; then retire that copy.
    tick(performance.now())
    if (drawn) shell?.remove()
    else stage.dataset.flat = ''

    const observer = new ResizeObserver(() => {
      try {
        renderer?.resize()
      } catch (caught) {
        console.error('The loading screen could not resize:', caught)
      }
    })
    observer.observe(canvas)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      renderer?.dispose()
      shell?.remove()
    }
  }, [])

  // The reveal must never depend on animation frames arriving: a browser
  // may pause them (a hidden or covered window), and drawing may fail. So
  // the completion moment is also on a clock, with a little slack.
  useEffect(() => {
    if (phase !== 'complete') return
    const { rise, flare, fade } = latest.current.completion
    const timer = setTimeout(() => {
      if (finished.current) return
      finished.current = true
      latest.current.onFinished()
    }, rise + flare + fade + 1200)
    return () => clearTimeout(timer)
  }, [phase])

  // The page beneath is already rendering; keep it from scrolling behind us.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = previous
    }
  }, [])

  // Any tap or key press cuts the completion moment short, and nobody needs
  // it if the app finished loading while they were looking elsewhere.
  useEffect(() => {
    if (phase !== 'complete') return
    if (document.hidden) skip.current = true
    const hurry = () => {
      skip.current = true
    }
    window.addEventListener('pointerdown', hurry)
    window.addEventListener('keydown', hurry)
    return () => {
      window.removeEventListener('pointerdown', hurry)
      window.removeEventListener('keydown', hurry)
    }
  }, [phase])

  useEffect(() => {
    if (phase === 'error') retryRef.current?.focus()
  }, [phase])

  const style = { '--gean-fade': `${Math.round(completion.fade)}ms` } as CSSProperties

  return (
    <div ref={stageRef} className={`gean-stage gean-loader${phase === 'error' ? ' gean-loader--error' : ''}${leaving ? ' gean-loader--leaving' : ''}`} style={style}>
      <div className="gean-center">
        <div
          className="gean-meter"
          role="progressbar"
          aria-label="Loading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={phase === 'error' ? 'Stopped' : `${label}, ${percent}%`}
          aria-busy={phase === 'loading'}
        >
          <canvas ref={canvasRef} className="gean-art" aria-hidden="true" />
        </div>

        <div className="gean-below">
          {phase === 'error' && error ? (
            <div className="gean-error" role="alert">
              <p className="gean-error__title">{error.title}</p>
              <p className="gean-error__body">{error.body}</p>
              <button type="button" className="gean-error__retry" ref={retryRef} onClick={onRetry}>
                {error.action}
              </button>
            </div>
          ) : (
            <p className="gean-caption" key={label} aria-hidden="true">
              {label}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
