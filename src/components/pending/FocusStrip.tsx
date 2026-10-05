import { CheckIcon } from '../ui/Icons'
import { deadlineState, formatMoment, today } from '../../lib/dates'
import { needsAttention } from '../../lib/focus'
import type { Subject, Task } from '../../data/types'

interface FocusStripProps {
  tasks: Task[]
  subjectsById: Map<string, Subject>
  /** `origin` is the check that was pressed, for the ember. */
  onCompleteTask: (taskId: string, origin?: Element) => void
}

/**
 * The answer to "what do I need to do right now": anything overdue, plus
 * anything due or planned today. It is a shortlist, not a dashboard — no
 * counts, no percentages, and it disappears entirely when there is nothing
 * pressing.
 */
export function FocusStrip({ tasks, subjectsById, onCompleteTask }: FocusStripProps) {
  const now = today()

  const urgent = tasks
    .filter((task) => needsAttention(task, now))
    .sort((a, b) => {
      const rank = (task: Task) =>
        deadlineState(task.deadline_date, task.deadline_time) === 'overdue' ? 0 : 1
      if (rank(a) !== rank(b)) return rank(a) - rank(b)
      return (a.deadline_date ?? '9999').localeCompare(b.deadline_date ?? '9999')
    })

  if (urgent.length === 0) return null

  return (
    <section className="focus" aria-labelledby="focus-heading">
      <h2 className="section-title" id="focus-heading">
        Needs attention
      </h2>

      <div className="focus__list">
        {urgent.map((task) => {
          const subject = subjectsById.get(task.subject_id)
          const state = deadlineState(task.deadline_date, task.deadline_time)
          const due = formatMoment(task.deadline_date, task.deadline_time)
          const planned = formatMoment(task.planned_date, task.planned_time)

          return (
            <div className="focus-row" key={task.id}>
              <button
                type="button"
                className="task__complete"
                onClick={(event) =>
                  onCompleteTask(task.id, event.currentTarget.firstElementChild ?? event.currentTarget)
                }
                aria-label={`Complete "${task.title}"`}
                title="Mark complete"
              >
                <span className="task__circle">
                  <CheckIcon />
                </span>
              </button>

              <span
                className="focus-row__dot"
                style={{ background: subject?.color ?? 'var(--accent)' }}
                aria-hidden="true"
              />

              <span className="focus-row__title">
                {task.title}
                {subject && <span className="focus-row__subject"> · {subject.name}</span>}
              </span>

              {due ? (
                <span className={`chip chip--${state}`}>
                  <span className="chip__label">{state === 'overdue' ? 'Overdue' : 'Due'}</span>
                  {due}
                </span>
              ) : (
                planned && (
                  <span className="chip">
                    <span className="chip__label">Planned</span>
                    {planned}
                  </span>
                )
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
