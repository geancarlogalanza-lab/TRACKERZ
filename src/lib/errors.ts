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
        return ruleBroken(err.message ?? '') ?? 'That value is not allowed.'
      case '23503':
        return 'That refers to something that no longer exists. Refresh and try again.'
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

/**
 * The database's own checks, by constraint name, in words. The forms catch
 * all of these first; this is for when something reaches the database
 * anyway — another device on an old version, say.
 */
const RULES: [string, string][] = [
  ['tasks_planned_time_needs_date', 'A planned time needs a planned date.'],
  ['tasks_deadline_time_needs_date', 'A deadline time needs a deadline date.'],
  ['tasks_description_length', 'Descriptions can be up to 5,000 characters.'],
  ['tasks_title_check', 'A task needs a title of up to 200 characters.'],
  ['subjects_name_check', 'A subject needs a name of up to 80 characters.'],
  ['trimesters_label_check', 'A trimester needs a name of up to 80 characters.'],
  ['streaks_name_check', 'A streak needs a name of up to 80 characters.'],
  ['streak_records_note_length', 'Notes can be up to 500 characters.'],
  ['captures_raw_notes_check', 'Notes can be up to 20,000 characters. Split them into two captures.'],
  ['captures_source_passage_check', 'A passage can be up to 20,000 characters.'],
  ['lessons_text_check', 'A lesson can be up to 2,000 characters.'],
]

function ruleBroken(message: string): string | null {
  return RULES.find(([name]) => message.includes(name))?.[1] ?? null
}
