// Single source of truth for the offline static-asset cache name. Both the
// service worker (public/sw.js, via the generated public/sw-cache-version.generated.js)
// and app code (lib/offline/snapshot.ts) must read this value rather than
// hardcoding their own literal, so the two can never drift out of contract.
// Bump this string whenever the cached asset set changes shape.
export const OFFLINE_STATIC_CACHE_NAME = 'tripper-static-v4'
