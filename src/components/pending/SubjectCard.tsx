import { Button } from '../ui/Button'
import { PlusIcon } from '../ui/Icons'
import { Menu } from '../ui/Menu'
import { TaskItem } from './TaskItem'
import type { CSSProperties } from 'react'
import type { Subject, Task } from '../../data/types'

interface SubjectCardProps {
  subject: Subject
  tasks: Task[]
  onAddTask: () => void
  onEditTask: (task: Task) => void
  onCompleteTask: (taskId: string) => void
  onEditSubject: () => void
  onDeleteSubject: () => void
}

/**
 * A subject and everything still pending under it. The card stays put when the
 * last task is completed — a subject only ever leaves by being deleted.
 */
export function SubjectCard({
  subject,
  tasks,
  onAddTask,
  onEditTask,
  onCompleteTask,
  onEditSubject,
  onDeleteSubject,
}: SubjectCardProps) {
  const style = { '--subject-color': subject.color } as CSSProperties

  return (
    <section className="subject" style={style} aria-labelledby={`subject-${subject.id}`}>
      <div className="subject__band" />

      <header className="subject__header">
        <span className="subject__swatch" aria-hidden="true" />
        <h3 className="subject__name" id={`subject-${subject.id}`} title={subject.name}>
          {subject.name}
        </h3>
        {tasks.length > 0 && <span className="subject__count">{tasks.length}</span>}
        <Menu
          label={`Actions for ${subject.name}`}
          items={[
            { label: 'Edit subject', onSelect: onEditSubject },
            { label: 'Delete subject', onSelect: onDeleteSubject, danger: true },
          ]}
        />
      </header>

      {tasks.length === 0 ? (
        <p className="subject__empty">No pending tasks</p>
      ) : (
        <div className="subject__tasks">
          {tasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              onComplete={() => onCompleteTask(task.id)}
              onEdit={() => onEditTask(task)}
            />
          ))}
        </div>
      )}

      <div className="subject__footer">
        <Button variant="ghost" size="sm" onClick={onAddTask}>
          <PlusIcon size={14} />
          Add task
        </Button>
      </div>
    </section>
  )
}
