// Service worker simple — cache-first del shell, network-first de OBF.
// Cambiá CACHE_VERSION cuando deployes una nueva versión para forzar refresh.

const CACHE_VERSION = "curlycheck-v2";
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
  SCOPE + "src/local-products.js",
  SCOPE + "src/ocr.js",
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

  // Tesseract.js + traineddata desde jsdelivr: cache-first (son grandes y no cambian).
  // El propio Tesseract además guarda los traineddata en IndexedDB.
  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "tessdata.projectnaptha.com") {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((res) => {
          if (res.ok && event.request.method === "GET") {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(event.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Shell: cache-first.
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
