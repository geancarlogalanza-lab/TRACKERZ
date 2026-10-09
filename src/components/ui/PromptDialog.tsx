import { useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Field, FormError } from './Field'
import { Modal } from './Modal'
import { aimBurst, type EmberIntensity } from '../../lib/ember'
import { toMessage } from '../../lib/errors'

interface PromptDialogProps {
  title: string
  label: string
  submitLabel: string
  initialValue?: string
  placeholder?: string
  maxLength?: number
  /** Extra controls rendered under the text field. */
  children?: ReactNode
  /** For a meaningful action: sparks thrown off the submit button once it saves. */
  sparks?: EmberIntensity
  onSubmit: (value: string) => Promise<void>
  onClose: () => void
}

/** A one-field dialog for the places that only need a name. */
export function PromptDialog({
  title,
  label,
  submitLabel,
  initialValue = '',
  placeholder,
  maxLength = 80,
  children,
  sparks,
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (submitter: HTMLElement | null) => {
    setError(null)
    if (!value.trim()) return setError(`${label} cannot be empty.`)

    // Aimed while the button is on screen; thrown once the save has landed.
    const pop = sparks && submitter ? aimBurst(submitter) : null
    setBusy(true)
    try {
      await onSubmit(value)
      if (sparks) pop?.(sparks)
      onClose()
    } catch (caught) {
      setError(toMessage(caught, 'Could not save that.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : submitLabel}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label={label}>
        {(id) => (
          <input
            id={id}
            className="input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            required
          />
        )}
      </Field>
      {children}
    </Modal>
  )
}
