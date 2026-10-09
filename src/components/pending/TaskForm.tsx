import { useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { Field, FieldPair, FormError } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { toMessage } from '../../lib/errors'
import { DEFAULT_DEADLINE_TIME, LIMITS, validateTask, type TaskNotices } from '../../lib/validation'
import type { ISODate, Subject, Task, TaskInput } from '../../data/types'

interface TaskFormProps {
  subjects: Subject[]
  /** Which subject the form opens on. */
  subjectId: string
  /** Present when editing; absent when creating. */
  task?: Task
  /** Every task, so a likely duplicate can be pointed out. */
  tasks: Task[]
  /** Seeds the planned date when creating from a calendar day. */
  initialPlannedDate?: ISODate
  onSave: (subjectId: string, input: TaskInput) => Promise<void>
  onClose: () => void
}

type FieldName = keyof TaskNotices

/** The order fields appear in, so the first problem is the one focused. */
const ORDER: FieldName[] = ['title', 'description', 'planned', 'deadline']

/**
 * One short form for both creating and editing. Everything fits on a single
 * screen: pick a subject, name the task, say when you plan to do it and when
 * it is due. Native date and time inputs keep this fast on a phone.
 *
 * What the form thinks of the input appears under each field as you go
 * (src/lib/validation.ts decides it). Warnings and notes show at once and
 * never block; an error shows once you've been to that field or tried to
 * save, and holds the save until it's fixed. Nothing typed is ever cleared.
 */
export function TaskForm({
  subjects,
  subjectId,
  task,
  tasks,
  initialPlannedDate,
  onSave,
  onClose,
}: TaskFormProps) {
  const [selectedSubject, setSelectedSubject] = useState(subjectId)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [plannedDate, setPlannedDate] = useState(task?.planned_date ?? initialPlannedDate ?? '')
  const [plannedTime, setPlannedTime] = useState(task?.planned_time?.slice(0, 5) ?? '')
  const [deadlineDate, setDeadlineDate] = useState(task?.deadline_date ?? '')
  // Most college deadlines land at end of day, so a new task starts there.
  // An existing one keeps exactly what it had: a date-only deadline stays
  // date-only rather than quietly becoming 11:59 PM.
  const [deadlineTime, setDeadlineTime] = useState(
    task ? (task.deadline_time?.slice(0, 5) ?? '') : DEFAULT_DEADLINE_TIME,
  )
  // The browser couldn't read a half-typed date; its value then reads empty.
  const [plannedUnreadable, setPlannedUnreadable] = useState(false)
  const [deadlineUnreadable, setDeadlineUnreadable] = useState(false)
  const [now] = useState(() => new Date())

  const [touched, setTouched] = useState<Set<FieldName>>(() => new Set())
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refs = {
    title: useRef<HTMLInputElement>(null),
    description: useRef<HTMLTextAreaElement>(null),
    planned: useRef<HTMLInputElement>(null),
    deadline: useRef<HTMLInputElement>(null),
  }

  const notices = validateTask(
    {
      subjectId: selectedSubject,
      title,
      description,
      plannedDate,
      plannedTime,
      deadlineDate,
      deadlineTime,
      plannedUnreadable,
      deadlineUnreadable,
    },
    { now, original: task, others: tasks },
  )

  const touch = (field: FieldName) =>
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)))

  /** Errors wait until the field has been visited or a save tried; the rest show at once. */
  const shown = (field: FieldName) => {
    const notice = notices[field]
    if (!notice) return null
    return notice.level !== 'error' || attempted || touched.has(field) ? notice : null
  }

  /** A date field's value and whether the browser could read what was typed. */
  const readDate = (
    input: HTMLInputElement,
    setValue: (value: string) => void,
    setUnreadable: (bad: boolean) => void,
  ) => {
    setValue(input.value)
    setUnreadable(input.validity.badInput)
  }

  const submit = async () => {
    if (busy) return
    setError(null)
    setAttempted(true)

    // Typing part of a date fires no change, and Enter submits without
    // leaving the field, so ask the date fields themselves one last time.
    const plannedBad = refs.planned.current?.validity.badInput ?? false
    const deadlineBad = refs.deadline.current?.validity.badInput ?? false
    setPlannedUnreadable(plannedBad)
    setDeadlineUnreadable(deadlineBad)
    if (plannedBad || deadlineBad) {
      ;(plannedBad ? refs.planned : refs.deadline).current?.focus()
      return
    }

    const firstError = ORDER.find((field) => notices[field]?.level === 'error')
    if (firstError) {
      refs[firstError].current?.focus()
      return
    }

    setBusy(true)
    try {
      await onSave(selectedSubject, {
        title,
        description,
        planned_date: plannedDate || null,
        planned_time: plannedTime || null,
        deadline_date: deadlineDate || null,
        // A time with no date would never be shown, so it is dropped.
        deadline_time: deadlineDate ? deadlineTime || null : null,
      })
      onClose()
    } catch (caught) {
      setError(toMessage(caught, 'Could not save that task.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : task ? 'Save changes' : 'Create task'}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      <Field label="Subject">
        {(id) => (
          <select
            id={id}
            className="select"
            style={{ width: '100%' }}
            value={selectedSubject}
            onChange={(event) => setSelectedSubject(event.target.value)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field label="Task" notice={shown('title')}>
        {(id, a11y) => (
          <input
            id={id}
            ref={refs.title}
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => touch('title')}
            placeholder="Finish database normalization"
            maxLength={LIMITS.taskTitle}
            {...a11y}
          />
        )}
      </Field>

      <Field label="Description" hint="optional" notice={shown('description')}>
        {(id, a11y) => (
          <textarea
            id={id}
            ref={refs.description}
            className="textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => touch('description')}
            placeholder="Anything you want to remember about it"
            {...a11y}
          />
        )}
      </Field>

      <Field label="Planned" notice={shown('planned')}>
        {(id, a11y) => (
          <FieldPair>
            <input
              id={id}
              ref={refs.planned}
              className="input"
              type="date"
              value={plannedDate}
              onChange={(event) => {
                readDate(event.currentTarget, setPlannedDate, setPlannedUnreadable)
                touch('planned')
              }}
              onBlur={(event) => {
                setPlannedUnreadable(event.currentTarget.validity.badInput)
                touch('planned')
              }}
              {...a11y}
            />
            <input
              className="input"
              type="time"
              aria-label="Planned time"
              value={plannedTime}
              onChange={(event) => {
                setPlannedTime(event.target.value)
                touch('planned')
              }}
              {...a11y}
            />
          </FieldPair>
        )}
      </Field>

      <Field label="Deadline" notice={shown('deadline')}>
        {(id, a11y) => (
          <FieldPair>
            <input
              id={id}
              ref={refs.deadline}
              className="input"
              type="date"
              value={deadlineDate}
              onChange={(event) => {
                readDate(event.currentTarget, setDeadlineDate, setDeadlineUnreadable)
                touch('deadline')
              }}
              onBlur={(event) => {
                setDeadlineUnreadable(event.currentTarget.validity.badInput)
                touch('deadline')
              }}
              {...a11y}
            />
            <input
              className="input"
              type="time"
              aria-label="Deadline time"
              value={deadlineTime}
              onChange={(event) => {
                setDeadlineTime(event.target.value)
                touch('deadline')
              }}
              {...a11y}
            />
          </FieldPair>
        )}
      </Field>
    </Modal>
  )
}
