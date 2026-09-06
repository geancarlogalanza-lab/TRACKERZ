import { useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { PendingTracker } from './components/pending/PendingTracker'
import { StreakTracker } from './components/streaks/StreakTracker'
import { Button } from './components/ui/Button'
import { ErrorNotice, Loading, Toast } from './components/ui/Feedback'
import { useAuth } from './hooks/useAuth'
import { usePendingTracker } from './hooks/usePendingTracker'
import { useStreakTracker } from './hooks/useStreakTracker'
import { useToast } from './hooks/useToast'
import { isConfigured, supabase } from './lib/supabase'

type Tab = 'pending' | 'streaks'

export default function App() {
  const { user, loading } = useAuth()
  const [tab, setTab] = useState<Tab>('pending')
  const toast = useToast()

  // Hooks run unconditionally; they stay idle until there is a signed-in user.
  const pending = usePendingTracker(user?.id ?? null, toast.show)
  const streaks = useStreakTracker(user?.id ?? null)

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

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <span className="header__mark" aria-hidden="true" />
          <span>Tracker</span>
        </div>

        <nav className="tabs" role="tablist" aria-label="Trackers">
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'pending'}
            onClick={() => setTab('pending')}
          >
            Pending
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === 'streaks'}
            onClick={() => setTab('streaks')}
          >
            Streaks
          </button>
        </nav>

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
        {tab === 'pending' ? (
          // The trimester list has to exist before subjects can be shown.
          pending.trimesters.length === 0 && pending.loadError ? (
            <ErrorNotice message={pending.loadError} onRetry={pending.retry} />
          ) : pending.trimesters.length === 0 ? (
            <Loading label="Setting things up…" />
          ) : (
            <PendingTracker store={pending} />
          )
        ) : (
          <StreakTracker store={streaks} />
        )}
      </main>

      {toast.message && <Toast message={toast.message} onDismiss={toast.dismiss} />}
    </div>
  )
}
