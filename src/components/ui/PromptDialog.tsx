import { useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Field, FormError } from './Field'
import { Modal } from './Modal'
import { aimBurst, type EmberIntensity } from '../../lib/ember'
import { toMessage } from '../../lib/errors'
import { LIMITS, requiredText, worst, type Notice } from '../../lib/validation'

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
  /**
   * Anything more to say about the value, such as a name that's already
   * taken. A warning shows and lets the save through; an error holds it.
   */
  check?: (value: string) => Notice | null
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
  maxLength = LIMITS.name,
  children,
  sparks,
  check,
  onSubmit,
  onClose,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue)
  const [visited, setVisited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const missing = requiredText(value, `Give it a ${label.toLowerCase()}.`)
  const checked = check?.(value) ?? null
  // An empty field is only called out once you've been to it.
  const notice = worst(visited ? missing : null, checked)

  const submit = async (submitter: HTMLElement | null) => {
    if (busy) return
    setError(null)
    if (missing || checked?.level === 'error') {
      setVisited(true)
      inputRef.current?.focus()
      return
    }

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
      <Field label={label} notice={notice}>
        {(id, a11y) => (
          <input
            id={id}
            ref={inputRef}
            className="input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={() => setVisited(true)}
            placeholder={placeholder}
            maxLength={maxLength}
            {...a11y}
          />
        )}
      </Field>
      {children}
    </Modal>
  )
}
