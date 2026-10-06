import { supabase } from '../lib/supabase'
import type { Capture, CaptureInput, Lesson, LessonDecision, ProposedLesson } from './types'

/**
 * All database access for the Reading area. Like the College repositories,
 * these throw on failure so callers can say what went wrong instead of
 * pretending a write succeeded. Nothing here touches the College tables.
 */

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

const LESSON_FIELDS = '*, captures(book_title, book_author, location)'

/**
 * Captures still in flight: queued, processing, failed, or waiting for
 * review. Reviewed captures are only needed through their lessons, so a
 * long reading history never weighs on this list.
 */
export async function listOpenCaptures(): Promise<Capture[]> {
  return unwrap(
    await supabase
      .from('captures')
      .select('*')
      .neq('status', 'reviewed')
      .order('created_at', { ascending: false }),
  )
}

export async function createCapture(input: CaptureInput): Promise<Capture> {
  const blankToNull = (value: string | null) => value?.trim() || null
  return unwrap(
    await supabase
      .from('captures')
      .insert({
        book_title: input.book_title.trim(),
        book_author: input.book_author.trim(),
        raw_notes: input.raw_notes.trim(),
        source_passage: blankToNull(input.source_passage),
        location: blankToNull(input.location),
      })
      .select()
      .single(),
  )
}

/**
 * Asks the `reading-process` Edge Function to run Claude on a capture. It
 * answers at once; the capture's status reports when the proposals are in.
 */
export async function processCapture(id: string): Promise<void> {
  const { error } = await supabase.functions.invoke('reading-process', { body: { captureId: id } })
  if (!error) return
  // The function explains itself in its JSON body; surface that sentence.
  const context = (error as { context?: Response }).context
  if (context && typeof context.json === 'function') {
    const body = await context.json().catch(() => null)
    if (body?.error) throw new Error(body.error)
  }
  throw error
}

export async function deleteCapture(id: string): Promise<void> {
  const { error } = await supabase.from('captures').delete().eq('id', id)
  if (error) throw error
}

export interface KeptLesson {
  proposalIndex: number
  proposal: ProposedLesson
  text: string
  decision: LessonDecision
}

/**
 * Stores the lessons kept from a review and closes the capture. Each
 * proposal can be stored only once, so retrying after a dropped connection
 * never duplicates a lesson.
 */
export async function saveReview(capture: Capture, kept: KeptLesson[]): Promise<Lesson[]> {
  let saved: Lesson[] = []
  if (kept.length > 0) {
    saved = unwrap(
      await supabase
        .from('lessons')
        .upsert(
          kept.map((item) => ({
            capture_id: capture.id,
            proposal_index: item.proposalIndex,
            text: item.text.trim(),
            origin: item.proposal.origin,
            basis: item.proposal.basis,
            interpretation: item.proposal.interpretation,
            flags: item.decision === 'kept_anyway' ? item.proposal.flags : [],
            decision: item.decision,
          })),
          { onConflict: 'capture_id,proposal_index', ignoreDuplicates: true },
        )
        .select(LESSON_FIELDS),
    )
  }
  const { error } = await supabase.from('captures').update({ status: 'reviewed' }).eq('id', capture.id)
  if (error) throw error
  return saved
}

export async function listLessons(): Promise<Lesson[]> {
  return unwrap(
    await supabase.from('lessons').select(LESSON_FIELDS).order('created_at', { ascending: false }),
  )
}

export async function updateLessonText(id: string, text: string): Promise<Lesson> {
  return unwrap(
    await supabase
      .from('lessons')
      .update({ text: text.trim() })
      .eq('id', id)
      .select(LESSON_FIELDS)
      .single(),
  )
}

/** Retired lessons stay in the library but are never resurfaced. */
export async function setLessonRetired(id: string, retired: boolean): Promise<Lesson> {
  return unwrap(
    await supabase
      .from('lessons')
      .update({ retired_at: retired ? new Date().toISOString() : null })
      .eq('id', id)
      .select(LESSON_FIELDS)
      .single(),
  )
}
