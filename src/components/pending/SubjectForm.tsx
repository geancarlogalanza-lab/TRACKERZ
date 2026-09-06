import { useState } from 'react'
import { Button } from '../ui/Button'
import { Field, FormError } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { toMessage } from '../../lib/errors'
import { SUBJECT_COLORS } from '../../lib/subjectColors'
import type { Subject, SubjectInput } from '../../data/types'

interface SubjectFormProps {
  subject?: Subject
  onSave: (input: SubjectInput) => Promise<void>
  onClose: () => void
}

export function SubjectForm({ subject, onSave, onClose }: SubjectFormProps) {
  const [name, setName] = useState(subject?.name ?? '')
  const [color, setColor] = useState(subject?.color ?? SUBJECT_COLORS[0].value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Give the subject a name.')

    setBusy(true)
    try {
      await onSave({ name, color })
      onClose()
    } catch (caught) {
      setError(toMessage(caught, 'Could not save that subject.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={subject ? 'Edit subject' : 'New subject'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : subject ? 'Save changes' : 'Add subject'}
          </Button>
        </>
      }
    >
      <FormError message={error} />

      <Field label="Subject name">
        {(id) => (
          <input
            id={id}
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Database Systems"
            maxLength={80}
            required
          />
        )}
      </Field>

      <div className="field">
        <span className="field__label">Colour</span>
        <div className="swatches" role="group" aria-label="Subject colour">
          {SUBJECT_COLORS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="swatch"
              style={{ background: option.value }}
              aria-label={option.name}
              aria-pressed={color === option.value}
              onClick={() => setColor(option.value)}
            />
          ))}
        </div>
      </div>
    </Modal>
  )
}
