import { deadlineState } from './dates'
import type { ISODate, Task } from '../data/types'

/** Whether a task belongs in "Needs attention": overdue, due today, or planned for today. */
export function needsAttention(task: Task, today: ISODate): boolean {
  const state = deadlineState(task.deadline_date, task.deadline_time)
  return state === 'overdue' || state === 'today' || task.planned_date === today
}
