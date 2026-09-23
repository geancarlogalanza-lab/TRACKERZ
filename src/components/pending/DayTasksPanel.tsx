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

  const due = tasks?.due ?? []
  const dueIds = new Set(due.map((task) => task.id))
  // Something due today is listed once, under Due. Its row already carries
  // the planned time, so repeating it above costs the emphasis and adds
  // nothing.
  const planned = (tasks?.planned ?? []).filter((task) => !dueIds.has(task.id))
  const empty = planned.length === 0 && due.length === 0

  const rows = (list: Task[]) =>
    list.map((task) => (
      <TaskItem
        key={task.id}
        task={task}
        subject={subjectsById.get(task.subject_id)}
        onComplete={() => onCompleteTask(task.id)}
        onEdit={() => onEditTask(task)}
      />
    ))

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
          {/* Deadlines lead: they are the part of a day that cannot slip. */}
          {due.length > 0 && (
            <div className="dpanel__group dpanel__group--due">
              <h3 className="dpanel__due-head">
                <span className="cmark cmark--due" aria-hidden="true" />
                Due this day
              </h3>
              {rows(due)}
            </div>
          )}

          {planned.length > 0 && (
            <div className="dpanel__group">
              <h3 className="section-title">Planned</h3>
              {rows(planned)}
            </div>
          )}
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
