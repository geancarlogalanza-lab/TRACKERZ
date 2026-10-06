import { useState } from 'react'
import { SectionNav } from '../ui/SectionNav'
import { ErrorNotice, Loading } from '../ui/Feedback'
import { CaptureView } from './CaptureView'
import { ReviewView } from './ReviewView'
import { LibraryView } from './LibraryView'
import { useReading, type ReadingStore } from '../../hooks/useReading'

type Section = 'capture' | 'review' | 'library'

interface ReadingProps {
  onError: (message: string) => void
}

/**
 * Reading: capture notes from a book, review what Claude proposes, keep the
 * lessons worth keeping. Loaded the first time Reading is opened, so the
 * College start-up never waits on it.
 */
export default function ReadingArea({ onError }: ReadingProps) {
  return <ReadingScreens store={useReading()} onError={onError} />
}

/** The Reading screens for a given store; the dev preview passes sample data. */
export function ReadingScreens({ store, onError }: ReadingProps & { store: ReadingStore }) {
  const [section, setSection] = useState<Section>('capture')
  const toReview = store.captures.filter((item) => item.status === 'needs_review').length

  const nav = (
    <div className="toolbar">
      <SectionNav
        label="Reading"
        value={section}
        onChange={setSection}
        sections={[
          { id: 'capture', label: 'Capture' },
          { id: 'review', label: 'Review', count: toReview },
          { id: 'library', label: 'Library' },
        ]}
      />
    </div>
  )

  if (store.loading) {
    return (
      <>
        {nav}
        <Loading label="Opening your reading…" />
      </>
    )
  }
  if (store.loadError) {
    return (
      <>
        {nav}
        <ErrorNotice message={store.loadError} onRetry={store.retry} />
      </>
    )
  }

  return (
    <>
      {nav}
      {section === 'capture' && (
        <CaptureView store={store} onOpenReview={() => setSection('review')} onError={onError} />
      )}
      {section === 'review' && <ReviewView store={store} onError={onError} />}
      {section === 'library' && <LibraryView store={store} onError={onError} />}
    </>
  )
}
