import { IconButton, Button } from '../ui/Button'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/Icons'
import { formatLongDay, monthName, toISODate, today } from '../../lib/dates'
import type { ISODate } from '../../data/types'

interface CalendarProps {
  year: number
  month: number
  selected: ISODate
  /** How many streaks were continued on each date. */
  countsByDate: Map<ISODate, number>
  onSelect: (date: ISODate) => void
  onMonthChange: (year: number, month: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_DOTS = 3

/** A month grid, Monday first, with a dot per streak continued that day. */
export function Calendar({
  year,
  month,
  selected,
  countsByDate,
  onSelect,
  onMonthChange,
}: CalendarProps) {
  const todayISO = today()

  const firstOfMonth = new Date(year, month, 1)
  // getDay() is Sunday-based; shift so Monday starts the week.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7

  const cells: Date[] = []
  const cursor = new Date(year, month, 1 - leadingBlanks)
  // Six rows always, so the grid does not jump height between months.
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
    onSelect(todayISO)
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
          const count = countsByDate.get(iso) ?? 0
          const classes = [
            'day',
            date.getMonth() !== month ? 'day--outside' : '',
            iso === todayISO ? 'day--today' : '',
            iso === selected ? 'day--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={classes}
              aria-selected={iso === selected}
              aria-label={`${formatLongDay(iso)}${count > 0 ? `, ${count} continued` : ''}`}
              onClick={() => onSelect(iso)}
            >
              <span>{date.getDate()}</span>
              <span className="day__dots" aria-hidden="true">
                {Array.from({ length: Math.min(count, MAX_DOTS) }, (_, index) => (
                  <span className="day__dot" key={index} />
                ))}
                {count > MAX_DOTS && <span className="day__more">+{count - MAX_DOTS}</span>}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
