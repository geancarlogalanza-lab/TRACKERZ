import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  hexToHsv,
  hsvToHex,
  isHex,
  normalizeHex,
  readableInk,
  type Hsv,
  type TakenColor,
} from '../../lib/color'

/** Geometry, in pixels. The square is inscribed in the ring's inner circle. */
const SIZE = 208
const RING = 20
const CENTRE = SIZE / 2
const INNER_RADIUS = CENTRE - RING
const SQUARE = Math.floor(INNER_RADIUS * Math.SQRT2) - 8
const SQUARE_OFFSET = (SIZE - SQUARE) / 2
const THUMB_RADIUS = CENTRE - RING / 2

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
  /** Colours belonging to other subjects, marked on the ring. */
  taken: TakenColor[]
  /** Labels the live preview, so the choice is seen in context. */
  previewLabel: string
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value))

/**
 * A hue ring with a saturation/brightness square inside it.
 *
 * The whole spectrum is reachable by dragging, with a hex field as the
 * precise (and keyboard-friendly) way in. Hues already spoken for by other
 * subjects are notched on the ring, so the gaps are visible before you drag
 * into one.
 */
export function ColorPicker({ value, onChange, taken, previewLabel }: ColorPickerProps) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value))
  const [hexDraft, setHexDraft] = useState(value)
  const ringRef = useRef<HTMLDivElement>(null)
  const squareRef = useRef<HTMLDivElement>(null)

  // Follow the value when it is changed from outside (a reset, a suggestion).
  useEffect(() => {
    if (hsvToHex(hsv) !== value) {
      setHsv(hexToHsv(value))
      setHexDraft(value)
    }
    // Only an external change should pull the wheel; dragging already owns it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = (next: Hsv) => {
    setHsv(next)
    const hex = hsvToHex(next)
    setHexDraft(hex)
    onChange(hex)
  }

  // --- Dragging ------------------------------------------------------------

  const ringFromEvent = (event: { clientX: number; clientY: number }) => {
    const box = ringRef.current?.getBoundingClientRect()
    if (!box) return
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = event.clientY - (box.top + box.height / 2)
    // 0 at twelve o'clock, increasing clockwise, matching the conic gradient.
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    if (angle < 0) angle += 360
    commit({ ...hsv, h: angle })
  }

  const squareFromEvent = (event: { clientX: number; clientY: number }) => {
    const box = squareRef.current?.getBoundingClientRect()
    if (!box) return
    commit({
      ...hsv,
      s: clamp((event.clientX - box.left) / box.width),
      v: clamp(1 - (event.clientY - box.top) / box.height),
    })
  }

  const drag =
    (handler: (event: { clientX: number; clientY: number }) => void) =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      handler(event)
    }

  const dragging =
    (handler: (event: { clientX: number; clientY: number }) => void) =>
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.buttons !== 1) return
      handler(event)
    }

  // --- Keyboard ------------------------------------------------------------

  const onRingKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 10 : 1
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? step
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -step
          : 0
    if (delta === 0) return
    event.preventDefault()
    commit({ ...hsv, h: (hsv.h + delta + 360) % 360 })
  }

  const onSquareKey = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.02
    let { s, v } = hsv
    if (event.key === 'ArrowRight') s = clamp(s + step)
    else if (event.key === 'ArrowLeft') s = clamp(s - step)
    else if (event.key === 'ArrowUp') v = clamp(v + step)
    else if (event.key === 'ArrowDown') v = clamp(v - step)
    else return
    event.preventDefault()
    commit({ ...hsv, s, v })
  }

  // --- Render --------------------------------------------------------------

  const hex = hsvToHex(hsv)
  const thumbX = CENTRE + Math.sin((hsv.h * Math.PI) / 180) * THUMB_RADIUS
  const thumbY = CENTRE - Math.cos((hsv.h * Math.PI) / 180) * THUMB_RADIUS

  return (
    <div className="picker">
      <div
        className="picker__wheel"
        style={{ width: SIZE, height: SIZE, ['--picker-inner']: `${INNER_RADIUS}px` } as React.CSSProperties}
      >
        <div
          className="picker__ring"
          ref={ringRef}
          role="slider"
          tabIndex={0}
          aria-label="Hue"
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(hsv.h)}
          onPointerDown={drag(ringFromEvent)}
          onPointerMove={dragging(ringFromEvent)}
          onKeyDown={onRingKey}
        >
          {/* Punches the centre out of the disc. Done with a real element
              rather than a CSS mask, which older browsers skip silently —
              and a missed mask would leave a solid disc over the square. */}
          <span
            className="picker__hole"
            style={{ width: INNER_RADIUS * 2, height: INNER_RADIUS * 2 }}
          />

          {/* Hues other subjects already hold, so the gaps are visible. */}
          {taken.map((item) => {
            const angle = hexToHsv(item.color).h
            return (
              <span
                key={`${item.name}-${item.color}`}
                className="picker__taken"
                title={`${item.name} uses this hue`}
                style={{
                  background: item.color,
                  left: CENTRE + Math.sin((angle * Math.PI) / 180) * THUMB_RADIUS,
                  top: CENTRE - Math.cos((angle * Math.PI) / 180) * THUMB_RADIUS,
                }}
              />
            )
          })}
          <span className="picker__thumb" style={{ left: thumbX, top: thumbY, background: hex }} />
        </div>

        <div
          className="picker__square"
          ref={squareRef}
          role="group"
          tabIndex={0}
          aria-label="Saturation and brightness. Arrow keys to adjust."
          style={{
            width: SQUARE,
            height: SQUARE,
            left: SQUARE_OFFSET,
            top: SQUARE_OFFSET,
            backgroundColor: `hsl(${hsv.h} 100% 50%)`,
          }}
          onPointerDown={drag(squareFromEvent)}
          onPointerMove={dragging(squareFromEvent)}
          onKeyDown={onSquareKey}
        >
          <span
            className="picker__thumb"
            style={{
              left: hsv.s * SQUARE,
              top: (1 - hsv.v) * SQUARE,
              background: hex,
            }}
          />
        </div>
      </div>

      <div className="picker__side">
        <span className="picker__preview" style={{ background: hex, color: readableInk(hex) }}>
          {previewLabel || 'Subject'}
        </span>

        <label className="picker__hex">
          <span className="sr-only">Colour hex code</span>
          <input
            className="input"
            value={hexDraft}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => {
              const next = event.target.value
              setHexDraft(next)
              if (isHex(next)) {
                const normalized = normalizeHex(next)
                setHsv(hexToHsv(normalized))
                onChange(normalized)
              }
            }}
            onBlur={() => setHexDraft(hex)}
          />
        </label>
      </div>
    </div>
  )
}
