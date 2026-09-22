import { IconButton, Button } from '../ui/Button'
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/Icons'
import { formatLongDay, monthName, toISODate } from '../../lib/dates'
import { dayEntries, describeDay, type DayTasks } from '../../lib/taskCalendar'
import type { ISODate, Subject } from '../../data/types'

interface TaskCalendarProps {
  year: number
  month: number
  today: ISODate
  selected: ISODate
  byDay: Map<ISODate, DayTasks>
  subjectsById: Map<string, Subject>
  onSelect: (date: ISODate) => void
  onMonthChange: (year: number, month: number) => void
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
/** Rows of text a desktop cell previews before it defers to the day panel. */
const PREVIEW_ROWS = 3
/** Marks a phone cell shows before it defers to the day panel. */
const PREVIEW_MARKS = 4

/**
 * A month of the Pending tracker's tasks. The cell is a preview, not a list:
 * it shows the first few items and hands the rest to the day panel, so a busy
 * week stays scannable.
 *
 * Planned work and deadlines are told apart by shape, never by colour: a
 * circle plans, a triangle is due, and a deadline row is filled and bold on
 * top of that. The same two shapes are used at every width and named once in
 * the legend. Subject colour rides along as an identifier, never the only cue.
 */
export function TaskCalendar({
  year,
  month,
  today,
  selected,
  byDay,
  subjectsById,
  onSelect,
  onMonthChange,
}: TaskCalendarProps) {
  const firstOfMonth = new Date(year, month, 1)
  // getDay() is Sunday-based; shift so Monday starts the week.
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Only the weeks this month actually needs — four to six, never a trailing
  // empty row.
  const weeks = Math.ceil((leadingBlanks + daysInMonth) / 7)

  const cells: Date[] = []
  const cursor = new Date(year, month, 1 - leadingBlanks)
  for (let index = 0; index < weeks * 7; index += 1) {
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
    <section className="tcal" aria-label="Task calendar">
      <header className="tcal__header">
        <h2 className="tcal__month" aria-live="polite">
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

      <div className="tcal__grid" role="grid">
        {WEEKDAYS.map((day) => (
          <div className="tcal__weekday" key={day} role="columnheader" aria-label={day}>
            <span className="tcal__weekday-long">{day}</span>
            <span className="tcal__weekday-short">{day.slice(0, 1)}</span>
          </div>
        ))}

        {cells.map((date) => {
          const iso = toISODate(date)
          const day = byDay.get(iso)
          const entries = dayEntries(day)
          const outside = date.getMonth() !== month

          const classes = [
            'cday',
            outside ? 'cday--outside' : '',
            iso === today ? 'cday--today' : '',
            iso === selected ? 'cday--selected' : '',
          ]
            .filter(Boolean)
            .join(' ')

          const hiddenRows = entries.length - PREVIEW_ROWS
          const hiddenMarks = entries.length - PREVIEW_MARKS

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              className={classes}
              aria-selected={iso === selected}
              aria-label={`${formatLongDay(iso)}${describeDay(day)}`}
              onClick={() => onSelect(iso)}
            >
              <span className="cday__num">{date.getDate()}</span>

              {/* Phones: silhouettes only — a circle plans, a triangle is due. */}
              {entries.length > 0 && (
                <span className="cday__marks" aria-hidden="true">
                  {entries.slice(0, PREVIEW_MARKS).map((entry, index) => (
                    <span
                      key={`${entry.task.id}-${entry.kind}-${index}`}
                      className={`cmark cmark--${entry.kind}`}
                      style={{ color: subjectsById.get(entry.task.subject_id)?.color }}
                    />
                  ))}
                  {hiddenMarks > 0 && <span className="cday__more-mark">+{hiddenMarks}</span>}
                </span>
              )}

              {/* Wider screens: the titles themselves. */}
              {entries.length > 0 && (
                <span className="cday__list" aria-hidden="true">
                  {entries.slice(0, PREVIEW_ROWS).map((entry, index) => (
                    <span
                      key={`${entry.task.id}-${entry.kind}-${index}`}
                      className={`centry centry--${entry.kind}`}
                    >
                      <span
                        className={`cmark cmark--${entry.kind}`}
                        style={{ color: subjectsById.get(entry.task.subject_id)?.color }}
                      />
                      <span className="centry__title">{entry.task.title}</span>
                    </span>
                  ))}
                  {hiddenRows > 0 && <span className="cday__more">+{hiddenRows} more</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Names the two shapes once, so neither cell nor panel has to. */}
      <p className="tcal__legend">
        <span>
          <i className="cmark cmark--planned" /> Planned
        </span>
        <span>
          <i className="cmark cmark--due" /> Due
        </span>
      </p>
    </section>
  )
}
