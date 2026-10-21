import { useState } from 'react'
import { RollingNumber } from './RollingNumber'

interface StreakCountProps {
  count: number
  /** Kept today, so it burns; or still owed today, so it smoulders. */
  state: 'done' | 'needs'
  /** Owed, and missing today would end the run: the coals run low. */
  lastDay?: boolean
  /** Give the roll a longer beat — a milestone was just reached. */
  celebrate?: boolean
}

/**
 * A live run's count on the Today panel, drawn the way the hearth draws
 * fire. The digits are banded like a pixel flame on a hard pixel shadow. A
 * run kept today burns: it catches as the panel opens, flickers a few
 * beats, and a few embers rise off it. One still owed today smoulders, and
 * on its last grace day the coals run low. A continue lands the new number
 * white-hot and throws sparks; an undo lands it a beat cold.
 *
 * The number keeps the size and place it always had — sparks and glow sit
 * outside the layout — and every motion here ends within seconds (see the
 * stylesheet).
 */
export function StreakCount({ count, state, lastDay = false, celebrate = false }: StreakCountProps) {
  // Which way the count last moved while on screen: a run that was just
  // continued throws sparks and keeps burning, rather than catching again
  // from cold. Derived from the previous count during render, as React
  // recommends for a value that follows from the last one.
  const [shown, setShown] = useState(count)
  const [moved, setMoved] = useState<'up' | 'down' | null>(null)
  if (count !== shown) {
    setShown(count)
    setMoved(count > shown ? 'up' : 'down')
  }

  const classes = [
    'srow__count',
    'scount',
    `scount--${state}`,
    state === 'needs' && lastDay ? 'scount--low' : '',
    moved ? 'scount--moved' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes}>
      <span className="scount__digits">
        <span className="scount__glyphs">
          <RollingNumber value={count} long={celebrate} />
        </span>
        {state === 'done' && (
          // Keyed by the count, so each continue throws a fresh set.
          <span
            key={count}
            className={`scount__sparks scount__sparks--${moved === 'up' ? 'burst' : 'rise'}`}
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        )}
      </span>
      <span className="srow__unit">{count === 1 ? 'day' : 'days'}</span>
    </span>
  )
}
