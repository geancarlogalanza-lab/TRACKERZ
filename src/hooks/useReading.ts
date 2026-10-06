import { useCallback, useEffect, useState } from 'react'
import * as repo from '../data/readingRepository'
import type { Capture, CaptureInput, Lesson } from '../data/types'
import { toMessage } from '../lib/errors'

/** How often to look for finished processing while something is in flight. */
const POLL_MS = 4000

/**
 * State for the Reading area. It loads the first time Reading is opened,
 * never at start-up, and stays loaded while you move around the app.
 *
 * While a capture is being processed it checks back every few seconds, so
 * a capture moves to Review on its own when Claude is done.
 */
export function useReading() {
  const [captures, setCaptures] = useState<Capture[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [nextCaptures, nextLessons] = await Promise.all([
          repo.listOpenCaptures(),
          repo.listLessons(),
        ])
        if (!active) return
        setCaptures(nextCaptures)
        setLessons(nextLessons)
        setLoadError(null)
      } catch (error) {
        if (active) setLoadError(toMessage(error, 'Could not load your reading.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [reloadToken])

  const retry = useCallback(() => {
    setLoading(true)
    setReloadToken((token) => token + 1)
  }, [])

  const inFlight = captures.some((item) => item.status === 'queued' || item.status === 'processing')
  useEffect(() => {
    if (!inFlight) return
    const timer = setInterval(async () => {
      try {
        setCaptures(await repo.listOpenCaptures())
      } catch {
        // A missed check is harmless; the next one tries again.
      }
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [inFlight])

  const replace = (next: Capture) =>
    setCaptures((current) => current.map((item) => (item.id === next.id ? next : item)))

  /** Starts (or restarts) processing. Throws a sentence the page can show. */
  const process = useCallback(async (capture: Capture) => {
    replace({ ...capture, status: 'processing', error: null, status_changed_at: new Date().toISOString() })
    try {
      await repo.processCapture(capture.id)
    } catch (error) {
      const message = toMessage(error, 'Could not start processing.')
      replace({ ...capture, status: 'failed', error: message })
      throw new Error(message)
    }
  }, [])

  /** Saves a capture, then hands it to Claude. The capture is kept even if processing can't start. */
  const addCapture = useCallback(
    async (input: CaptureInput) => {
      const created = await repo.createCapture(input)
      setCaptures((current) => [created, ...current])
      await process(created).catch(() => {
        // The capture is saved and shows the failure with a retry.
      })
    },
    [process],
  )

  const discardCapture = useCallback(async (id: string) => {
    await repo.deleteCapture(id)
    setCaptures((current) => current.filter((item) => item.id !== id))
  }, [])

  const saveReview = useCallback(async (capture: Capture, kept: repo.KeptLesson[]) => {
    await repo.saveReview(capture, kept)
    setCaptures((current) => current.filter((item) => item.id !== capture.id))
    // Reload rather than merge, so a retried save never shows a lesson twice.
    setLessons(await repo.listLessons())
  }, [])

  const editLesson = useCallback(async (id: string, text: string) => {
    const updated = await repo.updateLessonText(id, text)
    setLessons((current) => current.map((item) => (item.id === id ? updated : item)))
  }, [])

  const setRetired = useCallback(async (id: string, retired: boolean) => {
    const updated = await repo.setLessonRetired(id, retired)
    setLessons((current) => current.map((item) => (item.id === id ? updated : item)))
  }, [])

  return {
    captures,
    lessons,
    loading,
    loadError,
    retry,
    addCapture,
    process,
    discardCapture,
    saveReview,
    editLesson,
    setRetired,
  }
}

export type ReadingStore = ReturnType<typeof useReading>
