import type { ClockTime, ISODate } from '../data/types'

/**
 * Calendar-day helpers. Everything works on "YYYY-MM-DD" strings in the
 * viewer's local timezone, so "today" means the day it actually is here.
 */

export function toISODate(date: Date): ISODate {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function today(): ISODate {
  return toISODate(new Date())
}

/** Parses "YYYY-MM-DD" into a local-midnight Date (never UTC-shifted). */
export function fromISODate(iso: ISODate): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(iso: ISODate, days: number): ISODate {
  const date = fromISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime()
  return Math.round(ms / 86_400_000)
}

export function isSameMonth(iso: ISODate, year: number, month: number): boolean {
  const date = fromISODate(iso)
  return date.getFullYear() === year && date.getMonth() === month
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthName(month: number): string {
  return MONTHS_LONG[month]
}

/** "Today", "Tomorrow", "Yesterday", "Sep 11", or "Sep 11, 2027" across years. */
export function formatDay(iso: ISODate, from: ISODate = today()): string {
  const offset = daysBetween(from, iso)
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  if (offset === -1) return 'Yesterday'

  const date = fromISODate(iso)
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`
  return date.getFullYear() === fromISODate(from).getFullYear()
    ? label
    : `${label}, ${date.getFullYear()}`
}

export function formatLongDay(iso: ISODate): string {
  const date = fromISODate(iso)
  return `${MONTHS_LONG[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

/** "19:00" -> "7:00 PM". Returns null for missing input so callers can skip it. */
export function formatTime(time: ClockTime | null): string | null {
  if (!time) return null
  const [rawHours, minutes] = time.split(':')
  const hours = Number(rawHours)
  const suffix = hours < 12 ? 'AM' : 'PM'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${minutes} ${suffix}`
}

/** Joins a day and an optional time: "Tomorrow 11:59 PM". */
export function formatMoment(date: ISODate | null, time: ClockTime | null): string | null {
  if (!date) return null
  const clock = formatTime(time)
  return clock ? `${formatDay(date)} ${clock}` : formatDay(date)
}

// ---------------------------------------------------------------------------
// Deadline state
// ---------------------------------------------------------------------------

export type DeadlineState = 'none' | 'overdue' | 'today' | 'soon' | 'later'

/**
 * Where a deadline sits relative to now. A deadline with a time is overdue
 * only once that time has passed; a date-only deadline lasts until day's end.
 */
export function deadlineState(
  date: ISODate | null,
  time: ClockTime | null,
  now: Date = new Date(),
): DeadlineState {
  if (!date) return 'none'

  const nowISO = toISODate(now)
  const offset = daysBetween(nowISO, date)

  if (offset < 0) return 'overdue'
  if (offset === 0) {
    if (!time) return 'today'
    const [hours, minutes] = time.split(':').map(Number)
    const passed =
      now.getHours() > hours || (now.getHours() === hours && now.getMinutes() > minutes)
    return passed ? 'overdue' : 'today'
  }
  return offset === 1 ? 'soon' : 'later'
}
