import { useState } from 'react'
import { Button } from '../ui/Button'
import { Field, FieldPair, FormError } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { toMessage } from '../../lib/errors'
import type { Subject, Task, TaskInput } from '../../data/types'

interface TaskFormProps {
  subjects: Subject[]
  /** Which subject the form opens on. */
  subjectId: string
  /** Present when editing; absent when creating. */
  task?: Task
  onSave: (subjectId: string, input: TaskInput) => Promise<void>
  onClose: () => void
}

/**
 * One short form for both creating and editing. Everything fits on a single
 * screen: pick a subject, name the task, say when you plan to do it and when
 * it is due. Native date and time inputs keep this fast on a phone.
 */
export function TaskForm({ subjects, subjectId, task, onSave, onClose }: TaskFormProps) {
  const [selectedSubject, setSelectedSubject] = useState(subjectId)
  const [title, setTitle] = useState(task?.title ?? '')
  const [description, setDescription] = useState(task?.description ?? '')
  const [plannedDate, setPlannedDate] = useState(task?.planned_date ?? '')
  const [plannedTime, setPlannedTime] = useState(task?.planned_time?.slice(0, 5) ?? '')
  const [deadlineDate, setDeadlineDate] = useState(task?.deadline_date ?? '')
  // Most college deadlines land at end of day, so that is the starting point.
  const [deadlineTime, setDeadlineTime] = useState(task?.deadline_time?.slice(0, 5) ?? '23:59')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)

    if (!title.trim()) return setError('Give the task a title.')
    if (plannedTime && !plannedDate) return setError('Pick a planned date to go with the time.')
    if (deadlineTime && !deadlineDate && deadlineTime !== '23:59') {
      return setError('Pick a deadline date to go with the time.')
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

      <Field label="Task">
        {(id) => (
          <input
            id={id}
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Finish database normalization"
            maxLength={200}
            required
          />
        )}
      </Field>

      <Field label="Description" hint="optional">
        {(id) => (
          <textarea
            id={id}
            className="textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Anything you want to remember about it"
          />
        )}
      </Field>

      <Field label="Planned">
        {(id) => (
          <FieldPair>
            <input
              id={id}
              className="input"
              type="date"
              value={plannedDate}
              onChange={(event) => setPlannedDate(event.target.value)}
            />
            <input
              className="input"
              type="time"
              aria-label="Planned time"
              value={plannedTime}
              onChange={(event) => setPlannedTime(event.target.value)}
            />
          </FieldPair>
        )}
      </Field>

      <Field label="Deadline">
        {(id) => (
          <FieldPair>
            <input
              id={id}
              className="input"
              type="date"
              value={deadlineDate}
              onChange={(event) => setDeadlineDate(event.target.value)}
            />
            <input
              className="input"
              type="time"
              aria-label="Deadline time"
              value={deadlineTime}
              onChange={(event) => setDeadlineTime(event.target.value)}
            />
          </FieldPair>
        )}
      </Field>
    </Modal>
  )
}
