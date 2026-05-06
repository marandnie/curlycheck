// Service worker simple — cache-first del shell, network-first de OBF.
// Cambiá CACHE_VERSION cuando deployes una nueva versión para forzar refresh.

const CACHE_VERSION = "curlycheck-v14";
const SCOPE = "/curlycheck/";
const SHELL = [
  SCOPE,
  SCOPE + "index.html",
  SCOPE + "privacy.html",
  SCOPE + "styles.css",
  SCOPE + "manifest.webmanifest",
  SCOPE + "src/app.js",
  SCOPE + "src/classifier.js",
  SCOPE + "src/ingredients.js",
  SCOPE + "src/obf.js",
  SCOPE + "src/shelf.js",
  SCOPE + "src/local-products.js",
  SCOPE + "src/ocr.js",
  SCOPE + "src/auth.js",
  SCOPE + "src/cloud-shelf.js",
  SCOPE + "src/firebase-config.js",
  SCOPE + "src/search.js",
  SCOPE + "src/fuzzy.js",
  SCOPE + "src/share.js",
  SCOPE + "src/cropper.js",
  SCOPE + "src/telemetry.js",
  SCOPE + "glossary.html",
  SCOPE + "icons/icon-192.png",
  SCOPE + "icons/icon-512.png",
  SCOPE + "icons/icon-maskable-512.png",
  SCOPE + "icons/favicon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function(cache) { return cache.addAll(SHELL); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_VERSION; })
            .map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    url.hostname.endsWith("firebaseapp.com") ||
    url.hostname.endsWith("googleapis.com") ||
    url.hostname.endsWith("google.com") ||
    url.hostname.endsWith("gstatic.com") ||
    url.pathname.startsWith("/__/auth/")
  ) {
    return;
  }

  if (url.hostname.endsWith("openbeautyfacts.org")) {
    event.respondWith(
      fetch(event.request).then(function(res) {
        const clone = res.clone();
        caches.open(CACHE_VERSION).then(function(c) { c.put(event.request, clone); });
        return res;
      }).catch(function() { return caches.match(event.request); })
    );
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net" || url.hostname === "tessdata.projectnaptha.com") {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        if (cached) return cached;
        return fetch(event.request).then(function(res) {
          if (res.ok && event.request.method === "GET") {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then(function(c) { c.put(event.request, clone); });
          }
          return res;
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function(cached) { return cached || fetch(event.request); })
  );
});
