import { useState, type ReactNode } from 'react'
import { Button, IconButton } from './Button'
import { CloseIcon } from './Icons'
import { Modal } from './Modal'
import { toMessage } from '../../lib/errors'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="loading" role="status">
      {label}
    </p>
  )
}

/** A failed load, with the one action that can help: try again. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="notice" role="alert">
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

interface EmptyStateProps {
  title: string
  text: string
  action?: ReactNode
}

export function EmptyState({ title, text, action }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      <p className="empty__text">{text}</p>
      {action}
    </div>
  )
}

/** Failure messages only. Successful actions are visible in the UI itself. */
export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="toast" role="alert">
      <span className="toast__text">{message}</span>
      <IconButton label="Dismiss" onClick={onDismiss}>
        <CloseIcon />
      </IconButton>
    </div>
  )
}

interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel: string
  onConfirm: () => Promise<void> | void
  onCancel: () => void
}

/**
 * Used before anything destructive. It waits for the request to finish and
 * shows the failure in place rather than closing as if it had worked.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onCancel()
    } catch (caught) {
      setError(toMessage(caught, 'That could not be deleted.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={title}
      onClose={busy ? () => {} : onCancel}
      footer={
        <>
          <Button onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={run} disabled={busy}>
            {busy ? 'Deleting…' : confirmLabel}
          </Button>
        </>
      }
    >
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{message}</p>
    </Modal>
  )
}
