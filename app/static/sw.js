/* iDrive service worker.
   Served at /sw.js (scope "/") with __BUILD__ replaced by the server's build
   fingerprint, so every deploy installs a fresh worker and old caches go.

   Strategy
   - App shell (navigations): network first, cached shell when offline.
   - /static/* : cache first (URLs carry ?v=<content hash>, so they never go stale).
   - Read-only content APIs: network first, cached copy when offline.
   - Anything personal or write-like (auth, progress, exams, instructor): network only. */
const BUILD = "__BUILD__";
const SHELL = "idrive-shell-" + BUILD;
const STATIC = "idrive-static-" + BUILD;
const DATA = "idrive-data-v1";
const KEEP = [SHELL, STATIC, DATA];

const CACHEABLE_API = [
  /^\/api\/content\/(index|ui|glossary|svgs|signs\/|theory\/)/,
  /^\/api\/curriculum(\/lessons\/[^/]+)?$/,
  /^\/api\/library\//,
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    const res = await fetch("/", { cache: "no-store" });
    if (res.ok) {
      const html = await res.clone().text();
      await shell.put("/", res);
      // precache every versioned asset the shell references
      const urls = [...new Set([...html.matchAll(/(?:src|href)="(\/static\/[^"]+)"/g)].map((m) => m[1]))];
      urls.push("/manifest.webmanifest", "/static/img/icon-192.png", "/static/img/favicon.svg");
      const st = await caches.open(STATIC);
      await Promise.all(urls.map((u) => st.add(u).catch(() => {})));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("idrive-") && !KEEP.includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackKey || req);
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, SHELL, "/"));
    return;
  }
  if (url.pathname.startsWith("/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }
  if (CACHEABLE_API.some((re) => re.test(url.pathname))) {
    event.respondWith(networkFirst(req, DATA));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});
