import { useId, type ReactNode } from 'react'
import type { Notice } from '../../lib/validation'

/** What a control needs so a notice under it is read with it. */
export interface FieldA11y {
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface FieldProps {
  label: string
  /** Shown next to the label, e.g. "optional". */
  hint?: string
  /** An error, warning or note about this field, shown right under it. */
  notice?: Notice | null
  children: (id: string, a11y: FieldA11y) => ReactNode
}

/**
 * Label plus control, wired together so the label is always clickable, and
 * anything to say about the value said right beneath it.
 */
export function Field({ label, hint, notice, children }: FieldProps) {
  const id = useId()
  const noticeId = `${id}-notice`
  const a11y: FieldA11y = notice
    ? { 'aria-describedby': noticeId, ...(notice.level === 'error' ? { 'aria-invalid': true as const } : {}) }
    : {}
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {hint && <span className="field__hint"> · {hint}</span>}
      </label>
      {children(id, a11y)}
      <FieldNotice id={noticeId} notice={notice} />
    </div>
  )
}

/**
 * One line under a control. Errors are announced as they appear; warnings
 * and notes are simply read with the control.
 */
export function FieldNotice({ id, notice }: { id?: string; notice?: Notice | null }) {
  if (!notice) return null
  return (
    <p id={id} className={`field__notice field__notice--${notice.level}`} role={notice.level === 'error' ? 'alert' : undefined}>
      {notice.text}
    </p>
  )
}

/** Two controls on one row, used for the date + time pairs. */
export function FieldPair({ children }: { children: ReactNode }) {
  return <div className="field-pair">{children}</div>
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  )
}
