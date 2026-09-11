import { IconButton } from '../ui/Button'
import { CloseIcon } from '../ui/Icons'
import { StreakRow } from './StreakRow'
import { formatDay, formatLongDay } from '../../lib/dates'
import { runEndingOn } from '../../lib/streakMath'
import type { ISODate, Streak, StreakRecord } from '../../data/types'

interface DayDetailsProps {
  day: ISODate
  streaks: Streak[]
  datesByStreak: Map<string, Set<ISODate>>
  firstDayByStreak: Map<string, ISODate>
  recordsOnDay: Map<string, StreakRecord>
  onSaveNote: (record: StreakRecord, note: string) => Promise<void>
  onClose: () => void
}

/**
 * What happened on a past day. Read-only for continuation — a past record is
 * final, which is what keeps the count honest — but a note can still be
 * edited, because a note never affects the count.
 */
export function DayDetails({
  day,
  streaks,
  datesByStreak,
  firstDayByStreak,
  recordsOnDay,
  onSaveNote,
  onClose,
}: DayDetailsProps) {
  // Only streaks that existed on this day; earlier days aren't "missed".
  const existed = streaks.filter((streak) => (firstDayByStreak.get(streak.id) ?? day) <= day)

  return (
    <section className="spanel spanel--details" aria-labelledby="details-heading">
      <header className="spanel__head">
        <h2 className="spanel__title" id="details-heading">
          {formatLongDay(day)}
        </h2>
        <span className="spanel__status">{formatDay(day)}</span>
        <IconButton label="Back to today" onClick={onClose} className="spanel__close">
          <CloseIcon />
        </IconButton>
      </header>

      {existed.length === 0 ? (
        <p className="spanel__empty">No streaks yet on this day.</p>
      ) : (
        <div className="spanel__rows" key={day}>
          {existed.map((streak) => {
            const dates = datesByStreak.get(streak.id) ?? new Set<ISODate>()
            const record = recordsOnDay.get(streak.id)
            const continued = dates.has(day)
            return (
              <StreakRow
                key={streak.id}
                streak={streak}
                state={continued ? 'done' : 'missed'}
                count={continued ? runEndingOn(dates, day) : 0}
                record={record}
                mode="history"
                onSaveNote={record ? (note) => onSaveNote(record, note) : undefined}
              />
            )
          })}
        </div>
      )}
    </section>
  )
}
