import { useEffect, useRef, useState } from 'react'

interface RollingNumberProps {
  value: number
  /** A slightly longer beat, used on milestones. */
  long?: boolean
}

/**
 * A count that rolls to its new value: the old digit exits upward and the
 * new one enters from below, inside a mask one line tall. Going down (an
 * undo) reverses the direction and is quicker — it's a correction, not a
 * reward. With reduced motion on, the number simply changes.
 */
export function RollingNumber({ value, long = false }: RollingNumberProps) {
  const [roll, setRoll] = useState<{ from: number; to: number } | null>(null)
  const shown = useRef(value)

  useEffect(() => {
    if (value === shown.current) return
    const from = shown.current
    shown.current = value
    setRoll({ from, to: value })
    // Outlasts the CSS delay plus duration, so the number settles after it lands.
    const timer = setTimeout(() => setRoll(null), long ? 640 : 480)
    return () => clearTimeout(timer)
  }, [value, long])

  if (!roll) {
    return (
      <span className="num">
        <span className="num__in">{value}</span>
      </span>
    )
  }

  const up = roll.to > roll.from
  const classes = ['num__in', up ? 'num__in--up' : 'num__in--down', long ? 'num__in--long' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <span className="num">
      {/* Keyed so the animation starts fresh for each roll and never replays on settle. */}
      <span key={`${roll.from}-${roll.to}`} className={classes}>
        <span>{up ? roll.from : roll.to}</span>
        <span>{up ? roll.to : roll.from}</span>
      </span>
    </span>
  )
}
