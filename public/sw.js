// Masar service worker — lets the app open with no internet.
//
// What it stores: ONLY the app itself (page shells and the app's code/CSS
// files). It never stores API responses, so no business data (invoices,
// clients, prices, stock) is ever kept by it. Pages in this app contain no
// data in their HTML — data is always fetched separately after login —
// so caching page shells is safe.
//
// Strategies:
//   /_next/static/*  cache-first  (file names change on every deploy, so
//                                  a cached file is never stale)
//   page navigations network-first, fall back to the cached copy of that
//                                  page, then to /offline.html
//   /api/*           never touched (always goes to the network)

const STATIC_CACHE = "masar-static-v1";
const PAGE_CACHE = "masar-pages-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(PAGE_CACHE).then((c) => c.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  const keep = [STATIC_CACHE, PAGE_CACHE];
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts etc: browser's own cache
  if (url.pathname.startsWith("/api/")) return; // data: never cached here

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return (await cache.match(req)) || (await cache.match(OFFLINE_URL));
        }
      })()
    );
  }
});
