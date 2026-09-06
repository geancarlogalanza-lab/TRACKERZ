import { useState } from 'react'
import { Button } from '../ui/Button'
import { Menu } from '../ui/Menu'
import { toMessage } from '../../lib/errors'
import type { StreakProgress } from '../../lib/streakMath'
import type { Streak, StreakRecord } from '../../data/types'

interface StreakCardProps {
  streak: Streak
  /** The record for the selected date, if the streak was continued that day. */
  record?: StreakRecord
  progress: StreakProgress
  onContinue: (note: string) => Promise<void>
  onUndo: () => Promise<void>
  onRename: () => void
  onDelete: () => void
}

function flameLabel({ length, status }: StreakProgress) {
  if (status === 'inactive') return 'No streak yet'
  return `${length} ${length === 1 ? 'day' : 'days'}`
}

/**
 * One streak on the selected date. Continuing is a single action, and what
 * gets typed into the note is stored exactly as written — the note never
 * affects whether the day counts.
 */
export function StreakCard({
  streak,
  record,
  progress,
  onContinue,
  onUndo,
  onRename,
  onDelete,
}: StreakCardProps) {
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(record?.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (caught) {
      setError(toMessage(caught, fallback))
      return false
    } finally {
      setBusy(false)
    }
  }

  const done = Boolean(record)

  return (
    <article className={`streak-card${done ? ' streak-card--done' : ''}`}>
      <div className="streak-card__top">
        <h3 className="streak-card__name" title={streak.name}>
          {streak.name}
        </h3>
        <span
          className={`flame${progress.status === 'inactive' ? ' flame--none' : ''}`}
          title={
            progress.status === 'awaiting'
              ? 'Run so far, not counting this day yet'
              : 'Consecutive days continued'
          }
        >
          {progress.status !== 'inactive' && <span aria-hidden="true">🔥</span>}
          {flameLabel(progress)}
        </span>
        <Menu
          label={`Actions for ${streak.name}`}
          items={[
            { label: 'Rename streak', onSelect: onRename },
            { label: 'Delete streak', onSelect: onDelete, danger: true },
          ]}
        />
      </div>

      {error && (
        <p className="form-error" role="alert" style={{ marginTop: 10, marginBottom: 0 }}>
          {error}
        </p>
      )}

      {done && !editing && (
        <>
          <p className={`streak-card__note${record?.note ? '' : ' streak-card__note--empty'}`}>
            {record?.note || 'Continued, no note'}
          </p>
          <div className="streak-card__actions">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                setDraft(record?.note ?? '')
                setEditing(true)
              }}
            >
              Edit note
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => run(onUndo, 'Could not undo that.')}
            >
              Undo
            </Button>
          </div>
        </>
      )}

      {done && editing && (
        <form
          className="streak-card__form"
          onSubmit={async (event) => {
            event.preventDefault()
            const saved = await run(() => onContinue(draft), 'Could not save that note.')
            if (saved) setEditing(false)
          }}
        >
          <input
            className="input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            aria-label={`Record for ${streak.name}`}
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={busy}>
            Save
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      )}

      {!done && (
        <form
          className="streak-card__form"
          onSubmit={async (event) => {
            event.preventDefault()
            const saved = await run(() => onContinue(note), 'Could not continue that streak.')
            if (saved) setNote('')
          }}
        >
          <input
            className="input"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What you did"
            aria-label={`Record for ${streak.name}`}
          />
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </form>
      )}
    </article>
  )
}
