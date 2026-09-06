import { useState } from 'react'
import { Button } from './ui/Button'
import { Field, FormError } from './ui/Field'
import { supabase } from '../lib/supabase'
import { toMessage } from '../lib/errors'

type Mode = 'sign-in' | 'sign-up'

/**
 * One account holds one tracker. Signing in on a second device is the whole
 * point of having accounts here, so this screen stays as small as it can be.
 */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)

    if (!email.trim()) return setError('Enter your email address.')
    if (password.length < 6) return setError('Password must be at least 6 characters.')

    setBusy(true)
    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
        // A successful sign-in swaps this screen out via the auth listener.
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (signUpError) throw signUpError

        // With email confirmation switched on, sign-up returns no session.
        if (!data.session) {
          setInfo('Check your inbox to confirm your email, then sign in.')
          setMode('sign-in')
          setPassword('')
        }
      }
    } catch (caught) {
      setError(toMessage(caught, 'Could not sign you in.'))
    } finally {
      setBusy(false)
    }
  }

  const signingIn = mode === 'sign-in'

  return (
    <main className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <span className="header__mark" aria-hidden="true" />
          Tracker
        </div>

        <h1 className="auth__title">{signingIn ? 'Welcome back' : 'Create your account'}</h1>
        <p className="auth__subtitle">
          {signingIn
            ? 'Your subjects, tasks and streaks follow you to any device.'
            : 'One account keeps everything in sync across your laptop and phone.'}
        </p>

        {info && <p className="auth__info">{info}</p>}
        <FormError message={error} />

        <form onSubmit={submit} noValidate>
          <Field label="Email">
            {(id) => (
              <input
                id={id}
                className="input"
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Password">
            {(id) => (
              <input
                id={id}
                className="input"
                type="password"
                autoComplete={signingIn ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            )}
          </Field>

          <Button type="submit" variant="primary" block disabled={busy}>
            {busy ? 'Please wait…' : signingIn ? 'Sign in' : 'Create account'}
          </Button>
        </form>

        <p className="auth__switch">
          {signingIn ? 'No account yet?' : 'Already have an account?'}{' '}
          <button
            type="button"
            className="auth__link"
            onClick={() => {
              setMode(signingIn ? 'sign-up' : 'sign-in')
              setError(null)
              setInfo(null)
            }}
          >
            {signingIn ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  )
}
