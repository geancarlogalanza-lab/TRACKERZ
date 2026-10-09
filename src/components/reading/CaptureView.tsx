import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Feedback'
import { ClaudeHandoff } from './ClaudeHandoff'
import { Field, FormError } from '../ui/Field'
import { Menu } from '../ui/Menu'
import { aimBurst } from '../../lib/ember'
import { AUTO_PROCESS, booksOf, isStale } from '../../lib/reading'
import { toMessage } from '../../lib/errors'
import type { Capture } from '../../data/types'
import type { ReadingStore } from '../../hooks/useReading'

interface CaptureViewProps {
  store: ReadingStore
  onOpenReview: () => void
  onError: (message: string) => void
}

const NOTES_LIMIT = 20000

/**
 * Write down what you read and what you made of it; Claude proposes the
 * lessons. Book and author stay filled after saving, since the next note
 * is usually from the same book.
 */
export function CaptureView({ store, onOpenReview, onError }: CaptureViewProps) {
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [notes, setNotes] = useState('')
  const [passage, setPassage] = useState('')
  const [location, setLocation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState<Capture | null>(null)
  // The capture being taken through a claude.ai chat by hand.
  const [handoff, setHandoff] = useState<Capture | null>(null)

  // Books you've already used, so the same book is spelled the same way.
  const books = useMemo(
    () =>
      booksOf([
        ...store.lessons.map((lesson) => ({
          title: lesson.captures?.book_title ?? '',
          author: lesson.captures?.book_author ?? '',
        })),
        ...store.captures.map((capture) => ({ title: capture.book_title, author: capture.book_author })),
      ]).filter((book) => book.title),
    [store.lessons, store.captures],
  )

  const pickTitle = (value: string) => {
    setTitle(value)
    const known = books.find((book) => book.title.toLowerCase() === value.trim().toLowerCase())
    if (known && !author.trim()) setAuthor(known.author)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    if (!title.trim() || !author.trim()) return setError('Add the book and its author.')
    if (!notes.trim()) return setError('Write your notes first.')

    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const pop = submitter ? aimBurst(submitter) : null
    setBusy(true)
    try {
      const created = await store.addCapture({
        book_title: title,
        book_author: author,
        raw_notes: notes,
        source_passage: passage,
        location,
      })
      pop?.('kindle')
      setNotes('')
      setPassage('')
      setLocation('')
      if (!AUTO_PROCESS) setHandoff(created)
    } catch (caught) {
      setError(toMessage(caught, 'Could not save those notes.'))
    } finally {
      setBusy(false)
    }
  }

  const inProgress = store.captures.filter((item) => item.status !== 'reviewed')

  return (
    <div className="reading-capture">
      <form className="reading-form" onSubmit={submit} noValidate>
        <h2 className="reading-form__title">New capture</h2>
        <FormError message={error} />

        <div className="reading-pair">
          <Field label="Book">
            {(id) => (
              <input
                id={id}
                className="input"
                value={title}
                onChange={(event) => pickTitle(event.target.value)}
                list="reading-books"
                maxLength={200}
                autoComplete="off"
                required
              />
            )}
          </Field>
          <Field label="Author">
            {(id) => (
              <input
                id={id}
                className="input"
                value={author}
                onChange={(event) => setAuthor(event.target.value)}
                maxLength={200}
                autoComplete="off"
                required
              />
            )}
          </Field>
        </div>
        <datalist id="reading-books">
          {books.map((book) => (
            <option key={book.key} value={book.title} />
          ))}
        </datalist>

        <Field label="Your notes">
          {(id) => (
            <textarea
              id={id}
              className="textarea reading-form__notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={NOTES_LIMIT}
              placeholder="What stood out, what you think about it, where you disagree, how it applies to you."
              required
            />
          )}
        </Field>

        <Field label="Passage from the book" hint="optional">
          {(id) => (
            <textarea
              id={id}
              className="textarea"
              value={passage}
              onChange={(event) => setPassage(event.target.value)}
              maxLength={NOTES_LIMIT}
              placeholder="The author's exact words, if a passage prompted these notes."
            />
          )}
        </Field>

        <Field label="Page or location" hint="optional">
          {(id) => (
            <input
              id={id}
              className="input reading-form__location"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              maxLength={80}
              placeholder="p. 42, Loc 1234, ch. 3"
            />
          )}
        </Field>

        <div className="reading-form__foot">
          <p className="reading-form__hint">
            {AUTO_PROCESS
              ? 'Claude proposes lessons from your notes. You decide what to keep.'
              : "Next, you'll take your notes to Claude and bring its lessons back to review."}
          </p>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : AUTO_PROCESS ? 'Process notes' : 'Save notes'}
          </Button>
        </div>
      </form>

      {inProgress.length > 0 && (
        <section aria-labelledby="in-progress-heading">
          <h2 className="section-title" id="in-progress-heading">
            In progress
          </h2>
          <div className="reading-queue">
            {inProgress.map((capture) => (
              <QueueRow
                key={capture.id}
                capture={capture}
                onOpenReview={onOpenReview}
                onContinue={() => setHandoff(capture)}
                onRetry={() =>
                  AUTO_PROCESS
                    ? store.process(capture).catch((caught) => onError(caught.message))
                    : setHandoff(capture)
                }
                onDiscard={() => setDiscarding(capture)}
              />
            ))}
          </div>
        </section>
      )}

      {handoff && (
        <ClaudeHandoff
          capture={handoff}
          onApply={(reply) => store.applyReply(handoff, reply)}
          onDone={() => {
            setHandoff(null)
            onOpenReview()
          }}
          onClose={() => setHandoff(null)}
        />
      )}

      {discarding && (
        <ConfirmDialog
          title="Discard these notes?"
          message={`Your notes on ${discarding.book_title} will be deleted, along with anything Claude proposed from them. This cannot be undone.`}
          confirmLabel="Discard notes"
          onConfirm={() => store.discardCapture(discarding.id)}
          onCancel={() => setDiscarding(null)}
        />
      )}
    </div>
  )
}

