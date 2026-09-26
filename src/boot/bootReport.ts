/**
 * What the app tells the loading screen about its own start-up.
 *
 * The steps are the app's real initialisation, in order: resolving the
 * session, then — for a signed-in user — the workspace (trimesters), then
 * its content (subjects and tasks). 'ready' means the first screen is
 * rendered with its data and can be used. 'failed' means a step that screen
 * depends on did not succeed; `retry` re-runs just that step.
 */
export interface BootReport {
  step: 'session' | 'workspace' | 'content' | 'ready' | 'failed'
  /** Friendly description of a failure, for logging. */
  message?: string
  /** Re-attempts only the step that failed. */
  retry?: () => void
}
