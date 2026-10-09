import { useMemo, useState, type ReactNode } from 'react'
import { Button } from '../ui/Button'
import { PlusIcon } from '../ui/Icons'
import { Menu } from '../ui/Menu'
import { ConfirmDialog, EmptyState, ErrorNotice, Loading } from '../ui/Feedback'
import { PromptDialog } from '../ui/PromptDialog'
import { DayTasksPanel } from './DayTasksPanel'
import { FocusStrip } from './FocusStrip'
import { TaskCalendar } from './TaskCalendar'
import { SubjectCard } from './SubjectCard'
import { SubjectForm } from './SubjectForm'
import { TaskForm } from './TaskForm'
import { deadlineState, today as todayISO } from '../../lib/dates'
import { burst, ember } from '../../lib/ember'
import { needsAttention } from '../../lib/focus'
import { indexTasksByDay } from '../../lib/taskCalendar'
import { plural } from '../../lib/plural'
import { duplicateName } from '../../lib/validation'
import type { usePendingTracker } from '../../hooks/usePendingTracker'
import type { ISODate, Subject, Task } from '../../data/types'

type Dialog =
  | { kind: 'new-subject' }
  | { kind: 'edit-subject'; subject: Subject }
  | { kind: 'delete-subject'; subject: Subject }
  | { kind: 'new-task'; subjectId: string; plannedDate?: ISODate }
  | { kind: 'edit-task'; task: Task }
  | { kind: 'new-trimester' }
  | { kind: 'rename-trimester' }
  | { kind: 'delete-trimester' }
  | null

/** Tasks sort by deadline, then by planned time, then by when they were added. */
function byUrgency(a: Task, b: Task) {
  const key = (task: Task) =>
    `${task.deadline_date ?? '9999-12-31'}${task.deadline_time ?? '23:59'}` +
    `${task.planned_date ?? '9999-12-31'}${task.planned_time ?? '23:59'}`
  const compared = key(a).localeCompare(key(b))
  return compared !== 0 ? compared : a.created_at.localeCompare(b.created_at)
}

interface PendingTrackerProps {
  store: ReturnType<typeof usePendingTracker>
  /** Which College section is showing: Tasks (the subject grid) or Calendar. */
  view: 'subjects' | 'calendar'
  /** The College section switch, which leads this screen's toolbar. */
  nav: ReactNode
}

