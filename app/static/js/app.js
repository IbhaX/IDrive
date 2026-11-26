/* iDrive app.js - shell: progress state, navigation, hash routing,
   event delegation, keyboard, boot. Keeps the source app's data-* event
   contract and adds the curriculum/lab/vehicle/hazard/instructor routes. */
(() => {
"use strict";
const PKEY = "idrive-v1";

function defaultProgress() {
  return { seen: {}, box: {}, wrong: {}, best: 0, played: 0, lang: "both", mock: { taken: 0, passed: 0, best: 0 }, tq: {},
    les: {}, bm: {}, rec: [], days: {}, rq: {}, hz: {}, lab: {}, gm: {}, secs: 0, v: 1 };
}
window.defaultProgress = defaultProgress;

window.P = (() => {
  try {
    const r = localStorage.getItem(PKEY);
    if (r) return Object.assign(defaultProgress(), JSON.parse(r));
  } catch (e) {}
  return defaultProgress();
})();

window.S = { view: "home", param: null, param2: null, cat: "all", q: "", list: [], quiz: null, quizCat: "all", quizLen: 10, cards: null, cardCat: "all", exam: null, art: null, gq: "" };

function saveLocal() { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) {} }
window.saveLocal = saveLocal;
function save() { P.v = (P.v || 0) + 1; saveLocal(); Auth.queuePut(); }
window.save = save;

/* progress helpers - same semantics as the source (Leitner boxes 0-4) */
window.box = (id) => (P.box || {})[id] || 0;
window.setBox = (id, v) => { P.box[id] = Math.max(0, Math.min(4, v)); P.seen[id] = 1; };
window.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- navigation ---------- */
const I = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const TABS = [
  { id: "home", k: "tHome", icon: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>' },
  { id: "course", k: "tCourse", icon: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 8h6M9 12h6"/>' },
  { id: "learn", k: "tSigns", icon: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>' },
  { id: "vehicle", k: "tVehicle", icon: '<path d="M5 16l1.5-5A2 2 0 0 1 8.4 9.5h7.2a2 2 0 0 1 1.9 1.5L19 16M3 16h18v3H3z"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/>' },
  { id: "science", k: "tScience", icon: '<path d="M9 3h6M10 3v6L4 19a1.5 1.5 0 0 0 1.3 2h13.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7 15h10"/>' },
  { id: "hazard", k: "tHazard", icon: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
  { id: "games", k: "tGames", icon: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3M15.5 12h.01M18 13.5h.01"/>' },
  { id: "exam", k: "tTests", icon: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>' },
  { id: "ask", k: "tAsk", icon: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9 10h6M9 13.5h4"/>' },
  { id: "progress", k: "tProg", icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
];
const DOCK = ["home", "course", "learn", "exam"];
const TAB_OF = { lesson: "course", theory: "course", quiz: "exam", cards: "exam", limits: "learn" };
const LANGS = [["en", "EN", "English"], ["ml", "മല", "മലയാളം"], ["both", "EN+മല", "English + മലയാളം"]];
const curTab = () => TAB_OF[S.view] || S.view;

const tabHtml = (ids) => TABS.filter(t => !ids || ids.includes(t.id)).map(t =>
  `<a href="#${t.id}" ${t.id === curTab() ? 'aria-current="page"' : ""} title="${I18n.attr(I18n.u(t.k))}">${I(t.icon)}<span>${esc(I18n.u(t.k))}</span></a>`).join("");
const dockHtml = () => tabHtml(DOCK) + `<button class="morebtn ${DOCK.includes(curTab()) ? "" : "cur"}" data-act="more" aria-haspopup="true" aria-expanded="false">${I('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>')}<span>${esc(I18n.u("more"))}</span></button>`;
const langHtml = () => LANGS.map(l =>
  `<button class="lg ${I18n.lang() === l[0] ? "on" : ""}" data-lang="${l[0]}" aria-pressed="${I18n.lang() === l[0]}" aria-label="${l[2]}" title="${l[2]}">${l[1]}</button>`).join("");

/* theme: dark is the default; "light" sets data-theme=light */
const SUN = '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const MOON = '<path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
function isLight() { return document.documentElement.dataset.theme === "light"; }
function applyThemeIcon() {
  const ico = document.getElementById("themeIco"), btn = document.getElementById("themeBtn");
  if (!ico) return;
  ico.innerHTML = isLight() ? MOON : SUN;
  btn.setAttribute("aria-label", I18n.u(isLight() ? "themeDark" : "themeLight"));
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.content = isLight() ? "#eef0f4" : "#07090d";
}
window.toggleTheme = () => {
  const light = !isLight();
  if (light) document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem("idrive-theme", light ? "light" : "dark"); } catch (e) {}
  applyThemeIcon();
};

function applyStatic() {
  document.documentElement.lang = I18n.lang() === "ml" ? "ml" : "en";
  document.getElementById("subline").textContent = I18n.u("sub2");
  const play = document.querySelector('meta[name="play-url"]');
  document.getElementById("foot").innerHTML = `${esc(I18n.u("foot"))}<span class="footlinks"><a href="/about">${esc(I18n.u("ftAbout"))}</a><a href="/privacy">${esc(I18n.u("ftPrivacy"))}</a><a href="/terms">${esc(I18n.u("ftTerms"))}</a><a href="/install">${esc(I18n.u("ftInstall"))}</a>${play ? `<a href="${I18n.attr(play.content)}" rel="noopener" target="_blank">${esc(I18n.u("ftPlay"))}</a>` : ""}</span>`;
  if (window.Pwa && Pwa.paintOffline) Pwa.paintOffline();
  document.getElementById("langs").innerHTML = langHtml();
  const sb = document.getElementById("searchBtn");
  if (sb) { sb.setAttribute("aria-label", I18n.u("searchAll")); sb.querySelector("span").textContent = I18n.u("search"); }
  applyThemeIcon();
  const sc = document.getElementById("sClose");
  if (sc) sc.setAttribute("aria-label", I18n.u("close"));
}

/* ---------- routing: #view[/param[/param2[/…]]] ---------- */
const VIEWS = {
  home: (app) => Course.home(app),
  course: (app) => Course.course(app),
  lesson: (app) => Course.lessonView(app),
  learn: (app) => Learn.view(app),
  vehicle: (app) => Vehicle.view(app),
  science: (app) => Labs.view(app),
  hazard: (app) => Hazard.view(app),
  games: (app) => Games.view(app),
  admin: (app) => Admin.view(app),
  theory: (app) => Theory.view(app),
  exam: (app) => Exam.view(app),
  quiz: (app) => Quiz.view(app),
  cards: (app) => Quiz.cardsView(app),
  ask: (app) => Instructor.view(app),
  progress: (app) => Progress.view(app),
  limits: (app) => SpeedLimits.view(app),
  page: (app) => StaticPage.view(app),
};
const ALIASES = { sign: "learn" };

/* Routes are "view/a/b" strings. Every route has a real address too
   (/learn/mand, /sign/stop, /lesson/x …) that the server renders for
   crawlers; old "#view/a" links still work and are rewritten to the path.
   Links inside the app keep using href="#…" - the hashchange handler turns
   each into a clean URL. */
const STATIC_PAGES = ["about", "privacy", "terms", "install"];
function isRouteHash(h) {
  const v = decodeURIComponent((h || "").replace(/^#/, "")).split("/")[0];
  return !!(v && (VIEWS[v] || ALIASES[v]));
}
function pathToRoute(path) {
  const p = decodeURIComponent(path).replace(/^\/+|\/+$/g, "");
  if (!p) return "home";
  const [v, a] = p.split("/");
  if (v === "glossary") return "theory/gloss" + (a ? "/" + a : "");
  if (STATIC_PAGES.includes(v)) return "page/" + v;
  return p;
}
function routeToPath(r) {
  const [v, a, b] = (r || "home").split("/");
  if (!v || v === "home") return "/";
  if (v === "page") return "/" + (a || "about");
  if (v === "theory" && a === "gloss" && b) return "/glossary/" + encodeURIComponent(b);
  return "/" + r.split("/").map(encodeURIComponent).join("/");
}
function curRoute() {
  if (document.querySelector('meta[name="app-notfound"]')) return "page/notfound";
  return isRouteHash(location.hash) ? decodeURIComponent(location.hash.slice(1)) : pathToRoute(location.pathname);
}
window.routeToPath = routeToPath;

function parseHash() {
  const raw = curRoute();
  const [v, a, b, c] = raw.split("/");
  let view = ALIASES[v] || v;
  if (!VIEWS[view]) view = "home";
  return { view, a: a || null, b: b || null, c: c || null, raw: v, route: raw };
}
let lastRoute = "";
function applyRoute() {
  const r = parseHash();
  S.view = r.view;
  S.param = r.a; S.param2 = r.b;
  if (r.view === "theory") S.art = r.a || null;
  if (r.view === "learn" && r.raw === "learn" && r.a) S.cat = Data.catById[r.a] || r.a === "all" ? r.a : "all";
  return r;
}
/* address bar → clean path for the current route, keeping ?lang if present */
function urlFor(r) {
  const q = P.lang === "ml" ? "?lang=ml" : "";
  return routeToPath(r) + q;
}
function setHash(v) {
  const u = urlFor(v);
  if (location.pathname + location.search + location.hash !== u) history.replaceState(null, "", u);
  lastRoute = v;
}
window.setHash = setHash;
window.go = (h) => {
  const r = String(h).replace(/^#/, "") || "home";
  const u = urlFor(r);
  if (location.pathname + location.search !== u || location.hash) history.pushState(null, "", u);
  route();
};

function render() {
  Exam.stopTimer();
  // leaving the exam tab mid-mock pauses the question timer, like the source
  const ex = S.exam;
  if (S.view !== "exam" && ex && ex.mode === "mock" && ex.stage === "play" && ex.pausedLeft == null)
    ex.pausedLeft = Math.max(0, ex.deadline - Date.now());
  Motion.resetView();
  closeMore();
  document.getElementById("tabsTop").innerHTML = tabHtml(TABS.map(t => t.id).filter(id => id !== "home"));
  document.getElementById("dockin").innerHTML = dockHtml();
  applyStatic();
  Auth.renderChip();
  Pwa.refresh();
  const app = document.getElementById("app");
  app.dataset.view = S.view;
  const r = (VIEWS[S.view] || VIEWS.home)(app);
  if (r && r.then) r.catch(() => {});
  requestAnimationFrame(() => {
    Motion.jelly(document.getElementById("tabsTop"));
    Motion.jelly(document.getElementById("dockin"));
    Motion.langPill(document.getElementById("langs"));
    fitNav();
    Motion.bindTilt();
    Motion.bindMagnetic();
  });
}
window.render = render;

/* The top bar and dock are fixed, so their real heights (which change with
   language, wrapping and viewport) are published as CSS variables that
   drive main's top padding and the scroll padding used by scrollIntoView.
   fitNav() steps the desktop tabs down (labels → icons → tighter) until the
   whole row fits, so no tab is ever hidden behind the language switch. */
function fitNav() {
  const nav = document.querySelector(".topnav"), tabs = document.getElementById("tabsTop");
  if (!nav || !tabs) return;
  nav.classList.remove("nav-icons", "nav-tight");
  const over = () => tabs.offsetParent !== null && tabs.scrollWidth > tabs.clientWidth + 1;
  if (over()) nav.classList.add("nav-icons");
  if (over()) nav.classList.add("nav-tight");
  measureChrome();
  requestAnimationFrame(() => { Motion.jelly(tabs); Motion.langPill(document.getElementById("langs")); });
}
function measureChrome() {
  const nav = document.querySelector(".topnav"), dock = document.getElementById("dock");
  const root = document.documentElement.style;
  if (nav) root.setProperty("--navh", Math.ceil(nav.getBoundingClientRect().height) + "px");
  const dh = dock && getComputedStyle(dock).display !== "none" ? Math.ceil(dock.getBoundingClientRect().height) : 0;
  root.setProperty("--dockh", dh + "px");
}
window.fitNav = fitNav;
let fitT = 0;
window.addEventListener("resize", () => { clearTimeout(fitT); fitT = setTimeout(fitNav, 120); });
if (window.ResizeObserver) new ResizeObserver(measureChrome).observe(document.querySelector(".topnav"));

async function route() {
  // an old-style #view link (or one clicked inside the app): show the clean path
  if (isRouteHash(location.hash)) history.replaceState(null, "", urlFor(decodeURIComponent(location.hash.slice(1))));
  const first = !lastRoute;
  if (!first) { const nf = document.querySelector('meta[name="app-notfound"]'); if (nf) nf.remove(); }
  const r = applyRoute();
  lastRoute = r.route;
  render();
  window.scrollTo(0, 0);
  if (!first) { const t = TABS.find(x => x.id === curTab()); document.title = (t ? I18n.one(I18n.u(t.k)) + " | " : "") + "iDrive"; await syncHead(); }
  if (window.Analytics) Analytics.page();
  // deep links that need an action after the view renders
  if (r.raw === "sign" && r.a && Data.byId[r.a]) { await Data.ensureSvgIds([r.a]); Learn.openSheet(r.a, [r.a]); }
  if (r.view === "exam" && r.a === "practice" && r.b && Data.topicById[r.b]) Exam.startPractice(r.b);
}

/* ---------- page head after in-app navigation ----------
   The server writes a unique title, description, canonical, hreflang, Open Graph
   tags and JSON-LD into every page it sends. When the app moves to another
   route itself, fetch the same head for the new path and apply it, so the open
   document always describes what is on screen (shares, bookmarks, analytics,
   crawlers that render). Offline it keeps the generic title set above. */
const headCache = new Map();
function setMeta(sel, attr, key, val) {
  let el = document.head.querySelector(sel);
  if (val == null || val === "") { if (el) el.remove(); return; }
  if (!el) { el = document.createElement(sel.startsWith("link") ? "link" : "meta"); if (sel.startsWith("link")) el.rel = key; else el.setAttribute(attr, key); document.head.appendChild(el); }
  el.setAttribute(sel.startsWith("link") ? "href" : "content", val);
}
async function syncHead() {
  const lang = I18n.lang() === "ml" ? "ml" : "en", key = lang + location.pathname;
  let h = headCache.get(key);
  if (!h) {
    try {
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(`/api/seo/head?path=${encodeURIComponent(location.pathname)}&lang=${lang}`, { signal: ctl.signal });
      clearTimeout(timer); if (!r.ok) return; h = await r.json(); headCache.set(key, h);
    } catch (e) { return; }
  }
  document.title = h.title; document.documentElement.lang = h.lang;
  setMeta('meta[name="description"]', "name", "description", h.description);
  setMeta('link[rel="canonical"]', "rel", "canonical", h.canonical);
  setMeta('meta[name="robots"]', "name", "robots", h.robots);
  setMeta('meta[property="og:title"]', "property", "og:title", h.title);
  setMeta('meta[property="og:description"]', "property", "og:description", h.description);
  setMeta('meta[property="og:url"]', "property", "og:url", h.canonical);
  setMeta('meta[property="og:type"]', "property", "og:type", h.ogType);
  setMeta('meta[name="twitter:title"]', "name", "twitter:title", h.title);
  setMeta('meta[name="twitter:description"]', "name", "twitter:description", h.description);
  setMeta('meta[name="twitter:url"]', "name", "twitter:url", h.canonical);
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((l) => l.remove());
  Object.entries(h.alternates || {}).forEach(([hl, url]) => { const l = document.createElement("link"); l.rel = "alternate"; l.hreflang = hl; l.href = url; document.head.appendChild(l); });
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((x) => x.remove());
  (h.jsonld || []).forEach((ld) => { const x = document.createElement("script"); x.type = "application/ld+json"; x.textContent = JSON.stringify(ld); document.head.appendChild(x); });
}

/* ---------- "more" menu (mobile dock) ---------- */
function closeMore() {
  const m = document.getElementById("moreMenu");
  if (m && !m.hidden) { m.hidden = true; const b = document.querySelector(".morebtn"); if (b) b.setAttribute("aria-expanded", "false"); }
}
function toggleMore(btn) {
  const m = document.getElementById("moreMenu");
  if (!m) return;
  if (!m.hidden) { closeMore(); return; }
  m.innerHTML = `<div class="moregrid">${TABS.filter(t => !DOCK.includes(t.id)).map(t => `<a href="#${t.id}" ${t.id === curTab() ? 'aria-current="page"' : ""}>${I(t.icon)}<span>${esc(I18n.u(t.k))}</span></a>`).join("")}<a href="#theory">${I('<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5"/>')}<span>${esc(I18n.u("tTheory"))}</span></a><a href="#limits">${I('<circle cx="12" cy="12" r="9"/><path d="M12 12l4-3M8 16h8"/>')}<span>${esc(I18n.u("tLimits"))}</span></a>${Auth.isAdmin() ? `<a href="#admin">${I('<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>')}<span>${esc(I18n.u("tAdmin"))}</span></a>` : ""}<button data-act="search">${I('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>')}<span>${esc(I18n.u("search"))}</span></button>${Pwa.menuHtml()}</div>`;
  m.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  Motion.rise(m.querySelectorAll("a,button"));
}

/* ---------- event delegation ---------- */
document.addEventListener("click", (e) => {
  if (e.target === document.getElementById("sheet")) { Learn.closeSheet(); return; }
  if (e.target === document.getElementById("amodal")) { Auth.closeModal(); return; }
  if (e.target === document.getElementById("searchOv")) { Search.close(); return; }
  if (e.target === document.getElementById("pwaSheet")) { Pwa.closeHelp(); return; }
  if (!e.target.closest("#moreMenu,.morebtn")) closeMore();
  // plain path links (server-rendered pages, footer): navigate inside the app
  const pl = e.target.closest('a[href^="/"]');
  if (pl && !pl.target && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0) {
    const u = new URL(pl.href, location.href);
    if (u.origin === location.origin && !/^\/(static|api|models|sitemaps?|llms|robots)/.test(u.pathname) && !/\.\w+$/.test(u.pathname)) {
      e.preventDefault(); go(pathToRoute(u.pathname)); return;
    }
  }
  const t = e.target.closest("[data-go],[data-art],[data-etopic],[data-ans],[data-lang],[data-open],[data-act],[data-cat],[data-qcat],[data-qlen],[data-ccat],[data-opt],[data-amode],[data-kc],[data-vgroup],[data-vsev],[data-light],[data-part],[data-hz],[data-hzc],[data-ask],[data-sclose],#sClose");
  if (!t) return;
  if (t.id === "sClose") { Learn.closeSheet(); return; }
  const ds = t.dataset;
  if (ds.sclose) {
    Search.close();
    if (ds.askq) Instructor.pending = ds.askq;
    return; // the link itself navigates
  }
  if (ds.go) { e.preventDefault(); go(ds.go); return; }
  if (ds.art !== undefined) { go("#theory" + (ds.art ? "/" + ds.art : "")); return; }
  if (ds.etopic) { Exam.startPractice(ds.etopic); return; }
  if (ds.ans !== undefined) { Exam.select(+ds.ans); return; }
  if (ds.lang) { P.lang = ds.lang; save(); setHash(lastRoute); render(); syncHead(); if (!document.getElementById("sheet").hidden) Learn.renderSheet(); return; }
  if (ds.open) {
    const solo = ds.solo || ds.today;
    Learn.openSheet(ds.open, solo ? [ds.open] : (S.view === "learn" ? S.list : null));
    return;
  }
  if (ds.cat) { S.cat = ds.cat; setHash("learn/" + ds.cat); Learn.renderGrid(); return; }
  if (ds.qcat) { S.quizCat = ds.qcat; Quiz.view(document.getElementById("app")); return; }
  if (ds.qlen) { S.quizLen = +ds.qlen; Quiz.view(document.getElementById("app")); return; }
  if (ds.ccat) { S.cardCat = ds.ccat; S.cards = null; Quiz.cardsView(document.getElementById("app")); return; }
  if (ds.opt !== undefined) { Quiz.answer(+ds.opt); return; }
  if (ds.amode) { Auth.openModal(ds.amode); return; }
  if (ds.kc !== undefined) { Course.kcAnswer(+ds.kc); return; }
  if (ds.vgroup) { Vehicle.group = ds.vgroup; Vehicle.explore(document.getElementById("vHost"), S.param2); return; }
  if (ds.vsev) { Vehicle.sev = ds.vsev; Vehicle.lightsView(document.getElementById("vHost"), S.param2); return; }
  if (ds.light) { S.param2 = ds.light; setHash("vehicle/lights/" + ds.light); Vehicle.lightsView(document.getElementById("vHost"), ds.light); return; }
  if (ds.part) { Vehicle.selectPart(ds.part); return; }
  if (ds.hz) { Hazard.spot(ds.hz); return; }
  if (ds.hzc !== undefined) { Hazard.choose(+ds.hzc); return; }
  if (ds.ask) { Instructor.send(ds.ask); return; }
  switch (ds.act) {
    case "startmock": Exam.startMock(); break;
    case "enext": Exam.advance(); break;
    case "equit": Exam.quit(); break;
    case "ebackmenu": S.exam = null; render(); window.scrollTo(0, 0); break;
    case "rvall": S.exam.rv = "all"; Exam.doneView(document.getElementById("app")); break;
    case "rvwrong": S.exam.rv = "wrong"; Exam.doneView(document.getElementById("app")); break;
    case "startquiz": Quiz.start(); break;
    case "qnext": Quiz.next(); break;
    case "quizsetup": S.quiz = null; Quiz.view(document.getElementById("app")); break;
    case "reviseMissed": {
      Quiz.buildCards(S.quiz.missed.slice());
      Data.ensureSvgs("all").then(() => go("#cards"));
      break;
    }
    case "reviseWeak": {
      Quiz.buildCards(Data.D.filter(d => P.wrong[d.id]).sort((a, b) => P.wrong[b.id] - P.wrong[a.id]).slice(0, 8).map(d => d.id));
      Data.ensureSvgs("all").then(() => go("#cards"));
      break;
    }
    case "flip": S.cards.flip = !S.cards.flip; Quiz.cardsView(document.getElementById("app")); break;
    case "again": Quiz.cardAgain(); break;
    case "got": Quiz.cardGot(); break;
    case "newcards": S.cards = null; Quiz.cardsView(document.getElementById("app")); break;
    case "sprev": Learn.sheetNav(-1); break;
    case "snext": Learn.sheetNav(1); break;
    case "slearn": Learn.sheetLearn(); break;
    case "reset1": Progress.resetAsk(); break;
    case "del1": Progress.deleteAsk(); break;
    case "reset0": render(); break;
    case "signin": Auth.openModal("login"); break;
    case "theme": toggleTheme(); break;
    case "install": closeMore(); Pwa.install(); break;
    case "installLater": Pwa.dismiss(); break;
    case "pwaClose": Pwa.closeHelp(); break;
    case "account": if (confirm(I18n.u("signOut") + "?")) Auth.signOut(); break;
    case "search": closeMore(); Search.open(); break;
    case "more": toggleMore(t); break;
    case "bookmark": Course.toggleBookmark(ds.id); { const on = Course.bookmarked(ds.id); t.classList.toggle("on", on); t.setAttribute("aria-pressed", on); const p = t.querySelector("path"); if (p) p.setAttribute("fill", on ? "currentColor" : "none"); Motion.pop(t); Motion.toast(I18n.u(on ? "bookmarked" : "unbookmarked")); } break;
    case "kcnext": Course.kcNext(); break;
    case "kcretry": Course.kcRetry(); break;
    case "labrun": Labs.drawStop(true); break;
    case "rtpad": Labs.rtPress(); break;
    case "engplay": Labs.engPlay(); break;
    case "engstep": Labs.engStep(); break;
    case "hzstart": Hazard.start(); break;
    case "hzplay": Hazard.playClick(); break;
    case "hzreplay": Hazard.replay(); break;
    case "hzcam": Hazard.cam(ds.k || "drive"); break;
    case "hzcat": Hazard.filter(ds.k || ""); break;
    case "spOpen": Learn.closeSheet(); go("#limits"); break;
    case "spRegion": case "spVeh": case "spRoad": case "spCell": SpeedLimits.act(ds.act, ds.k || ""); break;
    default: if (ds.act && ds.act.startsWith("lab.")) Labs.act(ds.act.slice(4), t);
  }
});

document.addEventListener("keydown", (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing && !Search.isOpen())) {
    e.preventDefault(); Search.open(); return;
  }
  if (e.key === "Escape" && !document.getElementById("pwaSheet").hidden) { Pwa.closeHelp(); return; }
  if (Search.isOpen()) { if (e.key === "Escape") Search.close(); return; }
  if (e.key === "Escape") closeMore();
  const sheet = document.getElementById("sheet");
  if (!sheet.hidden) {
    if (e.key === "Escape") Learn.closeSheet();
    if (e.key === "ArrowRight") Learn.sheetNav(1);
    if (e.key === "ArrowLeft") Learn.sheetNav(-1);
    return;
  }
  const am = document.getElementById("amodal");
  if (!am.hidden && e.key === "Escape") { Auth.closeModal(); return; }
  // SVG hotspots (vehicle explorer) act like buttons
  if ((e.key === "Enter" || e.key === " ") && e.target && e.target.dataset && e.target.dataset.part && e.target.tagName.toLowerCase() === "g") {
    e.preventDefault(); Vehicle.selectPart(e.target.dataset.part); return;
  }
  if (S.view === "science" && S.param === "reaction" && e.key === " " && !typing && e.target.tagName !== "BUTTON") { e.preventDefault(); Labs.rtPress(); return; }
  if (S.view === "cards" && S.cards && S.cards.i < S.cards.q.length) {
    if (e.key === " " || e.key === "Enter") {
      if (e.target.tagName !== "BUTTON") { e.preventDefault(); S.cards.flip = !S.cards.flip; Quiz.cardsView(document.getElementById("app")); }
    }
  }
});

function onNav() {
  if (curRoute() === lastRoute && !isRouteHash(location.hash)) return;
  route().then(() => {
    if (S.view === "ask" && Instructor.pending) { const q = Instructor.pending; Instructor.pending = null; setTimeout(() => Instructor.send(q), 50); }
  });
}
window.addEventListener("hashchange", () => { if (isRouteHash(location.hash)) onNav(); });
window.addEventListener("popstate", () => { if (!isRouteHash(location.hash)) onNav(); });

window.addEventListener("visibilitychange", () => {
  if (document.hidden && Auth.putTimer) { clearTimeout(Auth.putTimer); Auth.putToServer(); }
});
window.addEventListener("pagehide", saveLocal);

/* ---------- boot ---------- */
/* startup splash: let the intro finish (≈1.5 s), then lift it off */
window.hideSplash = () => {
  const el = document.getElementById("splash");
  if (!el || el.classList.contains("out")) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wait = Math.max(0, (reduced ? 3000 : 4550) - (Date.now() - (window.__splashT0 || 0)));
  setTimeout(() => {
    el.classList.add("out");
    document.documentElement.classList.remove("splashing");
    setTimeout(() => el.remove(), reduced ? 200 : 650);
  }, wait);
};

(async function boot() {
  const app = document.getElementById("app");
  // the server-rendered page for this URL; static pages reuse it as-is
  StaticPage.keep(location.pathname, app.innerHTML);
  const ql = new URLSearchParams(location.search).get("lang");
  if (ql === "ml" || ql === "en") { P.lang = ql; save(); }
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:26px;width:34%"></i><i style="height:16px"></i><i style="height:16px;width:80%"></i><i style="height:16px;width:60%"></i></div></section>`;
  try {
    await Data.loadIndex();
  } catch (e) {
    app.innerHTML = `<section class="panel"><h2>iDrive</h2><p class="muted">Failed to load content - is the server running?</p></section>`;
    window.hideSplash();
    return;
  }
  Data.ensureSvgs("all").then(() => { if (S.view === "learn") render(); }).catch(() => {});
  Course.loadOutline().catch(() => {});
  await Auth.restore();
  await route();
  window.hideSplash();
})();
})();

/* the logo's car animation is SMIL; honour reduced-motion by freezing it */
(function logoMotion() {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const apply = () => document.querySelectorAll("svg.bmark,svg.slock").forEach((s) => {
    if (!s.pauseAnimations) return;
    if (mq.matches) { s.pauseAnimations(); s.setCurrentTime && s.setCurrentTime(0.4); } else s.unpauseAnimations();
  });
  apply();
  if (mq.addEventListener) mq.addEventListener("change", apply);
})();
