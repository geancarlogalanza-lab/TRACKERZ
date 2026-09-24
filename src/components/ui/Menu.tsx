import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './Button'
import { MoreIcon } from './Icons'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

const GAP = 4
const EDGE = 8

/**
 * A small "more actions" menu. Rarely-used controls live here so the card
 * itself stays uncluttered. Closes on outside click, Escape, scroll, or
 * selection.
 *
 * The list is rendered at the document level and positioned from the
 * button, not nested inside it. Nested, it would be clipped by any
 * ancestor with overflow hidden (subject cards) and painted under any
 * later sibling that forms its own stacking context (the calendar panel
 * beneath Today, once the fireplace frosts it). Out here, nothing can
 * cover it. It opens upward when there is no room below.
 */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<CSSProperties | null>(null)
  // Where the list renders: resolved when the menu opens (an event, where
  // reading the DOM is allowed), never during render.
  const [portalTarget, setPortalTarget] = useState<Element | null>(null)
  const anchorRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open) {
      setStyle(null)
      return
    }
    const anchor = anchorRef.current?.getBoundingClientRect()
    const list = listRef.current
    if (!anchor || !list) return

    const right = Math.max(EDGE, window.innerWidth - anchor.right)
    const fitsBelow = anchor.bottom + GAP + list.offsetHeight <= window.innerHeight - EDGE
    setStyle(
      fitsBelow
        ? { top: anchor.bottom + GAP, right }
        : { bottom: window.innerHeight - anchor.top + GAP, right },
    )
  }, [open])

  useEffect(() => {
    if (!open) return

    const close = () => setOpen(false)
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!anchorRef.current?.contains(target) && !listRef.current?.contains(target)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    // A fixed-position menu would drift from its button if the page moved.
    window.addEventListener('scroll', close, { capture: true })
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('scroll', close, { capture: true })
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <div className="menu" ref={anchorRef}>
      <IconButton
        label={label}
        aria-expanded={open}
        onClick={() => {
          setPortalTarget(anchorRef.current?.closest('.app') ?? document.body)
          setOpen((value) => !value)
        }}
      >
        <MoreIcon />
      </IconButton>

      {open &&
        portalTarget &&
        createPortal(
          <div
            className="menu__list"
            role="menu"
            aria-label={label}
            ref={listRef}
            // Hidden until measured, so it never flashes at the wrong spot.
            style={style ?? { top: 0, right: 0, visibility: 'hidden' }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={`menu__item${item.danger ? ' menu__item--danger' : ''}`}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          // Inside the app root, not <body>: the menu then takes the palette of
          // the screen it opens on (the Streak tracker is always dark).
          portalTarget,
        )}
    </div>
  )
}
