/**
 * Registers the service worker that makes the app installable to a home
 * screen. Only in production builds — during development a cached shell just
 * gets in the way of seeing changes.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    // Relative to the page, so this resolves correctly under a GitHub Pages
    // project subpath as well as at a domain root.
    navigator.serviceWorker.register('./sw.js').catch((error) => {
      // Failing to register costs the install prompt and nothing else, so it
      // is logged rather than surfaced to the user.
      console.error('Service worker registration failed:', error)
    })
  })
}
