import { useCallback, useMemo, useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { PlusIcon } from '../ui/Icons'
import { ConfirmDialog, ErrorNotice, Loading } from '../ui/Feedback'
import { PromptDialog } from '../ui/PromptDialog'
import { Calendar, type DayStats } from './Calendar'
import { DayDetails } from './DayDetails'
import { TodayPanel } from './TodayPanel'
import { today as todayISO } from '../../lib/dates'
import { datesForStreak, firstDay, isMilestone, standingOn } from '../../lib/streakMath'
import type { useStreakTracker } from '../../hooks/useStreakTracker'
import type { ISODate, Streak, StreakRecord } from '../../data/types'

type Dialog =
  | { kind: 'new-streak' }
  | { kind: 'rename-streak'; streak: Streak }
  | { kind: 'delete-streak'; streak: Streak }
  | null

/**
 * Four zones with a strict division of labour: the calendar says how
 * consistent the month was, the Today panel says what is still to do, a
 * past day's details appear only when asked for, and the row is the unit
 * that carries a streak's state. The one event that matters — continuing —
 * shows in exactly two places at once: the row, and today's cell.
 */
export function StreakTracker({ store }: { store: ReturnType<typeof useStreakTracker> }) {
  const today = todayISO()
  const [selected, setSelected] = useState<ISODate>(today)
  const [view, setView] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [dialog, setDialog] = useState<Dialog>(null)
  const [celebrating, setCelebrating] = useState<string | null>(null)
  const [justContinued, setJustContinued] = useState<string | null>(null)
  const [pulse, setPulse] = useState(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const close = () => setDialog(null)

  const { streaks, records, loading, loadError, retry } = store

  const datesByStreak = useMemo(() => {
    const map = new Map<string, Set<ISODate>>()
    for (const streak of streaks) map.set(streak.id, datesForStreak(records, streak.id))
    return map
  }, [streaks, records])

  const firstDayByStreak = useMemo(() => {
    const map = new Map<string, ISODate>()
    for (const streak of streaks) {
      map.set(streak.id, firstDay(streak, datesByStreak.get(streak.id) ?? new Set()))
    }
    return map
  }, [streaks, datesByStreak])

  const standings = useMemo(() => {
    const map = new Map<string, ReturnType<typeof standingOn>>()
    for (const streak of streaks) {
      map.set(streak.id, standingOn(datesByStreak.get(streak.id) ?? new Set(), today))
    }
    return map
  }, [streaks, datesByStreak, today])

  /** Records keyed by streak for one day, so a row can find its own. */
  const recordsOn = useCallback(
    (day: ISODate) => {
      const map = new Map<string, StreakRecord>()
      for (const record of records) {
        if (record.entry_date === day) map.set(record.streak_id, record)
      }
      return map
    },
    [records],
  )
  const recordsToday = useMemo(() => recordsOn(today), [recordsOn, today])
  const recordsOnSelected = useMemo(() => recordsOn(selected), [recordsOn, selected])

  /** The calendar's one number per day: how many streaks existed, how many were continued. */
  const statsFor = useCallback(
    (day: ISODate): DayStats => {
      let existed = 0
      let done = 0
      for (const streak of streaks) {
        if ((firstDayByStreak.get(streak.id) ?? day) > day) continue
        existed += 1
        if (datesByStreak.get(streak.id)?.has(day)) done += 1
      }
      return { existed, done }
    },
    [streaks, firstDayByStreak, datesByStreak],
  )

  const later = (fn: () => void, ms: number) => {
    timers.current.push(setTimeout(fn, ms))
  }

  const handleContinue = async (streak: Streak) => {
    const standing = standings.get(streak.id)
    const nextCount = standing?.state === 'needs' ? standing.count + 1 : 1
    const stillOwed = streaks.filter((item) => standings.get(item.id)?.state !== 'done').length

    await store.continueStreak(streak.id)
    setJustContinued(streak.id)

    if (isMilestone(nextCount)) {
      setCelebrating(streak.id)
      later(() => setCelebrating(null), 900)
    }
    // That was the last one: today is secured, and the cell gets one ring.
    if (stillOwed === 1) {
      setPulse(true)
      later(() => setPulse(false), 1200)
    }
  }

  const selectDay = (day: ISODate) => {
    if (day > today) return
    setSelected(day)
  }

  if (loading) return <Loading label="Loading your streaks…" />
  if (loadError) return <ErrorNotice message={loadError} onRetry={retry} />

  const viewingPast = selected !== today

  return (
    <>
      <div className="streak-layout">
        <div className="streak-layout__today">
          <TodayPanel
            streaks={streaks}
            standings={standings}
            recordsToday={recordsToday}
            celebrating={celebrating}
            justContinued={justContinued}
            onContinue={handleContinue}
            onUndo={store.undoToday}
            onSaveNote={store.saveNote}
            onNewStreak={() => setDialog({ kind: 'new-streak' })}
            onRename={(streak) => setDialog({ kind: 'rename-streak', streak })}
            onDelete={(streak) => setDialog({ kind: 'delete-streak', streak })}
          />
        </div>

        <div className="streak-layout__calendar">
          <Calendar
            year={view.year}
            month={view.month}
            today={today}
            selected={selected}
            statsFor={statsFor}
            pulseToday={pulse}
            onSelect={selectDay}
            onMonthChange={(year, month) => setView({ year, month })}
          />
        </div>

        {viewingPast && (
          <div className="streak-layout__details">
            <DayDetails
              day={selected}
              streaks={streaks}
              datesByStreak={datesByStreak}
              firstDayByStreak={firstDayByStreak}
              recordsOnDay={recordsOnSelected}
              onSaveNote={store.saveNote}
              onClose={() => setSelected(today)}
            />
          </div>
        )}
      </div>

      {streaks.length > 0 && (
        <div className="mobile-action">
          <Button variant="primary" block onClick={() => setDialog({ kind: 'new-streak' })}>
            <PlusIcon />
            New streak
          </Button>
        </div>
      )}

      {dialog?.kind === 'new-streak' && (
        <PromptDialog
          title="New streak"
          label="Streak name"
          placeholder="Pushups"
          submitLabel="Start today"
          onSubmit={async (name) => {
            // A new streak begins today. If it's the only one, today is secured.
            const stillOwed = streaks.filter((item) => standings.get(item.id)?.state !== 'done').length
            await store.addStreak(name)
            if (stillOwed === 0) {
              setPulse(true)
              later(() => setPulse(false), 1200)
            }
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
