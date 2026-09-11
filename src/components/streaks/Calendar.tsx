import { IconButton, Button } from '../ui/Button'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/Icons'
import { formatLongDay, monthName, toISODate } from '../../lib/dates'
import type { ISODate } from '../../data/types'

export interface DayStats {
  /** Streaks that existed on this day. Sets the length of the track. */
  existed: number
  /** Streaks continued on this day. Sets the fill. */
  done: number
}

interface CalendarProps {
  year: number
  month: number
  today: ISODate
  selected: ISODate
  statsFor: (day: ISODate) => DayStats
  /** Briefly ring today's cell — the last streak was just secured. */
  pulseToday: boolean
  onSelect: (date: ISODate) => void
  onMonthChange: (year: number, month: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * A month grid, Monday first. Each day carries one mark: a short track whose
 * length is how many streaks existed that day and whose fill is how many
 * were continued. A missed day is an empty track — never a colour. Future
 * days have no track and can't be selected; there is nothing there yet.
 */
export function Calendar({
  year,
  month,
  today,
  selected,
  statsFor,
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
    <section className="calendar" aria-label="Streak calendar">
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
          const { existed, done } = isFuture ? { existed: 0, done: 0 } : statsFor(iso)
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

          const summary =
            existed === 0 ? '' : `, ${done} of ${existed} continued`

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
                {Array.from({ length: existed }, (_, index) => (
                  <span
                    className={`day__seg${index < done ? ' day__seg--on' : ''}`}
                    key={index}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