function QueueRow({
  capture,
  onOpenReview,
  onContinue,
  onRetry,
  onDiscard,
}: {
  capture: Capture
  onOpenReview: () => void
  onContinue: () => void
  onRetry: () => void
  onDiscard: () => void
}) {
  const stale = isStale(capture)
  const failed = capture.status === 'failed' || stale
  const preview = capture.raw_notes.split('\n').find((line) => line.trim()) ?? ''

  return (
    <div className={`queue-row${failed ? ' queue-row--failed' : ''}`}>
      <div className="queue-row__body">
        <p className="queue-row__book">
          {capture.book_title}
          <span className="queue-row__author"> · {capture.book_author}</span>
        </p>
        <p className="queue-row__preview">{preview}</p>
        {failed && (
          <p className="queue-row__error" role="alert">
            {stale ? 'This is taking far longer than it should. Try again.' : capture.error}
          </p>
        )}
      </div>

      <div className="queue-row__side">
        {capture.status === 'needs_review' && (
          <Button size="sm" variant="primary" onClick={onOpenReview}>
            Review
          </Button>
        )}
        {capture.status === 'queued' && !AUTO_PROCESS && (
          <>
            <span className="queue-row__status">Waiting for Claude</span>
            <Button size="sm" variant="primary" onClick={onContinue}>
              Continue
            </Button>
          </>
        )}
        {(capture.status === 'processing' || (capture.status === 'queued' && AUTO_PROCESS)) && !stale && (
          <span className="queue-row__status" role="status">
            <span className="queue-row__pulse" aria-hidden="true" />
            Processing…
          </span>
        )}
        {failed && (
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
        <Menu
          label={`Actions for notes on ${capture.book_title}`}
          items={[{ label: 'Discard these notes', onSelect: onDiscard, danger: true }]}
        />
      </div>
    </div>
  )
}
