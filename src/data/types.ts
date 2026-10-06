import type { Database } from './database.types'

/**
 * Domain types for the app, derived from the generated schema so they can
 * never drift from the database.
 *
 * `ISODate` is a calendar day, "2026-09-06" — exactly what <input type="date">
 * produces. `ClockTime` is "19:00", from <input type="time">. Both are stored
 * timezone-naive on purpose: a task planned for 6:00 PM on Sept 10 means that
 * wall-clock time on every device, with no UTC round-tripping to get wrong.
 */
export type ISODate = string
export type ClockTime = string

type Tables = Database['public']['Tables']

export type Trimester = Tables['trimesters']['Row']
export type Subject = Tables['subjects']['Row']
export type Task = Tables['tasks']['Row']
export type Streak = Tables['streaks']['Row']

/** One day of a streak. `note` is free text and is never parsed or interpreted. */
export type StreakRecord = Tables['streak_records']['Row']

/** The fields a person actually fills in, separate from server-owned columns. */
export type TaskInput = Pick<
  Task,
  'title' | 'description' | 'planned_date' | 'planned_time' | 'deadline_date' | 'deadline_time'
>

export type SubjectInput = Pick<Subject, 'name' | 'color'>

// --- Reading ------------------------------------------------------------------

/** One sitting's raw notes on a book, and what Claude proposed from them. */
export type Capture = Tables['captures']['Row']
export type CaptureStatus = 'queued' | 'processing' | 'needs_review' | 'reviewed' | 'failed'
export type CaptureInput = Pick<
  Capture,
  'book_title' | 'book_author' | 'raw_notes' | 'source_passage' | 'location'
>

/** Whose idea a lesson is: the author's, the reader's own, or the reader building on the author. */
export type LessonOrigin = 'author' | 'mine' | 'mixed'
export type LessonFlag = { type: 'unsupported_leap' | 'contradiction'; note: string }
/** How a proposal became a lesson during review. */
export type LessonDecision = 'kept' | 'edited' | 'original' | 'kept_anyway'

/** A lesson Claude proposed, as stored in `captures.ai_result`. */
export interface ProposedLesson {
  lesson: string
  origin: LessonOrigin
  basis: string
  interpretation: string | null
  flags: LessonFlag[]
}

/** A kept lesson, with the book it came from. */
export type Lesson = Tables['lessons']['Row'] & {
  captures: Pick<Capture, 'book_title' | 'book_author' | 'location'> | null
}

export type { Database }
