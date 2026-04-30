// Service worker simple — cache-first del shell, network-first de OBF.
// Cambiá CACHE_VERSION cuando deployes una nueva versión para forzar refresh.

const CACHE_VERSION = "curlycheck-v1";
const SCOPE = "/curlycheck/";
const SHELL = [
  SCOPE,
  SCOPE + "index.html",
  SCOPE + "styles.css",
  SCOPE + "manifest.webmanifest",
  SCOPE + "src/app.js",
  SCOPE + "src/classifier.js",
  SCOPE + "src/ingredients.js",
  SCOPE + "src/obf.js",
  SCOPE + "src/shelf.js",
  SCOPE + "icons/icon-192.png",
  SCOPE + "icons/icon-512.png",
  SCOPE + "icons/icon-maskable-512.png",
  SCOPE + "icons/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // OBF: siempre fresh, fallback a cache.
  if (url.hostname.endsWith("openbeautyfacts.org")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Shell: cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
