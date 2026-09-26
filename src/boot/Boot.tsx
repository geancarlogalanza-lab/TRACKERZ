import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import type { BootReport } from './bootReport'
import { GeanLoader, type CompletionTiming, type LoaderError, type LoaderPhase } from './GeanLoader'
import { AppBoundary } from './AppBoundary'

type AppComponent = ComponentType<{ onBoot?: (report: BootReport) => void }>

/** The start-up steps, in order, as the loading screen sees them. */
type Stage = 'code' | 'session' | 'workspace' | 'content' | 'ready'
type ProgressStep = Exclude<BootReport['step'], 'failed'>

/**
 * How full the vessels are once each step has finished: [already earned,
 * earned when the current step completes]. The app's own code is a real
 * step — on a first visit it is the longest wait of all — so the screen is
 * already showing (from index.html) while it downloads.
 */
const PROGRESS: Record<Stage, [number, number]> = {
  code: [0.08, 0.34],
  session: [0.34, 0.5],
  workspace: [0.5, 0.72],
  content: [0.72, 1],
  ready: [1, 1],
}

const LABELS: Record<Stage, string> = {
  code: 'Starting up',
  session: 'Checking your account',
  workspace: 'Opening your workspace',
  content: 'Loading your tasks',
  ready: 'Ready',
}

/** With no progress for this long, stop pretending and offer a way out. */
const STALL_MS = 25_000
/** After this many failed downloads, a full reload is the better retry. */
const RELOAD_AFTER = 3

/**
 * The shortest time the loading screen stays up, from when it first
 * appears, so a quick start still gives the fire room to breathe. A slower
 * start is unaffected: the screen simply stays until the app is ready.
 */
const MIN_VISIBLE_MS = 2300

/** How long the loading screen has been on screen. */
function visibleFor(): number {
  // The static first frame in index.html is the page's first paint.
  const firstPaint = performance.getEntriesByName('first-contentful-paint')[0]
  return performance.now() - (firstPaint?.startTime ?? 0)
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The address of a script that failed to download, from the browser's error
 * (Chrome and Firefox name it; Safari does not). Browsers remember a failed
 * import for the life of the page, so the same address can never be tried
 * again — but with a query string added it is a new request.
 */
function failedScript(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error)
  return message.match(/https?:\/\/\S+?\.js\b/)?.[0] ?? null
}

/**
 * Starts the app behind the loading screen and decides what the screen
 * shows: loading, complete, or an error with a way to recover.
 *
 * The app mounts underneath as soon as its code arrives and runs its own
 * initialisation, reporting each step here. Only the steps its first screen
 * depends on count — the Streak tracker's data loads in the background and
 * handles its own failures in place, so it never blocks the app. The screen
 * leaves only once the app reports ready, and it never waits past that
 * except for the brief completion moment.
 */
