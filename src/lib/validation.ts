import { daysBetween, formatLongDay, formatMoment, toISODate } from './dates'
import type { ClockTime, ISODate, Task } from '../data/types'

/**
 * The tracker's input rules, in one place, so every form judges the same
 * input the same way. A notice is one of three things:
 *
 *   error    breaks a real rule or can't be stored; the form won't save
 *   warning  allowed, but quite possibly not what was meant
 *   info     context worth knowing; never in the way
 *
 * The database enforces the structural rules again (see the migrations), so
 * a request that skips these forms still can't store broken data. What
 * lives only here is what depends on the moment — "this deadline has
 * passed" — or is a judgement rather than a rule, like a likely duplicate.
 */

export type Level = 'error' | 'warning' | 'info'

export interface Notice {
  level: Level
  text: string
}

/** Lengths the database enforces too; keep the two in step. */
export const LIMITS = {
  /** trimesters.label, subjects.name, streaks.name */
  name: 80,
  taskTitle: 200,
  taskDescription: 5000,
  streakNote: 500,
  /** captures.book_title and book_author */
  bookField: 200,
  /** captures.raw_notes and source_passage */
  notes: 20000,
  location: 80,
  lessonText: 2000,
} as const

/** The deadline time a new task starts with; on its own it means nothing was chosen. */
export const DEFAULT_DEADLINE_TIME = '23:59'

const error = (text: string): Notice => ({ level: 'error', text })
const warning = (text: string): Notice => ({ level: 'warning', text })
const info = (text: string): Notice => ({ level: 'info', text })

/** The most serious of several notices, or null. */
export function worst(...notices: (Notice | null | undefined)[]): Notice | null {
  const order: Level[] = ['error', 'warning', 'info']
  for (const level of order) {
    const found = notices.find((notice) => notice?.level === level)
    if (found) return found
  }
  return null
}

export function hasError(notices: Record<string, Notice | null>): boolean {
  return Object.values(notices).some((notice) => notice?.level === 'error')
}

const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
const grouped = (n: number) => n.toLocaleString('en-US')

/**
 * Length as the database counts it: whole characters, so an emoji is one,
 * not two. Measured after trimming, which is what gets stored.
 */
export function characters(value: string): number {
  return [...value.trim()].length
}

/**
 * Long text gets a running count as it nears its limit and an error past
 * it — never a silent cut. `over` says what to do about it.
 */
export function lengthNotice(value: string, limit: number, over = 'Shorten it to fit.'): Notice | null {
  const count = characters(value)
  if (count > limit) return error(`${grouped(count - limit)} characters over the ${grouped(limit)} limit. ${over}`)
  if (count >= limit * 0.9) return info(`${grouped(count)} of ${grouped(limit)} characters.`)
  return null
}

/** A required piece of text: empty or only spaces is an error with `ask` as the fix. */
export function requiredText(value: string, ask: string): Notice | null {
  return value.trim() ? null : error(ask)
}

/**
 * The same name twice is allowed — two sections of one course are real —
 * but more often a slip, so it is pointed out rather than refused.
 */
export function duplicateName(value: string, others: string[], what: string): Notice | null {
  const key = normalise(value)
  if (!key) return null
  const match = others.find((other) => normalise(other) === key)
  return match ? warning(`You already have a ${what} called “${match.trim()}”.`) : null
}

/** Text identical to something already saved: allowed, but most likely saved twice. */
export function sameText(value: string, saved: string[], message: string): Notice | null {
  const key = value.trim()
  return key && saved.some((item) => item.trim() === key) ? warning(message) : null
}

// ---------------------------------------------------------------------------
// Dates and times
// ---------------------------------------------------------------------------

/**
 * A date input the browser couldn't read — half-typed, or an impossible day.
 * Its value comes back empty, which would otherwise save as "no date" and
 * quietly erase whatever date was there before.
 */
const unreadableDate = error("That date isn't complete. Finish it, or clear it to leave it out.")

/** A typo in the year is the commonest date slip; a year away or more gets a question. */
function farAway(date: ISODate, today: ISODate): Notice | null {
  return Math.abs(daysBetween(today, date)) > 366
    ? warning(`That's ${formatLongDay(date)}. Is the year right?`)
    : null
}

/**
 * A moment as a sortable "YYYY-MM-DDTHH:MM:SS" string, in the same
 * timezone-naive wall-clock terms the app stores and shows.
 */
function stamp(date: ISODate, time: string): string {
  return `${date}T${time}`
}

/** When a deadline stops being on time: the end of its minute, or of its day. */
function dueStamp(date: ISODate, time: ClockTime | null): string {
  return stamp(date, time ? `${time.slice(0, 5)}:59` : '23:59:59')
}

