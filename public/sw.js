/**
 * Service worker — the minimum needed to make the app installable and to let
 * it open without a network connection.
 *
 * It deliberately never touches Supabase. Only same-origin GET requests are
 * intercepted, so every API call, auth token refresh and write goes straight
 * to the network. Cached data would be worse than no data here: the whole
 * point of the app is that two devices agree, and a stale cache would quietly
 * show tasks that are already done.
 */

const CACHE = 'tracker-shell-v1'
const SHELL = new URL('./index.html', self.location).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL]))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Anything cross-origin (Supabase above all) is left entirely alone.
  if (request.method !== 'GET') return
  if (new URL(request.url).origin !== self.location.origin) return

  // Navigations: prefer the network so a new deploy is picked up straight
  // away, and fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(SHELL, copy))
          return response
        })
        .catch(() => caches.match(SHELL).then((cached) => cached ?? Response.error())),
    )
    return
  }

  // Build assets are content-hashed, so serving a hit immediately is safe;
  // the background refresh keeps anything unhashed from going stale.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)

      return cached ?? network
    }),
  )
})
