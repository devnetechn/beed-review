const CACHE_NAME = "beed-review-v3";
const STABLE_PATHS = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STABLE_PATHS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  const isImmutableStaticAsset = url.pathname.startsWith("/_next/static/");

  if (!isImmutableStaticAsset) {
    // Network-first: navigations, RSC data fetches, and any other same-origin
    // request must always prefer a fresh response so a new deploy is reflected
    // immediately. Only fall back to the cache when the network is unavailable.
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            event.waitUntil(cache.put(request, response.clone()));
          }
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.mode === "navigate") {
            const offlineFallback = await caches.match("/offline");
            if (offlineFallback) {
              const body = await offlineFallback.text();
              return new Response(body, {
                status: 200,
                statusText: "OK",
                headers: { "Content-Type": "text/html; charset=utf-8" },
              });
            }
          }
          return Response.error();
        }
      })()
    );
    return;
  }

  // Cache-first is safe here: /_next/static/ assets are content-hashed and
  // immutable, so a cached copy can never be stale.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    })()
  );
});