/** When a plan starts: its minute, or the start of its day. */
function planStamp(date: ISODate, time: ClockTime | null): string {
  return stamp(date, time ? `${time.slice(0, 5)}:00` : '00:00:00')
}

function nowStamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return stamp(toISODate(now), `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskDraft {
  subjectId: string
  title: string
  description: string
  plannedDate: ISODate
  plannedTime: ClockTime
  deadlineDate: ISODate
  deadlineTime: ClockTime
  /** The browser couldn't read what was typed into the date field. */
  plannedUnreadable?: boolean
  deadlineUnreadable?: boolean
}

export interface TaskContext {
  now: Date
  /** The saved task, when editing. */
  original?: Task
  /** Every other task, to spot an accidental duplicate. */
  others: Task[]
}

export type TaskNotices = Record<'title' | 'description' | 'planned' | 'deadline', Notice | null>

/**
 * Everything a task form should say about a draft, one notice per field,
 * the most serious first.
 *
 * A plan after its deadline is the one contradiction: refused while the
 * deadline is still ahead, but only questioned once it has passed, because
 * then a late finish is the only plan left. A passed deadline on its own is
 * legitimate — overdue tasks are what the tracker is for — so it is
 * mentioned when it's set, not refused, and not mentioned again on every
 * later edit. A deadline with no planned date stays that way.
 */
export function validateTask(draft: TaskDraft, { now, original, others }: TaskContext): TaskNotices {
  const today = toISODate(now)
  const current = nowStamp(now)
  const plannedTime = draft.plannedTime || null
  const deadlineTime = draft.deadlineTime || null

  const title =
    requiredText(draft.title, 'Give the task a title.') ??
    duplicateTask(draft, original, others)

  const description = lengthNotice(draft.description, LIMITS.taskDescription)

  // The deadline: readable, dated if it has a time, plausible, on time.
  let deadline: Notice | null = null
  const deadlineChanged =
    !original ||
    original.deadline_date !== (draft.deadlineDate || null) ||
    (original.deadline_time?.slice(0, 5) ?? null) !== deadlineTime
  if (draft.deadlineUnreadable) deadline = unreadableDate
  else if (!draft.deadlineDate && deadlineTime && deadlineTime !== DEFAULT_DEADLINE_TIME) {
    deadline = error('Add a date for this time, or clear the time.')
  } else if (draft.deadlineDate) {
    const passed = dueStamp(draft.deadlineDate, deadlineTime) < current
    deadline = worst(
      farAway(draft.deadlineDate, today),
      passed && deadlineChanged
        ? warning('This deadline has already passed, so the task will show as overdue.')
        : null,
    )
  }

  // The plan: readable, dated if it has a time, and not after the deadline
  // while that deadline can still be met.
  let planned: Notice | null = null
  const plannedChanged =
    !original ||
    original.planned_date !== (draft.plannedDate || null) ||
    (original.planned_time?.slice(0, 5) ?? null) !== plannedTime
  if (draft.plannedUnreadable) planned = unreadableDate
  else if (!draft.plannedDate && plannedTime) {
    planned = error('Add a date for this time, or clear the time.')
  } else if (draft.plannedDate) {
    let order: Notice | null = null
    if (draft.deadlineDate && !draft.deadlineUnreadable) {
      const due = dueStamp(draft.deadlineDate, deadlineTime)
      if (planStamp(draft.plannedDate, plannedTime) > due) {
        const when = formatMoment(draft.deadlineDate, deadlineTime)
        order =
          due >= current
            ? error(`This plan is after the deadline (${when}). Plan it earlier, or move the deadline.`)
            : warning(`This plan is after the deadline (${when}), so it plans a late finish.`)
      }
    }
    planned = worst(
      order,
      farAway(draft.plannedDate, today),
      plannedChanged && draft.plannedDate < today ? info('That day has already passed.') : null,
    )
  }

  return { title, description, planned, deadline }
}

/** The same title, in the same subject, due the same day: most likely saved twice. */
function duplicateTask(draft: TaskDraft, original: Task | undefined, others: Task[]): Notice | null {
  const key = normalise(draft.title)
  if (!key) return null
  const twin = others.find(
    (task) =>
      task.id !== original?.id &&
      task.subject_id === draft.subjectId &&
      normalise(task.title) === key &&
      (task.deadline_date ?? '') === draft.deadlineDate,
  )
  if (!twin) return null
  const due = twin.deadline_date ? `, due ${formatLongDay(twin.deadline_date)}` : ''
  return warning(`“${twin.title}” is already in this subject${due}.`)
}
