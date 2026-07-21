// Tripper service worker: cache only public, immutable application assets.
// Account-specific HTML is always fetched from the network and is never kept
// in Cache Storage, so it cannot be shown to a different local user.

const CACHE_PREFIX = 'tripper-'
const STATIC_CACHE = 'tripper-static-v3'
const OFFLINE_SHELL = '/offline.html'

function isTripperCache(name) {
  return name.startsWith(CACHE_PREFIX)
}

function clearTripperCaches() {
  return caches
    .keys()
    .then((keys) => Promise.all(keys.filter(isTripperCache).map((key) => caches.delete(key))))
}

function isSafeStaticAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/fonts/') ||
    url.pathname === '/icon.svg' ||
    url.pathname === '/manifest.webmanifest'
  )
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.add(OFFLINE_SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => isTripperCache(key) && key !== STATIC_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_TRIPPER_CACHES') {
    event.waitUntil(clearTripperCaches())
  }
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    // Never cache navigations. A failed protected navigation must not expose
    // an earlier user's SSR page while the device is offline.
    event.respondWith(
      fetch(req).catch(() => caches.open(STATIC_CACHE).then((cache) => cache.match(OFFLINE_SHELL)).then((shell) => shell || new Response('You are offline.', { status: 503 })))
    )
    return
  }

  if (!isSafeStaticAsset(url)) return

  event.respondWith(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              event.waitUntil(cache.put(req, res.clone()))
            }
            return res
          })
      )
    )
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag !== 'tripper-mutation-sync') return
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) client.postMessage({ type: 'TRIPPER_SYNC_REQUESTED' })
  }))
})
