import { supabase } from '../lib/supabase'
import type { Subject, SubjectInput, Task, TaskInput, Trimester } from './types'

/**
 * All database access for the Pending tracker. UI components never talk to
 * Supabase directly — they call these functions, which throw on failure so
 * callers can surface a real error instead of pretending a write succeeded.
 */

function unwrap<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error
  return result.data as T
}

// --- Trimesters ------------------------------------------------------------

export async function listTrimesters(): Promise<Trimester[]> {
  return unwrap(
    await supabase.from('trimesters').select('*').order('created_at', { ascending: true }),
  )
}

export async function createTrimester(userId: string, label: string): Promise<Trimester> {
  return unwrap(
    await supabase
      .from('trimesters')
      .insert({ user_id: userId, label: label.trim() })
      .select()
      .single(),
  )
}

export async function renameTrimester(id: string, label: string): Promise<Trimester> {
  return unwrap(
    await supabase.from('trimesters').update({ label: label.trim() }).eq('id', id).select().single(),
  )
}

/** Cascades to the trimester's subjects and their tasks. */
export async function deleteTrimester(id: string): Promise<void> {
  const { error } = await supabase.from('trimesters').delete().eq('id', id)
  if (error) throw error
}

// --- Subjects --------------------------------------------------------------

export async function listSubjects(trimesterId: string): Promise<Subject[]> {
  return unwrap(
    await supabase
      .from('subjects')
      .select('*')
      .eq('trimester_id', trimesterId)
      .order('created_at', { ascending: true }),
  )
}

export async function createSubject(
  userId: string,
  trimesterId: string,
  input: SubjectInput,
): Promise<Subject> {
  return unwrap(
    await supabase
      .from('subjects')
      .insert({
        user_id: userId,
        trimester_id: trimesterId,
        name: input.name.trim(),
        color: input.color,
      })
      .select()
      .single(),
  )
}

export async function updateSubject(id: string, input: SubjectInput): Promise<Subject> {
  return unwrap(
    await supabase
      .from('subjects')
      .update({ name: input.name.trim(), color: input.color })
      .eq('id', id)
      .select()
      .single(),
  )
}

/** Cascades to the subject's tasks — the UI confirms before calling this. */
export async function deleteSubject(id: string): Promise<void> {
  const { error } = await supabase.from('subjects').delete().eq('id', id)
  if (error) throw error
}

// --- Tasks -----------------------------------------------------------------

/** Every task in the table is pending; completed tasks are deleted outright. */
export async function listTasks(subjectIds: string[]): Promise<Task[]> {
  if (subjectIds.length === 0) return []
  return unwrap(
    await supabase
      .from('tasks')
      .select('*')
      .in('subject_id', subjectIds)
      .order('created_at', { ascending: true }),
  )
}

export async function createTask(
  userId: string,
  subjectId: string,
  input: TaskInput,
): Promise<Task> {
  return unwrap(
    await supabase
      .from('tasks')
      .insert({ ...normalize(input), user_id: userId, subject_id: subjectId })
      .select()
      .single(),
  )
}

export async function updateTask(
  id: string,
  subjectId: string,
  input: TaskInput,
): Promise<Task> {
  return unwrap(
    await supabase
      .from('tasks')
      .update({ ...normalize(input), subject_id: subjectId })
      .eq('id', id)
      .select()
      .single(),
  )
}

/**
 * Completing a task removes it. There is deliberately no archive, no history
 * table and no completed flag — the tracker only ever shows what is left.
 */
export async function completeTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

/** Trims text and turns empty strings into nulls so blanks stay absent. */
function normalize(input: TaskInput): TaskInput {
  const blankToNull = (value: string | null) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }
  return {
    title: input.title.trim(),
    description: blankToNull(input.description),
    planned_date: blankToNull(input.planned_date),
    planned_time: blankToNull(input.planned_time),
    deadline_date: blankToNull(input.deadline_date),
    deadline_time: blankToNull(input.deadline_time),
  }
}
