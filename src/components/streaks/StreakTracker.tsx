import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { PlusIcon } from '../ui/Icons'
import { ConfirmDialog, EmptyState, ErrorNotice, Loading } from '../ui/Feedback'
import { PromptDialog } from '../ui/PromptDialog'
import { Calendar } from './Calendar'
import { StreakCard } from './StreakCard'
import { formatDay, formatLongDay, today } from '../../lib/dates'
import { datesForStreak, progressAsOf } from '../../lib/streakMath'
import type { useStreakTracker } from '../../hooks/useStreakTracker'
import type { ISODate, Streak } from '../../data/types'

type Dialog =
  | { kind: 'new-streak' }
  | { kind: 'rename-streak'; streak: Streak }
  | { kind: 'delete-streak'; streak: Streak }
  | null

export function StreakTracker({ store }: { store: ReturnType<typeof useStreakTracker> }) {
  const [selected, setSelected] = useState<ISODate>(today())
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [dialog, setDialog] = useState<Dialog>(null)
  const close = () => setDialog(null)

  const { streaks, records, loading, loadError, retry } = store

  /** How many streaks were continued on each date, for the calendar dots. */
  const countsByDate = useMemo(() => {
    const counts = new Map<ISODate, number>()
    for (const record of records) {
      counts.set(record.entry_date, (counts.get(record.entry_date) ?? 0) + 1)
    }
    return counts
  }, [records])

  /** The record for each streak on the selected day, if there is one. */
  const recordsOnSelected = useMemo(() => {
    const map = new Map<string, (typeof records)[number]>()
    for (const record of records) {
      if (record.entry_date === selected) map.set(record.streak_id, record)
    }
    return map
  }, [records, selected])

  const datesByStreak = useMemo(() => {
    const map = new Map<string, Set<ISODate>>()
    for (const streak of streaks) map.set(streak.id, datesForStreak(records, streak.id))
    return map
  }, [streaks, records])

  const newStreakButton = (
    <Button variant="primary" onClick={() => setDialog({ kind: 'new-streak' })}>
      <PlusIcon />
      New streak
    </Button>
  )

  if (loading) return <Loading label="Loading your streaks…" />
  if (loadError) return <ErrorNotice message={loadError} onRetry={retry} />

  return (
    <>
      <div className="toolbar">
        <span className="toolbar__spacer" />
        <span className="desktop-action">{newStreakButton}</span>
      </div>

      <div className="streak-layout">
        <Calendar
          year={view.year}
          month={view.month}
          selected={selected}
          countsByDate={countsByDate}
          onSelect={setSelected}
          onMonthChange={(year, month) => setView({ year, month })}
        />

        <section className="day-panel" aria-label={`Streaks for ${formatLongDay(selected)}`}>
          <header className="day-panel__header">
            <h2 className="day-panel__date">{formatLongDay(selected)}</h2>
            <span className="day-panel__relative">{formatDay(selected)}</span>
          </header>

          {streaks.length === 0 ? (
            <EmptyState
              title="No streaks yet"
              text="Create a streak for something you want to keep up — pushups, reading, coding, anything."
              action={newStreakButton}
            />
          ) : (
            <div className="day-panel__list">
              {streaks.map((streak) => (
                <StreakCard
                  key={streak.id}
                  streak={streak}
                  record={recordsOnSelected.get(streak.id)}
                  progress={progressAsOf(datesByStreak.get(streak.id) ?? new Set(), selected)}
                  onContinue={(note) => store.continueStreak(streak.id, selected, note)}
                  onUndo={async () => {
                    const record = recordsOnSelected.get(streak.id)
                    if (record) await store.undoRecord(record.id)
                  }}
                  onRename={() => setDialog({ kind: 'rename-streak', streak })}
                  onDelete={() => setDialog({ kind: 'delete-streak', streak })}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="mobile-action">
        <Button variant="primary" block onClick={() => setDialog({ kind: 'new-streak' })}>
          <PlusIcon />
          New streak
        </Button>
      </div>

      {dialog?.kind === 'new-streak' && (
        <PromptDialog
          title={`New streak · ${formatDay(selected)}`}
          label="Streak name"
          placeholder="Pushups"
          submitLabel="Create"
          onSubmit={async (name) => {
            // Creating a streak on a date also starts it on that date.
            const created = await store.addStreak(name)
            if (created) await store.continueStreak(created.id, selected, '')
          }}
          onClose={close}
        />
      )}

      {dialog?.kind === 'rename-streak' && (
        <PromptDialog
          title="Rename streak"
          label="Streak name"
          initialValue={dialog.streak.name}
          submitLabel="Save"
          onSubmit={(name) => store.editStreak(dialog.streak.id, name)}
          onClose={close}
        />
      )}

      {dialog?.kind === 'delete-streak' && (
        <ConfirmDialog
          title={`Delete ${dialog.streak.name}?`}
          message="This removes the streak and every day recorded under it. This cannot be undone."
          confirmLabel="Delete streak"
          onConfirm={() => store.removeStreak(dialog.streak.id)}
          onCancel={close}
        />
      )}
    </>
  )
}
