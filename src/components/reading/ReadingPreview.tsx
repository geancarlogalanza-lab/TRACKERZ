import { useState } from 'react'
import { BrandMark } from '../ui/BrandMark'
import { SectionNav } from '../ui/SectionNav'
import { ReadingScreens } from './ReadingArea'
import type { Capture, Lesson } from '../../data/types'
import type { ReadingStore } from '../../hooks/useReading'

/**
 * Development only — never bundled into a production build (`?reading=preview`).
 * The Reading screens with sample data and no database, so their layout
 * can be checked without signing in.
 */

const now = new Date().toISOString()

const capture = (overrides: Partial<Capture>): Capture => ({
  id: crypto.randomUUID(),
  user_id: 'preview',
  book_title: 'Deep Work',
  book_author: 'Cal Newport',
  raw_notes: 'Attention residue: switching tasks leaves part of your mind on the old one.\nI notice this after checking my phone between problem sets.',
  source_passage: null,
  location: 'p. 42',
  status: 'needs_review',
  status_changed_at: now,
  ai_result: null,
  ai_model: 'claude-opus-5-5',
  prompt_version: 'reading-v1',
  error: null,
  created_at: now,
  ...overrides,
})

const SAMPLE_CAPTURES: Capture[] = [
  capture({
    source_passage: 'When you switch from some Task A to another Task B, your attention doesn’t immediately follow.',
    ai_result: {
      lessons: [
        {
          lesson: 'Switching tasks leaves part of your attention behind on the old one.',
          origin: 'author',
          basis: 'switching tasks leaves part of your mind on the old one',
          interpretation: null,
          flags: [],
        },
        {
          lesson: 'Checking my phone between problem sets costs more focus than the minute it takes.',
          origin: 'mixed',
          basis: 'I notice this after checking my phone between problem sets',
          interpretation: 'My phone breaks are the switches the author means.',
          flags: [
            {
              type: 'unsupported_leap',
              note: 'The notes don’t say the cost is larger than the break itself.',
            },
          ],
        },
      ],
    },
  }),
  capture({
    book_title: 'The Psychology of Money',
    book_author: 'Morgan Housel',
    location: 'ch. 5',
    raw_notes: 'Getting wealthy and staying wealthy are different skills.',
    status: 'processing',
  }),
  capture({
    book_title: 'Atomic Habits',
    book_author: 'James Clear',
    location: null,
    raw_notes: 'Habits are the compound interest of self-improvement.',
    status: 'failed',
    error: 'Claude is busy right now. Try again in a minute.',
  }),
]

const lesson = (overrides: Partial<Lesson>): Lesson => ({
  id: crypto.randomUUID(),
  user_id: 'preview',
  capture_id: 'preview',
  proposal_index: 0,
  text: 'Getting wealthy and staying wealthy take different skills.',
  origin: 'author',
  basis: 'Getting wealthy and staying wealthy are different skills.',
  interpretation: null,
  flags: [],
  decision: 'kept',
  retired_at: null,
  last_surfaced_at: null,
  surfaced_count: 0,
  created_at: now,
  captures: { book_title: 'The Psychology of Money', book_author: 'Morgan Housel', location: 'ch. 5' },
  ...overrides,
})

const SAMPLE_LESSONS: Lesson[] = [
  lesson({}),
  lesson({
    text: 'Read the hard chapter before checking messages; my best hour is my first.',
    origin: 'mine',
    interpretation: 'Mornings are when I actually understand proofs.',
    captures: { book_title: 'Deep Work', book_author: 'Cal Newport', location: 'p. 97' },
  }),
  lesson({
    text: 'Small habits compound like interest, in both directions.',
    origin: 'mixed',
    decision: 'kept_anyway',
    flags: [{ type: 'unsupported_leap', note: 'The notes only mention good habits.' }],
    captures: { book_title: 'Atomic Habits', book_author: 'James Clear', location: null },
  }),
  lesson({
    text: 'Write the sentence you want to remember, not the paragraph.',
    retired_at: now,
    captures: { book_title: 'On Writing Well', book_author: 'William Zinsser', location: null },
  }),
]

export function ReadingPreview() {
  const [captures, setCaptures] = useState(SAMPLE_CAPTURES)
  const [lessons, setLessons] = useState(SAMPLE_LESSONS)
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 400))

  const store: ReadingStore = {
    captures,
    lessons,
    loading: false,
    loadError: null,
    retry: () => {},
    addCapture: async (input) => {
      await pause()
      setCaptures((current) => [capture({ ...input, status: 'processing', ai_result: null }), ...current])
    },
    process: async () => pause(),
    discardCapture: async (id) => {
      await pause()
      setCaptures((current) => current.filter((item) => item.id !== id))
    },
    saveReview: async (saved) => {
      await pause()
      setCaptures((current) => current.filter((item) => item.id !== saved.id))
    },
    editLesson: async (id, text) => {
      await pause()
      setLessons((current) => current.map((item) => (item.id === id ? { ...item, text } : item)))
    },
    setRetired: async (id, retired) => {
      setLessons((current) =>
        current.map((item) => (item.id === id ? { ...item, retired_at: retired ? now : null } : item)),
      )
    },
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header__brand">
          <BrandMark />
          <span>Tracker</span>
        </div>
        <SectionNav
          label="Areas"
          value="reading"
          onChange={() => {}}
          sections={[
            { id: 'college', label: 'College' },
            { id: 'reading', label: 'Reading' },
          ]}
        />
        <span className="header__spacer" />
      </header>
      <main className="main">
        <ReadingScreens store={store} onError={(message) => console.warn(message)} />
      </main>
    </div>
  )
}