export function Boot() {
  const [App, setApp] = useState<AppComponent | null>(null)
  const [codeFailures, setCodeFailures] = useState(0)
  const [codeError, setCodeError] = useState(false)
  const [report, setReport] = useState<BootReport>({ step: 'session' })
  const [step, setStep] = useState<ProgressStep>('session')
  const [stalled, setStalled] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [startedAt] = useState(() => performance.now())
  const [stageSince, setStageSince] = useState(startedAt)
  const [completion, setCompletion] = useState<CompletionTiming>({ rise: 380, flare: 260, fade: 240 })
  const stepRef = useRef<ProgressStep>('session')
  const failedUrl = useRef<string | null>(null)

  /** A new step restarts the drift within its band and the stall timer. */
  const beginStage = useCallback(() => {
    setStageSince(performance.now())
    setStalled(false)
  }, [])

  const loadCode = useCallback(() => {
    const again = failedUrl.current
    const request: Promise<{ default: AppComponent }> = again
      ? import(/* @vite-ignore */ `${again}${again.includes('?') ? '&' : '?'}retry=${Date.now()}`)
      : import('../App')
    request.then(
      (module) => {
        setApp(() => module.default)
        beginStage()
      },
      (caught) => {
        console.error('The app failed to download:', caught)
        failedUrl.current = failedScript(caught) ?? failedUrl.current
        setCodeFailures((count) => count + 1)
        setCodeError(true)
      },
    )
  }, [beginStage])

  useEffect(() => {
    loadCode()
  }, [loadCode])

  const onBoot = useCallback(
    (next: BootReport) => {
      // Ready is final. Anything the app does after that — a refresh, a
      // retry — it shows in its own interface, not on this screen.
      if (stepRef.current === 'ready') return
      setReport(next)
      // A failure keeps the progress it had; it does not empty the vessels.
      if (next.step === 'failed' || next.step === stepRef.current) return
      stepRef.current = next.step
      setStep(next.step)
      beginStage()
      if (next.step === 'ready') {
        // The completion moment is sized to the load: brief after a quick
        // start, a little fuller after a long one, never more than 0.9s.
        const budget = Math.min(900, Math.max(350, (performance.now() - startedAt) * 0.6))
        setCompletion({ rise: budget * 0.45, flare: budget * 0.3, fade: budget * 0.25 })
      }
    },
    [beginStage, startedAt],
  )

  const [crashed, setCrashed] = useState(false)
  const onCrash = useCallback((caught: unknown) => {
    console.error('The app crashed:', caught)
    setCrashed(true)
  }, [])

  // Held open for the minimum time even once the app is ready — except for
  // anyone who prefers reduced motion, for whom the fire is still anyway.
  const [minimumMet, setMinimumMet] = useState(
    () => prefersReducedMotion() || visibleFor() >= MIN_VISIBLE_MS,
  )
  useEffect(() => {
    if (minimumMet) return
    let timer = setTimeout(function check() {
      const left = MIN_VISIBLE_MS - visibleFor()
      if (left > 16) timer = setTimeout(check, left)
      else setMinimumMet(true)
    }, MIN_VISIBLE_MS - visibleFor())
    return () => clearTimeout(timer)
  }, [minimumMet])

  const stage: Stage = App ? step : 'code'
  const failed = (!App && codeError) || report.step === 'failed' || stalled
  // Until the minimum has passed, a ready app keeps the screen in 'loading'
  // at 'ready' progress: the fire keeps burning, full, as it already would.
  const phase: LoaderPhase = crashed
    ? 'error'
    : stage === 'ready' && minimumMet
      ? 'complete'
      : failed
        ? 'error'
        : 'loading'

  // Never trap anyone on the loading screen.
  useEffect(() => {
    if (phase !== 'loading') return
    const timer = setTimeout(() => setStalled(true), STALL_MS)
    return () => clearTimeout(timer)
  }, [phase, stageSince])

  const retry = useCallback(() => {
    if (crashed) {
      window.location.reload()
      return
    }
    if (!App) {
      // Without the failed script's address there is nothing new to ask
      // for, so only a reload can fetch it again.
      if (codeFailures >= RELOAD_AFTER || (codeError && !failedUrl.current)) {
        window.location.reload()
        return
      }
      setCodeError(false)
      beginStage()
      loadCode()
      return
    }
    if (report.step === 'failed' && report.retry) {
      report.retry()
      return
    }
    beginStage()
    // Only the session check has nothing smaller to retry than the page.
    if (report.retry) report.retry()
    else window.location.reload()
  }, [App, crashed, codeFailures, codeError, report, loadCode, beginStage])

  const offline = !navigator.onLine
  let error: LoaderError | null = null
  if (phase === 'error') {
    if (crashed) {
      error = {
        title: 'Something went wrong',
        body: 'The app ran into an unexpected problem. Reloading usually fixes it. Nothing you have saved is affected.',
        action: 'Reload',
      }
    } else if (stalled) {
      error = {
        title: 'This is taking longer than usual',
        body: offline
          ? "You're offline. Loading will carry on once you reconnect."
          : 'Your connection may be slow. You can keep waiting, or try again.',
        action: 'Try again',
      }
    } else if (!App) {
      error = {
        title: "Couldn't finish loading",
        body: offline
          ? "You're offline. Reconnect, then try again."
          : "Part of the app didn't download. This is usually a brief connection problem.",
        action: codeFailures >= RELOAD_AFTER ? 'Reload' : 'Try again',
      }
    } else {
      error = {
        title: "Couldn't load your tracker",
        body: offline
          ? "You're offline. Reconnect, then try again."
          : 'Something interrupted loading, usually a brief connection problem. Nothing you have saved is affected.',
        action: 'Try again',
      }
    }
  }

  useEffect(() => {
    if (report.step === 'failed' && report.message) {
      console.warn('Start-up step failed:', report.message)
    }
  }, [report])

  const [reached, next] = PROGRESS[stage]

  return (
    <>
      {App && (
        <AppBoundary onCrash={onCrash}>
          <App onBoot={revealed ? undefined : onBoot} />
        </AppBoundary>
      )}
      {(!revealed || crashed) && (
        // A crash gets a fresh screen, even mid-way through leaving.
        <GeanLoader
          key={crashed ? 'crashed' : 'boot'}
          reached={reached}
          next={next}
          stageSince={stageSince}
          phase={phase}
          label={LABELS[stage]}
          error={error}
          completion={completion}
          onRetry={retry}
          onFinished={() => setRevealed(true)}
        />
      )}
    </>
  )
}
