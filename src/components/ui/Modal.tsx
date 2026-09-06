import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'
import { CloseIcon } from './Icons'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  /** Rendered in the footer; usually the cancel and submit buttons. */
  footer?: ReactNode
  /** Wraps the body in a form so Enter submits, which keeps entry quick. */
  onSubmit?: () => void
}

/**
 * A single dialog pattern used everywhere: Escape closes, the backdrop closes,
 * focus moves in on open and returns to where it came from on close.
 */
export function Modal({ title, onClose, children, footer, onSubmit }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return

      // Keep tabbing inside the dialog.
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    const firstField = dialogRef.current?.querySelector<HTMLElement>(
      'input, textarea, select, button',
    )
    firstField?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  const body = (
    <>
      <div className="modal__body">{children}</div>
      {footer && <div className="modal__footer">{footer}</div>}
    </>
  )

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
        <div className="modal__header">
          <h2 className="modal__title" id={titleId}>
            {title}
          </h2>
          <IconButton label="Close" onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>

        {onSubmit ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              onSubmit()
            }}
            style={{ display: 'contents' }}
          >
            {body}
          </form>
        ) : (
          body
        )}
      </div>
    </div>
  )
}
