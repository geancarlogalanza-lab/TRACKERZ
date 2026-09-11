import { IconButton, Button } from '../ui/Button'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/Icons'
import { formatLongDay, monthName, toISODate } from '../../lib/dates'
import type { SegmentState } from '../../lib/streakMath'
import type { ISODate } from '../../data/types'

export interface DaySegment {
  streakId: string
  state: SegmentState
}

interface CalendarProps {
  year: number
  month: number
  today: ISODate
  selected: ISODate
  /**
   * One segment per streak that existed on the day, always in the same order,
   * so a streak's history reads as a continuous line across the month.
   */
  segmentsFor: (day: ISODate) => DaySegment[]
  /** Spotlight one streak's segments and dim the rest, or null for all. */
  focusStreakId: string | null
  /** Briefly ring today's cell — the last streak was just secured. */
  pulseToday: boolean
  onSelect: (date: ISODate) => void
  onMonthChange: (year: number, month: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * A month grid, Monday first. Each day carries one mark: a short track with a
 * segment per streak that existed that day. A segment is filled in the accent
 * while its run is alive, muted once that run has ended, and empty on a day
 * the streak was missed — so an ended run reads as a grey line that stops,
 * and the live run is the only thing in colour. Future days have no track
 * and can't be selected; there is nothing there yet.
 */
export function Calendar({
  year,
  month,
  today,
  selected,
  segmentsFor,
  focusStreakId,
  pulseToday,
  onSelect,
  onMonthChange,
}: CalendarProps) {
  const firstOfMonth = new Date(year, month, 1)
  // getDay() is Sunday-based; shift so Monday starts the week.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7

  const cells: Date[] = []
  const cursor = new Date(year, month, 1 - leadingBlanks)
  // Six rows always, so the grid never changes height between months.
  for (let index = 0; index < 42; index += 1) {
    cells.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  const step = (delta: number) => {
    const next = new Date(year, month + delta, 1)
    onMonthChange(next.getFullYear(), next.getMonth())
  }

  const goToToday = () => {
    const now = new Date()
    onMonthChange(now.getFullYear(), now.getMonth())
    onSelect(today)
  }

  return (
    <section
      className={`calendar${focusStreakId ? ' calendar--focus' : ''}`}
      aria-label="Streak calendar"
    >
      <header className="calendar__header">
        <h2 className="calendar__month" aria-live="polite">
          {monthName(month)} {year}
        </h2>
        <Button size="sm" onClick={goToToday}>
          Today
        </Button>
        <IconButton label="Previous month" onClick={() => step(-1)}>
          <ChevronLeftIcon />
        </IconButton>
        <IconButton label="Next month" onClick={() => step(1)}>
          <ChevronRightIcon />
        </IconButton>
      </header>

      <div className="calendar__grid" role="grid">
        {WEEKDAYS.map((day) => (
          <div className="calendar__weekday" key={day} role="columnheader" aria-label={day}>
            {day.slice(0, 1)}
          </div>
        ))}

        {cells.map((date) => {
          const iso = toISODate(date)
          const isFuture = iso > today
          const isToday = iso === today
          const segments = isFuture ? [] : segmentsFor(iso)
          const existed = segments.length
          const done = segments.filter((segment) => segment.state !== 'empty').length

          const classes = [
            'day',
            date.getMonth() !== month ? 'day--outside' : '',
            isFuture ? 'day--future' : '',
            isToday ? 'day--today' : '',
            iso === selected ? 'day--selected' : '',
            existed > 0 && done === existed ? 'day--full' : '',
            isToday && pulseToday ? 'day--pulse' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const summary = existed === 0 ? '' : `, ${done} of ${existed} continued`

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={classes}
              disabled={isFuture}
              aria-selected={iso === selected}
              aria-label={`${formatLongDay(iso)}${summary}`}
              onClick={() => onSelect(iso)}
            >
              <span>{date.getDate()}</span>
              <span className="day__track" aria-hidden="true">
                {segments.map((segment) => {
                  const focus =
                    focusStreakId === null
                      ? ''
                      : segment.streakId === focusStreakId
                        ? ' day__seg--focus'
                        : ' day__seg--dim'
                  return (
                    <span
                      key={segment.streakId}
                      className={`day__seg day__seg--${segment.state}${focus}`}
                    />
                  )
                })}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
