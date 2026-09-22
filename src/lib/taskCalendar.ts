import type { ISODate, Task } from '../data/types'

/**
 * Turns the Pending tracker's tasks into a per-day index for the calendar.
 *
 * There is no calendar data. Everything here is derived from the same `tasks`
 * array the subject grid renders, so adding, editing, completing or deleting
 * a task moves the calendar with it and the two can never disagree.
 *
 * A task touches up to two days: the day it is planned for and the day it is
 * due. It appears on both, because they answer different questions.
 */

export interface DayTasks {
  planned: Task[]
  due: Task[]
}

export type EntryKind = 'planned' | 'due'

export interface DayEntry {
  task: Task
  kind: EntryKind
}

/** Earliest time first; tasks with no time sink to the bottom of their group. */
function byTime(field: 'planned_time' | 'deadline_time') {
  return (a: Task, b: Task) => {
    const left = a[field] ?? '99:99'
    const right = b[field] ?? '99:99'
    return left.localeCompare(right) || a.title.localeCompare(b.title)
  }
}

export function indexTasksByDay(tasks: Task[]): Map<ISODate, DayTasks> {
  const days = new Map<ISODate, DayTasks>()

  const dayFor = (date: ISODate) => {
    let entry = days.get(date)
    if (!entry) {
      entry = { planned: [], due: [] }
      days.set(date, entry)
    }
    return entry
  }

  for (const task of tasks) {
    if (task.planned_date) dayFor(task.planned_date).planned.push(task)
    if (task.deadline_date) dayFor(task.deadline_date).due.push(task)
  }

  for (const day of days.values()) {
    day.planned.sort(byTime('planned_time'))
    day.due.sort(byTime('deadline_time'))
  }

  return days
}

/**
 * What a cell previews, in priority order: deadlines first, because they are
 * the ones that cannot slip, then the work planned for that day.
 */
export function dayEntries(day: DayTasks | undefined): DayEntry[] {
  if (!day) return []
  return [
    ...day.due.map((task) => ({ task, kind: 'due' as const })),
    ...day.planned.map((task) => ({ task, kind: 'planned' as const })),
  ]
}

/** "2 planned, 1 due" — the cell's spoken summary. */
export function describeDay(day: DayTasks | undefined): string {
  if (!day) return ''
  const parts: string[] = []
  if (day.planned.length > 0) parts.push(`${day.planned.length} planned`)
  if (day.due.length > 0) parts.push(`${day.due.length} due`)
  return parts.length === 0 ? '' : `, ${parts.join(', ')}`
}
