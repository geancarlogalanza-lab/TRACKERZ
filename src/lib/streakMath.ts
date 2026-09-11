import type { ISODate, Streak, StreakRecord } from '../data/types'
import { addDays, toISODate } from './dates'

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

/** The most recent run that ended strictly before `day`, if any. */
export function lastRunBefore(dates: Set<ISODate>, day: ISODate): number {
  let latest: ISODate | null = null
  for (const date of dates) {
    if (date < day && (latest === null || date > latest)) latest = date
  }
  return latest === null ? 0 : runEndingOn(dates, latest)
}

/**
 * The first day a streak counts from: whichever is earlier, the day it was
 * created or its earliest record. Days before this are not "missed" — the
 * streak simply didn't exist yet.
 */
export function firstDay(streak: Streak, dates: Set<ISODate>): ISODate {
  let first = toISODate(new Date(streak.created_at))
  for (const date of dates) {
    if (date < first) first = date
  }
  return first
}

export type TodayState =
  /** Continued today. */
  | 'done'
  /** Run is intact through yesterday; today is still owed. */
  | 'needs'
  /** No run leading into today. Start again, or start for the first time. */
  | 'restart'

export interface TodayStanding {
  state: TodayState
  /** The run to show: through today when done, through yesterday when owed, the last run when restarting. */
  count: number
}

/** Where a streak stands on `day`, phrased for the Today panel. */
export function standingOn(dates: Set<ISODate>, day: ISODate): TodayStanding {
  const throughToday = runEndingOn(dates, day)
  if (throughToday > 0) return { state: 'done', count: throughToday }

  const throughYesterday = runEndingOn(dates, addDays(day, -1))
  if (throughYesterday > 0) return { state: 'needs', count: throughYesterday }

  return { state: 'restart', count: lastRunBefore(dates, day) }
}

export interface DayRange {
  start: ISODate
  end: ISODate
}

/**
 * The run that is still alive on `day`: it reaches `day` itself, or reaches
 * yesterday and is still owed today. Every other recorded day belongs to a
 * run that has ended. Null when nothing is alive.
 */
export function activeRunOn(dates: Set<ISODate>, day: ISODate): DayRange | null {
  for (const end of [day, addDays(day, -1)]) {
    const length = runEndingOn(dates, end)
    if (length > 0) return { start: addDays(end, -(length - 1)), end }
  }
  return null
}

export type SegmentState =
  /** Recorded, and part of the run that is still alive. */
  | 'active'
  /** Recorded, but part of a run that has since ended. */
  | 'past'
  /** The streak existed that day and was not continued. */
  | 'empty'

/** How one streak's segment should read on one day of the calendar. */
export function segmentState(
  dates: Set<ISODate>,
  active: DayRange | null,
  day: ISODate,
): SegmentState {
  if (!dates.has(day)) return 'empty'
  if (active && day >= active.start && day <= active.end) return 'active'
  return 'past'
}

/**
 * Milestones get a slightly longer beat in the count animation and nothing
 * else — no badge, no message. A week, a month, a hundred, each year.
 */
export function isMilestone(count: number): boolean {
  if (count === 7 || count === 30 || count === 100) return true
  return count > 0 && count % 365 === 0
}
