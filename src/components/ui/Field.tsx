import { useId, type ReactNode } from 'react'

interface FieldProps {
  label: string
  /** Shown next to the label, e.g. "optional". */
  hint?: string
  children: (id: string) => ReactNode
}

/** Label plus control, wired together so the label is always clickable. */
export function Field({ label, hint, children }: FieldProps) {
  const id = useId()
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {hint && <span className="field__hint"> · {hint}</span>}
      </label>
      {children(id)}
    </div>
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
