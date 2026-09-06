/**
 * Turns whatever Supabase or the network threw into one short sentence a
 * person can act on. The UI never silently swallows a failure, but it also
 * never shows a raw Postgres error.
 */
export function toMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (!navigator.onLine) return 'You appear to be offline. Check your connection and try again.'

  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string; code?: string }

    switch (err.code) {
      case '23505':
        return 'That already exists.'
      case '23514':
        return 'That value is not allowed.'
      case '42501':
        return 'You do not have permission to do that.'
      case 'PGRST301':
        return 'Your session expired. Please sign in again.'
    }

    const message = err.message ?? ''
    if (/fetch|network|failed to fetch/i.test(message)) {
      return 'Could not reach the server. Check your connection and try again.'
    }
    if (message) return message
  }

  if (typeof error === 'string' && error) return error
  return fallback
}
