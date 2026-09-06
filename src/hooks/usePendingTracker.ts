import { useCallback, useEffect, useState } from 'react'
import * as repo from '../data/pendingRepository'
import type { Subject, SubjectInput, Task, TaskInput, Trimester } from '../data/types'
import { toMessage } from '../lib/errors'

const ACTIVE_TRIMESTER_KEY = 'tracker:active-trimester'

/**
 * State for the Pending tracker.
 *
 * Supabase is the source of truth; the only thing kept in localStorage is which
 * trimester was last on screen, which is a view preference rather than data.
 * Writes update local state optimistically and roll back if the request fails,
 * so the UI never claims a save that did not happen.
 */
export function usePendingTracker(userId: string | null, reportError: (message: string) => void) {
  const [trimesters, setTrimesters] = useState<Trimester[]>([])
  const [activeTrimesterId, setActiveTrimesterId] = useState<string | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  // --- Loading -------------------------------------------------------------

  const loadTrimesters = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    setLoadError(null)
    try {
      let list = await repo.listTrimesters()
      if (list.length === 0) {
        list = [await repo.createTrimester(userId, 'Trimester 1')]
      }
      setTrimesters(list)

      const remembered = localStorage.getItem(ACTIVE_TRIMESTER_KEY)
      const valid = list.some((item) => item.id === remembered)
      setActiveTrimesterId(valid ? remembered : list[list.length - 1].id)
    } catch (error) {
      setLoadError(toMessage(error, 'Could not load your trackers.'))
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    void loadTrimesters()
  }, [userId, loadTrimesters])

  useEffect(() => {
    if (!activeTrimesterId) return
    localStorage.setItem(ACTIVE_TRIMESTER_KEY, activeTrimesterId)

    let active = true
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const nextSubjects = await repo.listSubjects(activeTrimesterId)
        const nextTasks = await repo.listTasks(nextSubjects.map((subject) => subject.id))
        if (!active) return
        setSubjects(nextSubjects)
        setTasks(nextTasks)
      } catch (error) {
        if (active) setLoadError(toMessage(error, 'Could not load your subjects.'))
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => { active = false }
  }, [activeTrimesterId, reloadToken])

  const retry = useCallback(() => {
    if (trimesters.length === 0) void loadTrimesters()
    else setReloadToken((token) => token + 1)
  }, [trimesters.length, loadTrimesters])

  // --- Trimesters ----------------------------------------------------------

  const addTrimester = useCallback(
    async (label: string) => {
      if (!userId) return
      const created = await repo.createTrimester(userId, label)
      setTrimesters((current) => [...current, created])
      setActiveTrimesterId(created.id)
    },
    [userId],
  )

  const editTrimester = useCallback(async (id: string, label: string) => {
    const updated = await repo.renameTrimester(id, label)
    setTrimesters((current) => current.map((item) => (item.id === id ? updated : item)))
  }, [])

  const removeTrimester = useCallback(
    async (id: string) => {
      await repo.deleteTrimester(id)
      const remaining = trimesters.filter((item) => item.id !== id)
      setTrimesters(remaining)
      if (remaining.length > 0) {
        setActiveTrimesterId(remaining[remaining.length - 1].id)
      } else if (userId) {
        const created = await repo.createTrimester(userId, 'Trimester 1')
        setTrimesters([created])
        setActiveTrimesterId(created.id)
      }
    },
    [trimesters, userId],
  )

  // --- Subjects ------------------------------------------------------------

  const addSubject = useCallback(
    async (input: SubjectInput) => {
      if (!userId || !activeTrimesterId) return
      const created = await repo.createSubject(userId, activeTrimesterId, input)
      setSubjects((current) => [...current, created])
    },
    [userId, activeTrimesterId],
  )

  const editSubject = useCallback(async (id: string, input: SubjectInput) => {
    const updated = await repo.updateSubject(id, input)
    setSubjects((current) => current.map((item) => (item.id === id ? updated : item)))
  }, [])

  const removeSubject = useCallback(async (id: string) => {
    await repo.deleteSubject(id)
    setSubjects((current) => current.filter((item) => item.id !== id))
    setTasks((current) => current.filter((task) => task.subject_id !== id))
  }, [])

  // --- Tasks ---------------------------------------------------------------

  const addTask = useCallback(
    async (subjectId: string, input: TaskInput) => {
      if (!userId) return
      const created = await repo.createTask(userId, subjectId, input)
      setTasks((current) => [...current, created])
    },
    [userId],
  )

  const editTask = useCallback(async (id: string, subjectId: string, input: TaskInput) => {
    const updated = await repo.updateTask(id, subjectId, input)
    setTasks((current) => current.map((task) => (task.id === id ? updated : task)))
  }, [])

  /**
   * Completing removes the task immediately so the list feels instant, then
   * puts it back and explains why if the delete did not reach the server.
   */
  const completeTask = useCallback(
    async (id: string) => {
      const snapshot = tasks
      setTasks((current) => current.filter((task) => task.id !== id))
      try {
        await repo.completeTask(id)
      } catch (error) {
        setTasks(snapshot)
        reportError(toMessage(error, 'Could not complete that task.'))
      }
    },
    [tasks, reportError],
  )

  return {
    trimesters,
    activeTrimesterId,
    setActiveTrimesterId,
    subjects,
    tasks,
    loading,
    loadError,
    retry,
    addTrimester,
    editTrimester,
    removeTrimester,
    addSubject,
    editSubject,
    removeSubject,
    addTask,
    editTask,
    completeTask,
  }
}
