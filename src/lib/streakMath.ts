import type { ISODate, Streak, StreakRecord } from '../data/types'
import { addDays, toISODate } from './dates'

/**
 * Streak counting.
 *
 * A streak is a run of days on which the user explicitly continued it, and it
 * survives up to two missed days in a row: two continued days belong to the
 * same run when at most two calendar days passed between them without a
 * continuation. Three missed days in a row end the run. A run's count is the
 * number of days it was continued — missed days keep the streak alive but
 * don't add to it.
 *
 * This file is the only place that rule lives; the Today panel, the calendar
 * and past days all read their runs from here. The only input is the set of
 * dates that have a record, so the rule applies to every record ever written,
 * not only to new ones. Note text is never read here — two records that say
 * "15 declined pushups x 5" and "did 50 pushups" are identical as far as this
 * file is concerned, and so are records for entirely different activities.
 * There is no matching, scoring, threshold, or judgement of any kind.
 */

/** Missed days in a row a run survives. One more than this ends it. */
const GRACE_DAYS = 2

/**
 * The continued day a run reaches back to from `day`: the day before, or
 * across the grace period. Null when the run can't reach back past `day`.
 */
function previousInRun(dates: Set<ISODate>, day: ISODate): ISODate | null {
  for (let step = 1; step <= GRACE_DAYS + 1; step += 1) {
    const candidate = addDays(day, -step)
    if (dates.has(candidate)) return candidate
  }
  return null
}

/** The run ending exactly on `end`: its first day and how many days it was continued. */
function runBack(dates: Set<ISODate>, end: ISODate): { start: ISODate; length: number } {
  if (!dates.has(end)) return { start: end, length: 0 }
  let start = end
  let length = 1
  for (let previous = previousInRun(dates, start); previous; previous = previousInRun(dates, start)) {
    start = previous
    length += 1
  }
  return { start, length }
}

/** Dates that have a record, for one streak. */
export function datesForStreak(records: StreakRecord[], streakId: string): Set<ISODate> {
  const dates = new Set<ISODate>()
  for (const record of records) {
    if (record.streak_id === streakId) dates.add(record.entry_date)
  }
  return dates
}

/** Days continued in the run ending exactly on `day`; 0 if `day` has no record. */
export function runEndingOn(dates: Set<ISODate>, day: ISODate): number {
  return runBack(dates, day).length
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
  /** Run is still alive — continued yesterday, or within the missed-day grace — and today is owed. */
  | 'needs'
  /** No run leading into today. Start again, or start for the first time. */
  | 'restart'

export interface TodayStanding {
  state: TodayState
  /** The run to show: through today when done, the live run when owed, the last run when restarting. */
  count: number
}

/** Where a streak stands on `day`, phrased for the Today panel. */
export function standingOn(dates: Set<ISODate>, day: ISODate): TodayStanding {
  const throughToday = runEndingOn(dates, day)
  if (throughToday > 0) return { state: 'done', count: throughToday }

  const latest = previousInRun(dates, day)
  if (latest) return { state: 'needs', count: runEndingOn(dates, latest) }

  return { state: 'restart', count: lastRunBefore(dates, day) }
}

export interface DayRange {
  start: ISODate
  end: ISODate
}

/**
 * The run that is still alive on `day`: it reaches `day` itself, or it is
 * still owed today — its last continuation was recent enough that the days
 * missed since are within the grace. Every other recorded day belongs to a
 * run that has ended. Null when nothing is alive.
 */
export function activeRunOn(dates: Set<ISODate>, day: ISODate): DayRange | null {
  const end = dates.has(day) ? day : previousInRun(dates, day)
  if (!end) return null
  return { start: runBack(dates, end).start, end }
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
