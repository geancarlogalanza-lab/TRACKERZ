import { useCallback, useEffect, useState } from 'react'
import * as repo from '../data/streakRepository'
import type { ISODate, Streak, StreakRecord } from '../data/types'
import { toMessage } from '../lib/errors'

/**
 * State for the Streak tracker. Streaks and their daily records are loaded
 * together once; the history is small and having it all in memory keeps
 * moving around the calendar instant.
 */
export function useStreakTracker(userId: string | null) {
  const [streaks, setStreaks] = useState<Streak[]>([])
  const [records, setRecords] = useState<StreakRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const [nextStreaks, nextRecords] = await Promise.all([
          repo.listStreaks(),
          repo.listRecords(),
        ])
        if (!active) return
        setStreaks(nextStreaks)
        setRecords(nextRecords)
      } catch (error) {
        if (active) setLoadError(toMessage(error, 'Could not load your streaks.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [userId, reloadToken])

  const retry = useCallback(() => setReloadToken((token) => token + 1), [])

  const addStreak = useCallback(
    async (name: string): Promise<Streak | null> => {
      if (!userId) return null
      const created = await repo.createStreak(userId, name)
      setStreaks((current) => [...current, created])
      return created
    },
    [userId],
  )

  const editStreak = useCallback(async (id: string, name: string) => {
    const updated = await repo.renameStreak(id, name)
    setStreaks((current) => current.map((streak) => (streak.id === id ? updated : streak)))
  }, [])

  const removeStreak = useCallback(async (id: string) => {
    await repo.deleteStreak(id)
    setStreaks((current) => current.filter((streak) => streak.id !== id))
    setRecords((current) => current.filter((record) => record.streak_id !== id))
  }, [])

  /**
   * Records that the streak was continued on a date. Whether the streak grows
   * depends only on this date joining the run — the note is stored as written
   * and never examined.
   */
  const continueStreak = useCallback(
    async (streakId: string, date: ISODate, note: string) => {
      if (!userId) return
      const saved = await repo.continueStreak(userId, streakId, date, note)
      setRecords((current) => {
        const others = current.filter(
          (record) => !(record.streak_id === streakId && record.entry_date === date),
        )
        return [...others, saved]
      })
    },
    [userId],
  )

  const undoRecord = useCallback(async (recordId: string) => {
    await repo.removeRecord(recordId)
    setRecords((current) => current.filter((record) => record.id !== recordId))
  }, [])

  return {
    streaks,
    records,
    loading,
    loadError,
    retry,
    addStreak,
    editStreak,
    removeStreak,
    continueStreak,
    undoRecord,
  }
}
