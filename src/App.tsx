import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { BootReport } from './boot/bootReport'
import { AuthScreen } from './components/AuthScreen'
import { PendingTracker } from './components/pending/PendingTracker'
import { Fireplace } from './components/streaks/Fireplace'
import { StreakTracker } from './components/streaks/StreakTracker'
import { BrandMark } from './components/ui/BrandMark'
import { Button } from './components/ui/Button'
import { ErrorNotice, Loading, Toast } from './components/ui/Feedback'
import { SectionNav } from './components/ui/SectionNav'
import { useAuth } from './hooks/useAuth'
import { usePendingTracker } from './hooks/usePendingTracker'
import { useStreakTracker } from './hooks/useStreakTracker'
import { useToast } from './hooks/useToast'
import { isConfigured, supabase } from './lib/supabase'

/** The two areas of the app; each has its own sections. */
type Area = 'college' | 'reading'
type CollegeSection = 'tasks' | 'calendar' | 'streaks'

/**
 * Reading is its own chunk, fetched the first time Reading is opened, so
 * College's start-up and the loading screen never wait on it.
 */
const ReadingArea = lazy(() => import('./components/reading/ReadingArea'))

interface AppProps {
  /** Receives each start-up step, so the loading screen can show real progress. */
  onBoot?: (report: BootReport) => void
}

export default function App({ onBoot }: AppProps = {}) {
  const { user, loading } = useAuth()
  const [area, setArea] = useState<Area>('college')
  const [college, setCollege] = useState<CollegeSection>('tasks')
  // Once opened, Reading stays mounted (hidden) so its state and any
  // in-flight processing carry on while you're in College.
  const [readingOpened, setReadingOpened] = useState(false)
  const toast = useToast()

  // The fireplace belongs to the Streak tracker alone. The page only dresses
  // for it once WebGL has actually come up, so a machine without it keeps the
  // ordinary ground rather than a bare black one.
  const [hearth, setHearth] = useState(false)
  const onHearthReady = useCallback((ok: boolean) => setHearth(ok), [])
  const showHearth = area === 'college' && college === 'streaks'

  const openArea = (next: Area) => {
    setArea(next)
    if (next === 'reading') setReadingOpened(true)
  }

  // Hooks run unconditionally; they stay idle until there is a signed-in user.
  const pending = usePendingTracker(user?.id ?? null, toast.show)
  const streaks = useStreakTracker(user?.id ?? null)

  // Start-up, as the loading screen sees it. Only what the first screen needs
  // counts: the session, then the workspace and its tasks. Streaks load in
  // the background and handle their own failures, so they never block entry.
  const bootStep: BootReport['step'] = !isConfigured
    ? 'ready'
    : loading
      ? 'session'
      : !user
        ? 'ready'
        : pending.loadError
          ? 'failed'
          : pending.trimesters.length === 0
            ? 'workspace'
            : pending.loading
              ? 'content'
              : 'ready'
  const bootRetry = user ? pending.retry : undefined
  const bootMessage = pending.loadError ?? undefined
  useEffect(() => {
    onBoot?.({ step: bootStep, message: bootMessage, retry: bootRetry })
  }, [onBoot, bootStep, bootMessage, bootRetry])

  if (!isConfigured) {
    return (
      <main className="auth">
        <div className="auth__card">
          <h1 className="auth__title">Not configured</h1>
          <p className="auth__subtitle">
            Copy <code>.env.example</code> to <code>.env</code> and add your Supabase project URL
            and publishable key, then restart the dev server.
          </p>
        </div>
      </main>
    )
  }

  if (loading) return <Loading label="Loading…" />
  if (!user) return <AuthScreen />

  const collegeNav = (
    <SectionNav
      label="College"
      value={college}
      onChange={setCollege}
      sections={[
        { id: 'tasks', label: 'Tasks' },
        { id: 'calendar', label: 'Calendar' },
        { id: 'streaks', label: 'Streaks' },
      ]}
    />
  )

  return (
    <div
      className={[
        'app',
        // The Streaks screen is dark from its first frame, fire or no fire.
        showHearth ? 'app--streaks' : '',
        showHearth && hearth ? 'app--hearth' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showHearth && <Fireplace onReady={onHearthReady} />}
      <header className="header">
        <div className="header__brand">
          <BrandMark />
          <span>Tracker</span>
        </div>

        <SectionNav
          label="Areas"
          value={area}
          onChange={openArea}
          sections={[
            { id: 'college', label: 'College' },
            { id: 'reading', label: 'Reading' },
          ]}
        />

        <span className="header__spacer" />

        <div className="header__account">
          <span className="header__email" title={user.email ?? undefined}>
            {user.email}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              const { error } = await supabase.auth.signOut()
              if (error) toast.show('Could not sign out. Try again.')
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="main">
        {area === 'college' &&
          (college === 'streaks' ? (
            <>
              <div className="toolbar">{collegeNav}</div>
              <StreakTracker store={streaks} />
            </>
          ) : // The trimester list has to exist before subjects can be shown.
          pending.trimesters.length === 0 ? (
            <>
              <div className="toolbar">{collegeNav}</div>
              {pending.loadError ? (
                <ErrorNotice message={pending.loadError} onRetry={pending.retry} />
              ) : (
                <Loading label="Setting things up…" />
              )}
            </>
          ) : (
            <PendingTracker
              store={pending}
              view={college === 'calendar' ? 'calendar' : 'subjects'}
              nav={collegeNav}
            />
          ))}

        {readingOpened && (
          <div hidden={area !== 'reading'}>
            <Suspense fallback={<Loading label="Opening Reading…" />}>
              <ReadingArea onError={toast.show} />
            </Suspense>
          </div>
        )}
      </main>

      {toast.message && <Toast message={toast.message} onDismiss={toast.dismiss} />}
    </div>
  )
}
