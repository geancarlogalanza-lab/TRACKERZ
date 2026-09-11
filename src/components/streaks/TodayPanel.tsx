import { useEffect, useState } from 'react'
import { Button } from '../ui/Button'
import { PlusIcon } from '../ui/Icons'
import { EmptyState } from '../ui/Feedback'
import { StreakRow } from './StreakRow'
import type { TodayStanding } from '../../lib/streakMath'
import type { Streak, StreakRecord } from '../../data/types'

interface TodayPanelProps {
  streaks: Streak[]
  standings: Map<string, TodayStanding>
  recordsToday: Map<string, StreakRecord>
  /** The streak whose count should take a longer beat right now, if any. */
  celebrating: string | null
  /** The streak just continued: its row is the one that invites a note. */
  justContinued: string | null
  onContinue: (streak: Streak) => Promise<void>
  onUndo: (record: StreakRecord) => Promise<void>
  onSaveNote: (record: StreakRecord, note: string) => Promise<void>
  onNewStreak: () => void
  onRename: (streak: Streak) => void
  onDelete: (streak: Streak) => void
}

const ORDER = { needs: 0, restart: 1, done: 2 } as const

function sortIds(streaks: Streak[], standings: Map<string, TodayStanding>): string[] {
  return [...streaks]
    .sort((a, b) => {
      const sa = standings.get(a.id)?.state ?? 'restart'
      const sb = standings.get(b.id)?.state ?? 'restart'
      return ORDER[sa] - ORDER[sb] || a.created_at.localeCompare(b.created_at)
    })
    .map((streak) => streak.id)
}

/**
 * The answer to "what do I do today?" Always on screen. Rows that still need
 * doing come first and done rows sit at the bottom — but the order is fixed
 * for as long as the panel is open, so a row you just continued stays put
 * while its count rolls, instead of jumping away mid-reward. When nothing is
 * left the header says so, and the panel has nothing further to ask.
 */
export function TodayPanel({
  streaks,
  standings,
  recordsToday,
  celebrating,
  justContinued,
  onContinue,
  onUndo,
  onSaveNote,
  onNewStreak,
  onRename,
  onDelete,
}: TodayPanelProps) {
  const [order, setOrder] = useState<string[]>(() => sortIds(streaks, standings))

  // Re-sort only when streaks are added or removed, never when one changes state.
  const ids = streaks.map((streak) => streak.id).join('|')
  useEffect(() => {
    setOrder((current) => {
      const kept = current.filter((id) => streaks.some((streak) => streak.id === id))
      const added = streaks.filter((streak) => !kept.includes(streak.id)).map((s) => s.id)
      return kept.length === 0 ? sortIds(streaks, standings) : [...kept, ...added]
    })
    // `standings` is deliberately left out: state changes must not reorder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  const ordered = order
    .map((id) => streaks.find((streak) => streak.id === id))
    .filter((streak): streak is Streak => Boolean(streak))

  const total = streaks.length
  const secured = streaks.filter((streak) => standings.get(streak.id)?.state === 'done').length
  const allSecured = total > 0 && secured === total

  return (
    <section className="spanel spanel--today" aria-labelledby="today-heading">
      <header className="spanel__head">
        <h2 className="spanel__title" id="today-heading">
          Today
        </h2>
        {total > 0 && (
          <span
            key={allSecured ? 'secured' : 'progress'}
            className={`spanel__status${allSecured ? ' spanel__status--secured' : ''}`}
            aria-live="polite"
          >
            {allSecured ? 'Today is secured' : `${secured} of ${total} secured`}
          </span>
        )}
      </header>

      {total === 0 ? (
        <EmptyState
          title="No streaks yet"
          text="Start one for something you want to keep up — pushups, reading, coding, anything. Today counts as day one."
          action={
            <Button variant="primary" onClick={onNewStreak}>
              <PlusIcon />
              New streak
            </Button>
          }
        />
      ) : (
        <>
          <div className="spanel__rows">
            {ordered.map((streak) => {
              const standing = standings.get(streak.id) ?? { state: 'restart' as const, count: 0 }
              const record = recordsToday.get(streak.id)
              return (
                <StreakRow
                  key={streak.id}
                  streak={streak}
                  state={standing.state}
                  count={standing.count}
                  record={record}
                  mode="today"
                  celebrate={celebrating === streak.id}
                  inviteNote={justContinued === streak.id}
                  onContinue={() => onContinue(streak)}
                  onUndo={record ? () => onUndo(record) : undefined}
                  onSaveNote={record ? (note) => onSaveNote(record, note) : undefined}
                  onRename={() => onRename(streak)}
                  onDelete={() => onDelete(streak)}
                />
              )
            })}
          </div>

          <div className="spanel__foot desktop-action">
            <Button variant="ghost" size="sm" onClick={onNewStreak}>
              <PlusIcon size={14} />
              New streak
            </Button>
          </div>
        </>
      )}
    </section>
  )
}