export function PendingTracker({ store, view, nav }: PendingTrackerProps) {
  const [dialog, setDialog] = useState<Dialog>(null)
  const today = todayISO()
  const [selectedDay, setSelectedDay] = useState<ISODate>(today)
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const close = () => setDialog(null)

  const {
    trimesters,
    activeTrimesterId,
    setActiveTrimesterId,
    subjects,
    tasks,
    loading,
    loadError,
    retry,
  } = store

  const activeTrimester = trimesters.find((item) => item.id === activeTrimesterId)

  const subjectsById = useMemo(
    () => new Map(subjects.map((subject) => [subject.id, subject])),
    [subjects],
  )

  /** The calendar reads this and nothing else, so it can never drift. */
  const tasksByDay = useMemo(() => indexTasksByDay(tasks), [tasks])

  const tasksBySubject = useMemo(() => {
    const grouped = new Map<string, Task[]>()
    for (const subject of subjects) grouped.set(subject.id, [])
    for (const task of tasks) grouped.get(task.subject_id)?.push(task)
    for (const list of grouped.values()) list.sort(byUrgency)
    return grouped
  }, [subjects, tasks])

  /** Subjects with something overdue float up; the rest keep their order. */
  const orderedSubjects = useMemo(() => {
    const hasOverdue = (subject: Subject) =>
      (tasksBySubject.get(subject.id) ?? []).some(
        (task) => deadlineState(task.deadline_date, task.deadline_time) === 'overdue',
      )
    return [...subjects].sort((a, b) => Number(hasOverdue(b)) - Number(hasOverdue(a)))
  }, [subjects, tasksBySubject])

  /**
   * Finishing a task throws sparks off its check and lights a small ember
   * there. Finishing the last thing that needed attention does both bigger:
   * the list is clear.
   */
  const completeTask = (taskId: string, origin?: Element) => {
    if (origin) {
      const pressing = tasks.filter((task) => needsAttention(task, today))
      const size = pressing.length === 1 && pressing[0].id === taskId ? 'blaze' : 'flick'
      burst(origin, size)
      ember(origin, size)
    }
    void store.completeTask(taskId)
  }

  const startNewTask = (plannedDate?: ISODate) => {
    if (subjects.length > 0) setDialog({ kind: 'new-task', subjectId: subjects[0].id, plannedDate })
  }

  return (
    <>
      <div className="toolbar">
        {nav}

        <label className="sr-only" htmlFor="trimester-select">
          Trimester
        </label>
        <select
          id="trimester-select"
          className="select"
          value={activeTrimesterId ?? ''}
          onChange={(event) => setActiveTrimesterId(event.target.value)}
        >
          {trimesters.map((trimester) => (
            <option key={trimester.id} value={trimester.id}>
              {trimester.label}
            </option>
          ))}
        </select>

        <Menu
          label="Trimester actions"
          items={[
            { label: 'New trimester', onSelect: () => setDialog({ kind: 'new-trimester' }) },
            { label: 'Rename trimester', onSelect: () => setDialog({ kind: 'rename-trimester' }) },
            {
              label: 'Delete trimester',
              onSelect: () => setDialog({ kind: 'delete-trimester' }),
              danger: true,
            },
          ]}
        />

        <span className="toolbar__spacer" />

        <Button onClick={() => setDialog({ kind: 'new-subject' })}>
          <PlusIcon />
          Subject
        </Button>
        {subjects.length > 0 && (
          <span className="desktop-action">
            <Button variant="primary" onClick={() => startNewTask()}>
              <PlusIcon />
              New task
            </Button>
          </span>
        )}
      </div>

      {loadError && <ErrorNotice message={loadError} onRetry={retry} />}

      {loading && !loadError && <Loading label="Loading your subjects…" />}

      {!loading && !loadError && view === 'calendar' && (
        <div className="cal-layout">
          <div className="cal-layout__grid">
            <TaskCalendar
              year={month.year}
              month={month.month}
              today={today}
              selected={selectedDay}
              byDay={tasksByDay}
              subjectsById={subjectsById}
              onSelect={setSelectedDay}
              onMonthChange={(year, nextMonth) => setMonth({ year, month: nextMonth })}
            />
          </div>
          <div className="cal-layout__day">
            <DayTasksPanel
              day={selectedDay}
              tasks={tasksByDay.get(selectedDay)}
              subjectsById={subjectsById}
              onAddTask={subjects.length > 0 ? () => startNewTask(selectedDay) : undefined}
              onEditTask={(task) => setDialog({ kind: 'edit-task', task })}
              onCompleteTask={completeTask}
            />
          </div>
        </div>
      )}

      {!loading && !loadError && view === 'subjects' && (
        <>
          <FocusStrip
            tasks={tasks}
            subjectsById={subjectsById}
            onCompleteTask={completeTask}
          />

          {subjects.length === 0 ? (
            <EmptyState
              title="No subjects yet"
              text="Add the subjects you are taking this trimester, then start adding tasks to them."
              action={
                <Button variant="primary" onClick={() => setDialog({ kind: 'new-subject' })}>
                  <PlusIcon />
                  Add your first subject
                </Button>
              }
            />
          ) : (
            <div className="subject-grid">
              {orderedSubjects.map((subject) => (
                <SubjectCard
                  key={subject.id}
                  subject={subject}
                  tasks={tasksBySubject.get(subject.id) ?? []}
                  onAddTask={() => setDialog({ kind: 'new-task', subjectId: subject.id })}
                  onEditTask={(task) => setDialog({ kind: 'edit-task', task })}
                  onCompleteTask={completeTask}
                  onEditSubject={() => setDialog({ kind: 'edit-subject', subject })}
                  onDeleteSubject={() => setDialog({ kind: 'delete-subject', subject })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* On a phone the primary action sits within thumb reach. */}
      {!loading && !loadError && subjects.length > 0 && (
        <div className="mobile-action">
          <Button variant="primary" block onClick={() => startNewTask()}>
            <PlusIcon />
            New task
          </Button>
        </div>
      )}

      {dialog?.kind === 'new-subject' && (
        <SubjectForm subjects={subjects} onSave={store.addSubject} onClose={close} />
      )}

      {dialog?.kind === 'edit-subject' && (
        <SubjectForm
          subject={dialog.subject}
          subjects={subjects}
          onSave={(input) => store.editSubject(dialog.subject.id, input)}
          onClose={close}
        />
      )}

      {dialog?.kind === 'delete-subject' && (
        <ConfirmDialog
          title={`Delete ${dialog.subject.name}?`}
          message={`This removes the subject and its ${plural(
            (tasksBySubject.get(dialog.subject.id) ?? []).length,
            'pending task',
          )}. This cannot be undone.`}
          confirmLabel="Delete subject"
          onConfirm={() => store.removeSubject(dialog.subject.id)}
          onCancel={close}
        />
      )}

      {dialog?.kind === 'new-task' && (
        <TaskForm
          subjects={subjects}
          subjectId={dialog.subjectId}
          tasks={tasks}
          initialPlannedDate={dialog.plannedDate}
          onSave={store.addTask}
          onClose={close}
        />
      )}

      {dialog?.kind === 'edit-task' && (
        <TaskForm
          subjects={subjects}
          subjectId={dialog.task.subject_id}
          task={dialog.task}
          tasks={tasks}
          onSave={(subjectId, input) => store.editTask(dialog.task.id, subjectId, input)}
          onClose={close}
        />
      )}

      {dialog?.kind === 'new-trimester' && (
        <PromptDialog
          title="New trimester"
          label="Name"
          placeholder="Trimester 2"
          submitLabel="Create"
          check={(label) =>
            duplicateName(
              label,
              trimesters.map((item) => item.label),
              'trimester',
            )
          }
          onSubmit={store.addTrimester}
          onClose={close}
        />
      )}

      {dialog?.kind === 'rename-trimester' && activeTrimester && (
        <PromptDialog
          title="Rename trimester"
          label="Name"
          initialValue={activeTrimester.label}
          submitLabel="Save"
          check={(label) =>
            duplicateName(
              label,
              trimesters.filter((item) => item.id !== activeTrimester.id).map((item) => item.label),
              'trimester',
            )
          }
          onSubmit={(label) => store.editTrimester(activeTrimester.id, label)}
          onClose={close}
        />
      )}

      {dialog?.kind === 'delete-trimester' && activeTrimester && (
        <ConfirmDialog
          title={`Delete ${activeTrimester.label}?`}
          message={`This removes the trimester along with its ${plural(
            subjects.length,
            'subject',
          )} and their tasks. This cannot be undone.`}
          confirmLabel="Delete trimester"
          onConfirm={() => store.removeTrimester(activeTrimester.id)}
          onCancel={close}
        />
      )}
    </>
  )
}
