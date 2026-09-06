import { IconButton } from '../ui/Button'
import { CheckIcon, PencilIcon } from '../ui/Icons'
import { deadlineState, formatMoment } from '../../lib/dates'
import type { Task } from '../../data/types'

interface TaskItemProps {
  task: Task
  onComplete: () => void
  onEdit: () => void
}

/**
 * A pending task. Completing it is a single tap on the circle, after which the
 * task is gone for good — there is no archive to visit and nothing to undo.
 */
export function TaskItem({ task, onComplete, onEdit }: TaskItemProps) {
  const planned = formatMoment(task.planned_date, task.planned_time)
  const due = formatMoment(task.deadline_date, task.deadline_time)
  const state = deadlineState(task.deadline_date, task.deadline_time)

  return (
    <div className="task">
      <button
        type="button"
        className="task__complete"
        onClick={onComplete}
        aria-label={`Complete "${task.title}"`}
        title="Mark complete"
      >
        <span className="task__circle">
          <CheckIcon />
        </span>
      </button>

      <div className="task__body">
        <p className="task__title">{task.title}</p>
        {task.description && <p className="task__desc">{task.description}</p>}

        {(planned || due) && (
          <div className="task__meta">
            {planned && (
              <span className="chip">
                <span className="chip__label">Planned</span>
                {planned}
              </span>
            )}
            {due && (
              <span className={`chip chip--${state}`}>
                {/* The word carries the meaning, so colour is never the only cue. */}
                <span className="chip__label">{state === 'overdue' ? 'Overdue' : 'Due'}</span>
                {due}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="task__edit">
        <IconButton label={`Edit "${task.title}"`} onClick={onEdit}>
          <PencilIcon />
        </IconButton>
      </div>
    </div>
  )
}
