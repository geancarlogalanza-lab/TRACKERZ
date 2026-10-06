import type { Capture, Lesson, LessonOrigin, ProposedLesson } from '../data/types'

/**
 * Small pure helpers for the Reading area. The rules for what Claude may
 * propose live with the Edge Function (supabase/functions/reading-process);
 * this side only reads what was stored.
 */

/** A run still "processing" after this long has died; it can be retried. */
export const STALE_PROCESSING_MS = 3 * 60 * 1000

export const ORIGIN_LABEL: Record<LessonOrigin, string> = {
  author: "The author's idea",
  mine: 'Your own realisation',
  mixed: 'Yours, building on the author',
}

export const FLAG_LABEL = {
  unsupported_leap: 'Unsupported leap',
  contradiction: 'Contradiction',
} as const

/**
 * The proposals stored on a capture. The function validated them before
 * saving; this only guards against a row that was never processed.
 */
export function proposalsOf(capture: Capture): ProposedLesson[] {
  const result = capture.ai_result as { lessons?: unknown } | null
  return Array.isArray(result?.lessons) ? (result.lessons as ProposedLesson[]) : []
}

export function isStale(capture: Capture, now = Date.now()): boolean {
  return (
    capture.status === 'processing' &&
    now - Date.parse(capture.status_changed_at) > STALE_PROCESSING_MS
  )
}

/** "Deep Work — Cal Newport": one book, however it was typed. */
export function bookKey(title: string, author: string): string {
  return `${title.trim().toLowerCase()}\u0000${author.trim().toLowerCase()}`
}

export interface Book {
  key: string
  title: string
  author: string
}

/** Every distinct book, in the spelling first seen, sorted by title. */
export function booksOf(entries: { title: string; author: string }[]): Book[] {
  const books = new Map<string, Book>()
  for (const { title, author } of entries) {
    const key = bookKey(title, author)
    if (!books.has(key)) books.set(key, { key, title: title.trim(), author: author.trim() })
  }
  return [...books.values()].sort((a, b) => a.title.localeCompare(b.title))
}

/** Case-insensitive match over a lesson's words and its book. */
export function lessonMatches(lesson: Lesson, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return [
    lesson.text,
    lesson.basis,
    lesson.interpretation,
    lesson.captures?.book_title,
    lesson.captures?.book_author,
  ].some((field) => field?.toLowerCase().includes(needle))
}
