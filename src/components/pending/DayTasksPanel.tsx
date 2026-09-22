import { useEffect, useRef } from 'react'
import { Button } from '../ui/Button'
import { PlusIcon } from '../ui/Icons'
import { TaskItem } from './TaskItem'
import { formatDay, formatLongDay } from '../../lib/dates'
import type { DayTasks } from '../../lib/taskCalendar'
import type { ISODate, Subject, Task } from '../../data/types'

interface DayTasksPanelProps {
  day: ISODate
  tasks: DayTasks | undefined
  subjectsById: Map<string, Subject>
  /** Absent when there are no subjects yet to hang a task on. */
  onAddTask?: () => void
  onEditTask: (task: Task) => void
  onCompleteTask: (taskId: string) => void
}

/**
 * Everything the Pending tracker knows about one date, split into the two
 * questions a day actually raises: what am I working on, and what is due.
 *
 * A task planned and due on the same day appears in both groups on purpose —
 * they are different facts about it. Rows are the same `TaskItem` the subject
 * grid uses, so completing and editing behave identically here; this panel
 * shows the tracker's tasks, it does not own them.
 */
export function DayTasksPanel({
  day,
  tasks,
  subjectsById,
  onAddTask,
  onEditTask,
  onCompleteTask,
}: DayTasksPanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // On a phone the panel sits below the grid, so a tap on a date would
  // otherwise change something off-screen. Never on first paint.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (window.matchMedia('(max-width: 860px)').matches) {
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [day])

  const planned = tasks?.planned ?? []
  const due = tasks?.due ?? []
  const empty = planned.length === 0 && due.length === 0

  const group = (title: string, list: Task[]) =>
    list.length > 0 && (
      <div className="dpanel__group">
        <h3 className="section-title">{title}</h3>
        {list.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            subject={subjectsById.get(task.subject_id)}
            onComplete={() => onCompleteTask(task.id)}
            onEdit={() => onEditTask(task)}
          />
        ))}
      </div>
    )

  return (
    <section className="dpanel" aria-labelledby="day-panel-heading" ref={panelRef}>
      <header className="dpanel__head">
        <h2 className="dpanel__date" id="day-panel-heading">
          {formatLongDay(day)}
        </h2>
        <span className="dpanel__relative">{formatDay(day)}</span>
      </header>

      {empty ? (
        <p className="dpanel__empty">Nothing planned or due.</p>
      ) : (
        <>
          {group('Planned', planned)}
          {group('Due', due)}
        </>
      )}

      {onAddTask && (
        <div className="dpanel__foot">
          <Button variant="ghost" size="sm" onClick={onAddTask}>
            <PlusIcon size={14} />
            Add a task planned for this day
          </Button>
        </div>
      )}
    </section>
  )
}
