import { memo, type CSSProperties } from 'react'
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
 * A month grid, Monday first, drawn as a floor of pixel tiles over the
 * hearth.
 *
 * Each day carries one mark: a short track with a segment per streak that
 * existed that day. A segment burns ember-orange while its run is alive,
 * turns to ash once that run has ended, and stays an empty slot on a day
 * the streak was missed — so an ended run reads as a grey line that stops,
 * and the live run is the only thing on fire. Future days have no track
 * and can't be selected; there is nothing there yet.
 *
 * Days of the neighbouring months are dark tiles with dim numbers — still
 * there to keep the weeks whole, and still selectable when they're past,
 * but never mistaken for this month. Today wears a small pixel flame:
 * unlit until something is continued, burning after, with a few embers
 * rising from it once the day is secured. The selected day gets a
 * pixel-cornered frame, so the two are never confused.
 */
export const Calendar = memo(function Calendar({
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

      {/* Keyed by month, so a new month settles in rather than swapping in place. */}
      <div className="calendar__grid" role="grid" key={`${year}-${month}`}>
        {WEEKDAYS.map((day) => (
          <div className="calendar__weekday" key={day} role="columnheader" aria-label={day}>
            {day.slice(0, 1)}
          </div>
        ))}

        {cells.map((date, index) => {
          const iso = toISODate(date)
          const inMonth = date.getMonth() === month
          const isFuture = iso > today
          const isToday = iso === today
          const segments = isFuture ? [] : segmentsFor(iso)
          const existed = segments.length
          const done = segments.filter((segment) => segment.state !== 'empty').length
          const full = existed > 0 && done === existed
          // Today's fire: lit by the first continuation, secured by the last.
          const lit = isToday && done > 0

          const classes = [
            'day',
            inMonth ? 'day--in' : 'day--outside',
            isFuture ? 'day--future' : '',
            isToday ? 'day--today' : '',
            lit ? 'day--lit' : '',
            iso === selected ? 'day--selected' : '',
            full ? 'day--full' : '',
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
              style={{ '--row': Math.floor(index / 7) } as CSSProperties}
              disabled={isFuture}
              aria-selected={iso === selected}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${formatLongDay(iso)}${isToday ? ', today' : ''}${summary}`}
              onClick={() => onSelect(iso)}
            >
              <span className="day__num">{date.getDate()}</span>
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
              {isToday && <span className="day__flame" aria-hidden="true" />}
              {isToday && full && (
                // A handful of embers, drawn and moved by CSS alone.
                <span className="day__embers" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              )}
              {isToday && pulseToday && <span className="day__ring" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
    </section>
  )
})
