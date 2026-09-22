import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { ColorPicker } from '../ui/ColorPicker'
import { Field, FormError } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { isFaintOnSurfaces, nearestConflict, suggestColor } from '../../lib/color'
import { toMessage } from '../../lib/errors'
import type { Subject, SubjectInput } from '../../data/types'

interface SubjectFormProps {
  subject?: Subject
  /** Every subject, so the picker knows which colours are spoken for. */
  subjects: Subject[]
  onSave: (input: SubjectInput) => Promise<void>
  onClose: () => void
}

/**
 * Name and colour, nothing else.
 *
 * The colour has to be one you can tell apart from the other subjects at a
 * glance, so it is checked against them as you drag rather than when you
 * press save. Two exceptions keep that from becoming a trap: a subject's own
 * saved colour is always allowed — even where it clashes, so a rename never
 * forces a repaint — and a colour that is merely hard to see gets a note
 * rather than a block.
 */
export function SubjectForm({ subject, subjects, onSave, onClose }: SubjectFormProps) {
  const others = useMemo(
    () =>
      subjects
        .filter((item) => item.id !== subject?.id)
        .map((item) => ({ name: item.name, color: item.color })),
    [subjects, subject?.id],
  )

  const [name, setName] = useState(subject?.name ?? '')
  const [color, setColor] = useState(() => subject?.color ?? suggestColor(others))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const conflict = nearestConflict(color, others)
  const keptOwnColor = subject !== undefined && color.toLowerCase() === subject.color.toLowerCase()
  const blocked = conflict !== null && !keptOwnColor
  const faint = isFaintOnSurfaces(color)

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Give the subject a name.')
    if (blocked && conflict) {
      return setError(`That colour is too close to ${conflict.name}. Pick one further away.`)
    }

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
          <Button type="submit" variant="primary" disabled={busy || blocked}>
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
        <ColorPicker value={color} onChange={setColor} taken={others} previewLabel={name} />

        <p
          className={`picker__status${blocked ? ' picker__status--blocked' : ''}`}
          role={blocked ? 'alert' : undefined}
        >
          {blocked && conflict ? (
            <>Too similar to {conflict.name}. Try another hue, or a lighter or darker shade.</>
          ) : keptOwnColor && conflict ? (
            <>Shared with {conflict.name} — move it to tell them apart.</>
          ) : faint ? (
            <>This one is faint against the app background, but it will still show.</>
          ) : others.length > 0 ? (
            <>Clearly different from your other subjects.</>
          ) : (
            <>Drag the ring for a hue, the square for shade.</>
          )}
        </p>
      </div>
    </Modal>
  )
}
