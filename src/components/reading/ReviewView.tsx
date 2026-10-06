import { useId, useState } from 'react'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/Feedback'
import { FormError } from '../ui/Field'
import { ember } from '../../lib/ember'
import { toMessage } from '../../lib/errors'
import { FLAG_LABEL, ORIGIN_LABEL, proposalsOf } from '../../lib/reading'
import { plural } from '../../lib/plural'
import type { Capture, LessonDecision, ProposedLesson } from '../../data/types'
import type { KeptLesson } from '../../data/readingRepository'
import type { ReadingStore } from '../../hooks/useReading'

interface ReviewViewProps {
  store: ReadingStore
  onError: (message: string) => void
}

/**
 * Nothing reaches the library without you. Each capture's proposals are
 * checked one by one, then saved together. Oldest first, so notes don't
 * wait forever behind new ones.
 */
export function ReviewView({ store }: ReviewViewProps) {
  const waiting = store.captures
    .filter((item) => item.status === 'needs_review')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  if (waiting.length === 0) {
    return (
      <EmptyState
        title="Nothing to review"
        text="Notes you capture are processed by Claude and land here, so you can check every lesson before it reaches your library."
      />
    )
  }

  return (
    <div className="review-list">
      {waiting.map((capture) => (
        <ReviewCard key={capture.id} capture={capture} store={store} />
      ))}
    </div>
  )
}

type Choice = LessonDecision | 'skipped'

interface Draft {
  choice: Choice | null
  text: string
  editing: boolean
}

const CHOICE_LABEL: Record<Choice, string> = {
  kept: 'Kept',
  edited: 'Kept, with your edit',
  original: 'Kept in the original words',
  kept_anyway: 'Kept despite the flag',
  skipped: 'Left out',
}

function ReviewCard({ capture, store }: { capture: Capture; store: ReadingStore }) {
  const proposals = proposalsOf(capture)
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    proposals.map((proposal) => ({ choice: null, text: proposal.lesson, editing: false })),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const update = (index: number, next: Partial<Draft>) =>
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...next } : draft)))

  const decided = drafts.every((draft) => draft.choice !== null)
  const kept: KeptLesson[] = drafts.flatMap((draft, index) =>
    draft.choice && draft.choice !== 'skipped'
      ? [{ proposalIndex: index, proposal: proposals[index], text: draft.text, decision: draft.choice }]
      : [],
  )

  const save = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    setBusy(true)
    setError(null)
    try {
      await store.saveReview(capture, kept)
      // Lessons joining the library is the moment this whole loop exists for.
      if (kept.length > 0 && button.isConnected) ember(button, 'kindle', { anchor: 0.85 })
    } catch (caught) {
      setError(toMessage(caught, 'Could not save these lessons.'))
      setBusy(false)
    }
  }

  return (
    <article className="review-card" aria-labelledby={`review-${capture.id}`}>
      <header className="review-card__head">
        <h2 className="review-card__book" id={`review-${capture.id}`}>
          {capture.book_title}
        </h2>
        <p className="review-card__meta">
          {capture.book_author}
          {capture.location && <> · {capture.location}</>}
        </p>
      </header>

      <details className="review-card__notes">
        <summary>Your notes</summary>
        <p className="review-card__notes-text">{capture.raw_notes}</p>
        {capture.source_passage && (
          <blockquote className="review-card__passage">{capture.source_passage}</blockquote>
        )}
      </details>

      {proposals.length === 0 ? (
        <p className="review-card__none">
          Claude found nothing in these notes to keep as a lesson. You can finish the review, or
          capture the notes again with more of your own thinking.
        </p>
      ) : (
        <ol className="proposals">
          {proposals.map((proposal, index) => (
            <ProposalItem
              key={index}
              proposal={proposal}
              draft={drafts[index]}
              onChange={(next) => update(index, next)}
            />
          ))}
        </ol>
      )}

      <footer className="review-card__foot">
        <FormError message={error} />
        <p className="review-card__progress">
          {decided
            ? kept.length > 0
              ? `${plural(kept.length, 'lesson')} ready for your library.`
              : 'Nothing kept from these notes.'
            : `${plural(drafts.filter((draft) => draft.choice === null).length, 'proposal')} still to decide.`}
        </p>
        <Button variant="primary" onClick={save} disabled={!decided || busy}>
          {busy ? 'Saving…' : !decided || kept.length > 0 ? 'Save to library' : 'Finish review'}
        </Button>
      </footer>
    </article>
  )
}

function ProposalItem({
  proposal,
  draft,
  onChange,
}: {
  proposal: ProposedLesson
  draft: Draft
  onChange: (next: Partial<Draft>) => void
}) {
  const flagged = proposal.flags.length > 0
  const [editText, setEditText] = useState(draft.text)
  const editId = useId()

  const shownText = draft.choice === 'original' ? proposal.basis : draft.text

  return (
    <li className={`proposal${draft.choice === 'skipped' ? ' proposal--skipped' : ''}`}>
      {draft.editing ? (
        <div className="proposal__edit">
          <label className="sr-only" htmlFor={editId}>
            Edit lesson
          </label>
          <textarea
            id={editId}
            className="textarea"
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
            maxLength={2000}
            autoFocus
          />
          <div className="proposal__actions">
            <Button
              size="sm"
              variant="primary"
              disabled={!editText.trim()}
              onClick={() => onChange({ choice: 'edited', text: editText.trim(), editing: false })}
            >
              Keep this version
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange({ editing: false })}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="proposal__lesson">{shownText}</p>
      )}

      <p className="proposal__origin">{ORIGIN_LABEL[proposal.origin]}</p>

      {proposal.interpretation && (
        <p className="proposal__detail">
          <span className="proposal__label">Your take</span> {proposal.interpretation}
        </p>
      )}
      {draft.choice !== 'original' && (
        <p className="proposal__detail">
          <span className="proposal__label">Based on</span> “{proposal.basis}”
        </p>
      )}

      {flagged && (
        <ul className="proposal__flags">
          {proposal.flags.map((flag, index) => (
            <li key={index} className="proposal__flag">
              <span className="proposal__flag-type">{FLAG_LABEL[flag.type]}</span> {flag.note}
            </li>
          ))}
        </ul>
      )}

      {!draft.editing &&
        (draft.choice === null ? (
          <div className="proposal__actions">
            <Button
              size="sm"
              variant="primary"
              onClick={() => onChange({ choice: flagged ? 'kept_anyway' : 'kept', text: proposal.lesson })}
            >
              {flagged ? 'Keep anyway' : 'Keep'}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditText(draft.text)
                onChange({ editing: true })
              }}
            >
              Edit
            </Button>
            <Button size="sm" onClick={() => onChange({ choice: 'original', text: proposal.basis })}>
              Use original
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange({ choice: 'skipped' })}>
              Not this one
            </Button>
          </div>
        ) : (
          <div className="proposal__decided">
            <span className="proposal__choice">{CHOICE_LABEL[draft.choice]}</span>
            <button
              type="button"
              className="proposal__change"
              onClick={() => onChange({ choice: null, text: proposal.lesson })}
            >
              Change
            </button>
          </div>
        ))}
    </li>
  )
}
