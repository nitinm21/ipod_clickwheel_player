/**
 * App-shell precache. Audio deliberately never goes through here — it lives
 * in IndexedDB and plays via object URLs (SW-cached audio breaks on Safari's
 * Range requests). /api/ is network-only; the app mirrors the manifest in
 * IndexedDB itself.
 */

const CACHE = "ipod-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // network-only

  // Navigations: network-first (fresh HTML references fresh hashed chunks),
  // falling back to the cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/"))
    );
    return;
  }

  // Static assets: cache-first (Next chunks are content-hashed → immutable),
  // caching anything new as it flows past.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
