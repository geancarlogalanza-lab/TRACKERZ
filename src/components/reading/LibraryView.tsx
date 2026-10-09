import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/Feedback'
import { Field, FormError } from '../ui/Field'
import { Menu } from '../ui/Menu'
import { Modal } from '../ui/Modal'
import { FLAG_LABEL, ORIGIN_LABEL, bookKey, booksOf, lessonMatches } from '../../lib/reading'
import { toMessage } from '../../lib/errors'
import { LIMITS, lengthNotice, requiredText, worst } from '../../lib/validation'
import { plural } from '../../lib/plural'
import type { Lesson, LessonFlag } from '../../data/types'
import type { ReadingStore } from '../../hooks/useReading'

interface LibraryViewProps {
  store: ReadingStore
  onError: (message: string) => void
}

/**
 * Every lesson you kept, newest first. Search covers the lesson, what it
 * rests on, your take, and the book. Retired lessons stay here (hidden
 * unless asked for) but are never resurfaced.
 */
export function LibraryView({ store, onError }: LibraryViewProps) {
  const [query, setQuery] = useState('')
  const [book, setBook] = useState('')
  const [showRetired, setShowRetired] = useState(false)
  const [editing, setEditing] = useState<Lesson | null>(null)

  const books = useMemo(
    () =>
      booksOf(
        store.lessons.map((lesson) => ({
          title: lesson.captures?.book_title ?? '',
          author: lesson.captures?.book_author ?? '',
        })),
      ).filter((item) => item.title),
    [store.lessons],
  )

  const retiredCount = store.lessons.filter((lesson) => lesson.retired_at).length
  const shown = store.lessons.filter(
    (lesson) =>
      (showRetired || !lesson.retired_at) &&
      (!book || bookKey(lesson.captures?.book_title ?? '', lesson.captures?.book_author ?? '') === book) &&
      lessonMatches(lesson, query),
  )
  const filtering = Boolean(query.trim() || book)

  if (store.lessons.length === 0) {
    return (
      <EmptyState
        title="No lessons yet"
        text="Capture notes from a book. The lessons you keep in Review collect here, and one comes back to you each day."
      />
    )
  }

  const retire = (lesson: Lesson, retired: boolean) =>
    store
      .setRetired(lesson.id, retired)
      .catch((caught) => onError(toMessage(caught, 'Could not update that lesson.')))

  return (
    <div className="library">
      <div className="library__filters">
        <label className="sr-only" htmlFor="library-search">
          Search lessons
        </label>
        <input
          id="library-search"
          className="input library__search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search lessons"
        />
        <label className="sr-only" htmlFor="library-book">
          Book
        </label>
        <select
          id="library-book"
          className="select library__book"
          value={book}
          onChange={(event) => setBook(event.target.value)}
        >
          <option value="">All books</option>
          {books.map((item) => (
            <option key={item.key} value={item.key}>
              {item.title} — {item.author}
            </option>
          ))}
        </select>
        {retiredCount > 0 && (
          <label className="library__retired-toggle">
            <input
              type="checkbox"
              checked={showRetired}
              onChange={(event) => setShowRetired(event.target.checked)}
            />
            Show retired
          </label>
        )}
      </div>

      {filtering && (
        <p className="library__matches" role="status">
          {shown.length === 0 ? 'No lessons match.' : plural(shown.length, 'lesson')}
        </p>
      )}

      {shown.length > 0 && (
        <ul className="lesson-list">
          {shown.map((lesson) => (
            <LessonItem
              key={lesson.id}
              lesson={lesson}
              onEdit={() => setEditing(lesson)}
              onRetire={() => retire(lesson, true)}
              onRestore={() => retire(lesson, false)}
            />
          ))}
        </ul>
      )}

      {editing && (
        <EditLesson
          lesson={editing}
          onSave={(text) => store.editLesson(editing.id, text)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function LessonItem({
  lesson,
  onEdit,
  onRetire,
  onRestore,
}: {
  lesson: Lesson
  onEdit: () => void
  onRetire: () => void
  onRestore: () => void
}) {
  const flags = Array.isArray(lesson.flags) ? (lesson.flags as LessonFlag[]) : []
  const origin = ORIGIN_LABEL[lesson.origin as keyof typeof ORIGIN_LABEL]

  return (
    <li className={`lesson${lesson.retired_at ? ' lesson--retired' : ''}`}>
      <div className="lesson__body">
        <p className="lesson__text">{lesson.text}</p>
        {lesson.interpretation && (
          <p className="lesson__detail">
            <span className="lesson__label">Your take</span> {lesson.interpretation}
          </p>
        )}
        {flags.length > 0 && (
          <p className="lesson__detail lesson__detail--flag">
            <span className="lesson__label">Kept despite</span>{' '}
            {flags.map((flag) => FLAG_LABEL[flag.type]).join(', ').toLowerCase()}
          </p>
        )}
        <p className="lesson__meta">
          {origin && <span>{origin}</span>}
          <span>
            {lesson.captures?.book_title}
            {lesson.captures?.book_author && ` — ${lesson.captures.book_author}`}
            {lesson.captures?.location && `, ${lesson.captures.location}`}
          </span>
          {lesson.retired_at && <span className="lesson__retired">Retired</span>}
        </p>
      </div>
      <Menu
        label="Lesson actions"
        items={[
          { label: 'Edit lesson', onSelect: onEdit },
          lesson.retired_at
            ? { label: 'Bring back', onSelect: onRestore }
            : { label: 'Retire', onSelect: onRetire },
        ]}
      />
    </li>
  )
}

function EditLesson({
  lesson,
  onSave,
  onClose,
}: {
  lesson: Lesson
  onSave: (text: string) => Promise<void>
  onClose: () => void
}) {
  const [text, setText] = useState(lesson.text)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notice = worst(requiredText(text, 'A lesson needs some words.'), lengthNotice(text, LIMITS.lessonText))

  const submit = async () => {
    if (busy || notice?.level === 'error') return
    setBusy(true)
    setError(null)
    try {
      await onSave(text)
      onClose()
    } catch (caught) {
      setError(toMessage(caught, 'Could not save that lesson.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Edit lesson"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <FormError message={error} />
      <Field label="Lesson" notice={notice}>
        {(id, a11y) => (
          <textarea
            id={id}
            className="textarea"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={4}
            {...a11y}
          />
        )}
      </Field>
    </Modal>
  )
}
