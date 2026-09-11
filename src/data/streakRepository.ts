import { supabase } from '../lib/supabase'
import { today } from '../lib/dates'
import type { ISODate, Streak, StreakRecord } from './types'

/** All database access for the Streak tracker. */

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

export async function listStreaks(): Promise<Streak[]> {
  return unwrap(await supabase.from('streaks').select('*').order('created_at', { ascending: true }))
}

export async function createStreak(userId: string, name: string): Promise<Streak> {
  return unwrap(
    await supabase.from('streaks').insert({ user_id: userId, name: name.trim() }).select().single(),
  )
}

export async function renameStreak(id: string, name: string): Promise<Streak> {
  return unwrap(
    await supabase.from('streaks').update({ name: name.trim() }).eq('id', id).select().single(),
  )
}

export async function deleteStreak(id: string): Promise<void> {
  const { error } = await supabase.from('streaks').delete().eq('id', id)
  if (error) throw error
}

/**
 * Every record for the user. Streak history is small (one short row per streak
 * per day), so loading it once keeps the calendar and the counts instant and
 * avoids a refetch on every date the user clicks.
 */
export async function listRecords(): Promise<StreakRecord[]> {
  return unwrap(
    await supabase.from('streak_records').select('*').order('entry_date', { ascending: true }),
  )
}

/**
 * Marks a streak continued on `entryDate`, which must be today. A streak is
 * continued on the day it happens — never back-filled, never done ahead —
 * and the database enforces the same rule behind this check.
 *
 * The note is stored verbatim and is never inspected; continuation is
 * recorded because the user asked for it, full stop.
 */
export async function continueStreak(
  userId: string,
  streakId: string,
  entryDate: ISODate,
  note: string,
): Promise<StreakRecord> {
  if (entryDate !== today()) {
    throw new Error('A streak can only be continued today.')
  }

  const inserted = await supabase
    .from('streak_records')
    .insert({ user_id: userId, streak_id: streakId, entry_date: entryDate, note: note.trim() })
    .select()
    .single()

  // Already continued today (a double tap, or a second device): that record
  // is the truth, and there is nothing further to do.
  if (inserted.error && (inserted.error as { code?: string }).code === '23505') {
    return unwrap(
      await supabase
        .from('streak_records')
        .select('*')
        .eq('streak_id', streakId)
        .eq('entry_date', entryDate)
        .single(),
    )
  }

  return unwrap(inserted)
}

/** Changes what a record says. Allowed on any day; the note never affects counting. */
export async function updateNote(id: string, note: string): Promise<StreakRecord> {
  return unwrap(
    await supabase
      .from('streak_records')
      .update({ note: note.trim() })
      .eq('id', id)
      .select()
      .single(),
  )
}

/** Undoes today's continuation. The caller checks the date; the database does too. */
export async function removeRecord(id: string): Promise<void> {
  const { error } = await supabase.from('streak_records').delete().eq('id', id)
  if (error) throw error
}
