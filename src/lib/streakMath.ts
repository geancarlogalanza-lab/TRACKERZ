import type { ISODate, StreakRecord } from '../data/types'
import { addDays } from './dates'

/**
 * Streak counting.
 *
 * A streak is a run of consecutive calendar days on which the user explicitly
 * continued it. The only input is the set of dates that have a record. Note
 * text is never read here — two records that say "15 declined pushups x 5" and
 * "did 50 pushups" are identical as far as this file is concerned, and so are
 * records for entirely different activities. There is no matching, scoring,
 * threshold, or judgement of any kind.
 */

export type StreakStatus =
  /** Continued on the day in question. */
  | 'active'
  /** Run is intact up to the previous day, but this day has no record yet. */
  | 'awaiting'
  /** No run leading into this day. */
  | 'inactive'

export interface StreakProgress {
  length: number
  status: StreakStatus
}

/** Dates that have a record, for one streak. */
export function datesForStreak(records: StreakRecord[], streakId: string): Set<ISODate> {
  const dates = new Set<ISODate>()
  for (const record of records) {
    if (record.streak_id === streakId) dates.add(record.entry_date)
  }
  return dates
}

/** Consecutive recorded days ending exactly on `day`; 0 if `day` has no record. */
export function runEndingOn(dates: Set<ISODate>, day: ISODate): number {
  let length = 0
  let cursor = day
  while (dates.has(cursor)) {
    length += 1
    cursor = addDays(cursor, -1)
  }
  return length
}

/**
 * How the streak stands on a given day. A run that reaches yesterday but not
 * today is `awaiting`, not broken — today is not over yet, and the app does
 * not punish an unfinished day.
 */
export function progressAsOf(dates: Set<ISODate>, day: ISODate): StreakProgress {
  const onDay = runEndingOn(dates, day)
  if (onDay > 0) return { length: onDay, status: 'active' }

  const beforeDay = runEndingOn(dates, addDays(day, -1))
  if (beforeDay > 0) return { length: beforeDay, status: 'awaiting' }

  return { length: 0, status: 'inactive' }
}
