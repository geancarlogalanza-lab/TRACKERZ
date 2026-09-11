import { useState } from 'react'
import { Button } from '../ui/Button'
import { CheckIcon } from '../ui/Icons'
import { Menu } from '../ui/Menu'
import { RollingNumber } from './RollingNumber'
import { toMessage } from '../../lib/errors'
import type { Streak, StreakRecord } from '../../data/types'

export type RowState =
  /** Continued on this day. */
  | 'done'
  /** Owed today: the run reaches yesterday. */
  | 'needs'
  /** No run leading in. Start again, or start for the first time. */
  | 'restart'
  /** A past day the streak existed on but was not continued. */
  | 'missed'

interface StreakRowProps {
  streak: Streak
  state: RowState
  /** The run to show: live for done/needs, the previous run for restart. */
  count: number
  record?: StreakRecord
  /** Today's rows carry actions; history rows are read-only apart from the note. */
  mode: 'today' | 'history'
  /** Give the count a longer beat — a milestone was just reached. */
  celebrate?: boolean
  /** Open the note field unprompted — this row was just continued. */
  inviteNote?: boolean
  onContinue?: () => Promise<void>
  onUndo?: () => Promise<void>
  onSaveNote?: (note: string) => Promise<void>
  onRename?: () => void
  onDelete?: () => void
}

/**
 * One streak, on one day. The mark and the action change together; the
 * count changes only when the person acts. Continuing is a single tap, and
 * the note field appears afterwards — a note is a memory, not a gate.
 */
export function StreakRow({
  streak,
  state,
  count,
  record,
  mode,
  celebrate = false,
  inviteNote = false,
  onContinue,
  onUndo,
  onSaveNote,
  onRename,
  onDelete,
}: StreakRowProps) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
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

  const startEditing = () => {
    setDraft(record?.note ?? '')
    setEditing(true)
  }

  const saveNote = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!onSaveNote) return
    const saved = await run(() => onSaveNote(draft), 'Could not save that note.')
    if (saved) {
      setEditing(false)
      setDraft('')
    }
  }

  const isDone = state === 'done'
  const hasNote = Boolean(record?.note)
  // The field opens on its own only for the row just continued, so the panel
  // never turns into a stack of forms. Everyone else gets a quiet "Add".
  const showField = isDone && onSaveNote && (editing || (inviteNote && !hasNote))
  const actionLabel = count > 0 ? 'Start again' : 'Start'

  return (
    <div className={`srow srow--${state}${celebrate ? ' srow--celebrate' : ''}`}>
      <span className={`srow__mark srow__mark--${state}`} aria-hidden="true">
        <CheckIcon size={12} />
      </span>

      <div className="srow__name" title={streak.name}>
        {streak.name}
      </div>

      <div className="srow__side">
        {state === 'missed' ? (
          <span className="srow__quiet">Not continued</span>
        ) : (
          count > 0 && (
            <span className={`srow__count${state === 'restart' ? ' srow__count--last' : ''}`}>
              {state === 'restart' && <span className="srow__count-label">Last streak</span>}
              <RollingNumber value={count} long={celebrate} />
              <span className="srow__unit">{count === 1 ? 'day' : 'days'}</span>
            </span>
          )
        )}

        {mode === 'today' && state === 'needs' && onContinue && (
          <Button
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => run(onContinue, 'Could not continue that streak.')}
          >
            Continue
          </Button>
        )}

        {mode === 'today' && state === 'restart' && onContinue && (
          <Button size="sm" disabled={busy} onClick={() => run(onContinue, 'Could not start that streak.')}>
            {actionLabel}
          </Button>
        )}

        {mode === 'today' && state === 'done' && onUndo && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(onUndo, 'Could not undo that.')}>
            Undo
          </Button>
        )}

        {mode === 'today' && onRename && onDelete && (
          <Menu
            label={`Actions for ${streak.name}`}
            items={[
              { label: 'Rename streak', onSelect: onRename },
              { label: 'Delete streak', onSelect: onDelete, danger: true },
            ]}
          />
        )}
      </div>

      {error && (
        <p className="srow__error" role="alert">
          {error}
        </p>
      )}

      {isDone && (
        <div className="srow__note">
          {showField ? (
            <form className="srow__note-form" onSubmit={saveNote}>
              <input
                className="input"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={hasNote ? '' : 'Add a note'}
                aria-label={`Note for ${streak.name}`}
                disabled={busy}
              />
              <Button type="submit" size="sm" disabled={busy || (!draft.trim() && !hasNote)}>
                Save
              </Button>
              {editing && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </form>
          ) : (
            <div className="srow__note-view">
              <span className={`srow__note-text${hasNote ? '' : ' srow__note-text--empty'}`}>
                {record?.note || 'No note'}
              </span>
              {onSaveNote && (
                <button type="button" className="srow__note-edit" onClick={startEditing}>
                  {hasNote ? 'Edit' : 'Add'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
