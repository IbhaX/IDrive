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
const MODELS = "idrive-3d-v3";   // three.js + the 3D car, pinned versions: keep across deploys
const KEEP = [SHELL, STATIC, DATA, MODELS, "idrive-fonts-v1"];
const CROSS_CACHE = [/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@/, /^https:\/\/raw\.githubusercontent\.com\/KhronosGroup\/glTF-Sample-Assets\//];

const FONTS = "idrive-fonts-v1";
const CACHEABLE_API = [
  /^\/api\/content\/(index|ui|glossary|svgs|signs\/|theory\/)/,
  /^\/api\/curriculum(\/lessons\/[^/]+|\/search-index)?$/,
  /^\/api\/library\//,
  /^\/api\/auth\/config$/,
  /^\/api\/offline\/manifest$/,
];
const FONT_HOSTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // the bare shell (no page content) is the offline fallback for every page URL
    const res = await fetch("/shell", { cache: "no-store" });
    if (res.ok) {
      const html = await res.clone().text();
      await shell.put("/shell", res);
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
    precacheData();          // background: save every lesson, sign, article… for offline use
  })());
});

/* ---------- offline pack: everything except account-only features ---------- */
let packRun = null;
async function tell(msg) {
  for (const c of await self.clients.matchAll({ includeUncontrolled: true })) c.postMessage(msg);
}
function precacheData() {
  if (packRun) return packRun;
  packRun = (async () => {
    try {
      const res = await fetch("/api/offline/manifest", { cache: "no-store" });
      if (!res.ok) return;
      const man = await res.json(), cache = await caches.open(DATA);
      const urls = man.urls, total = urls.length;
      let done = 0, i = 0;
      const worker = async () => {
        while (i < total) {
          const url = urls[i++];
          try { const r = await fetch(url, { cache: "no-cache" }); if (r.ok) await cache.put(url, r); } catch (e) {}
          done++;
          if (done % 12 === 0 || done === total) tell({ type: "offline-progress", done, total });
        }
      };
      await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
      const saved = (await Promise.all(urls.map((u) => cache.match(u)))).filter(Boolean).length;
      await cache.put("/__offline-state", new Response(JSON.stringify({ build: BUILD, saved, total, at: Date.now() }), { headers: { "Content-Type": "application/json" } }));
      tell({ type: "offline-ready", saved, total });
    } catch (e) {
      tell({ type: "offline-failed" });
    } finally { packRun = null; }
  })();
  return packRun;
}

async function networkFirst(req, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(fallbackKey || req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(fallbackKey || req);
    if (hit) return hit;
    // filtered variants (?cat=… / ?q=…) fall back to the full saved list
    if (cacheName === DATA) {
      const u = new URL(req.url);
      if (u.search && /^\/api\/content\/(svgs|glossary)$/.test(u.pathname)) {
        const full = await cache.match(u.pathname);
        if (full) return full;
      }
    }
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
  if (FONT_HOSTS.test(req.url)) {                      // web fonts: keep a copy so text looks right offline
    event.respondWith(caches.open(FONTS).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok || r.type === "opaque") c.put(req, r.clone()); return r; })));
    return;
  }
  if (CROSS_CACHE.some((re) => re.test(req.url))) {
    event.respondWith((async () => {
      const cache = await caches.open(MODELS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    // pages are server-rendered per URL: always ask the network; offline, the
    // cached shell boots the app, which renders the route itself
    event.respondWith(fetch(req).catch(async () => (await caches.open(SHELL)).match("/shell")));
    return;
  }
  if (url.pathname.startsWith("/models/")) {          // pinned 3D model files
    event.respondWith(caches.open(MODELS).then(async (c) => (await c.match(req)) || fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
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
  if (event.data === "offline-sync") precacheData();
  if (event.data === "offline-state") {
    event.waitUntil(caches.open(DATA).then((c) => c.match("/__offline-state")).then(async (r) => {
      const st = r ? await r.json() : null;
      tell({ type: "offline-state", state: st, running: !!packRun });
    }));
  }
});
