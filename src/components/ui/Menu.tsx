import { useEffect, useRef, useState } from 'react'
import { IconButton } from './Button'
import { MoreIcon } from './Icons'

export interface MenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
}

/**
 * A small "more actions" menu. Rarely-used controls live here so the card
 * itself stays uncluttered. Closes on outside click, Escape, or selection.
 */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="menu" ref={containerRef}>
      <IconButton label={label} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <MoreIcon />
      </IconButton>

      {open && (
        <div className="menu__list" role="menu">
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
        </div>
      )}
    </div>
  )
}
