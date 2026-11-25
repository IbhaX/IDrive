/* IDrive app.js — shell: progress state, tabs, hash routing, event
   delegation, keyboard, boot. Mirrors the source app's event contract. */
(() => {
"use strict";
const PKEY = "idrive-v1";

function defaultProgress() {
  return { seen: {}, box: {}, wrong: {}, best: 0, played: 0, lang: "both", mock: { taken: 0, passed: 0, best: 0 }, tq: {}, v: 1 };
}
window.defaultProgress = defaultProgress;

window.P = (() => {
  try {
    const r = localStorage.getItem(PKEY);
    if (r) return Object.assign(defaultProgress(), JSON.parse(r));
  } catch (e) {}
  return defaultProgress();
})();

window.S = { view: "learn", cat: "all", q: "", list: [], quiz: null, quizCat: "all", quizLen: 10, cards: null, cardCat: "all", exam: null, art: null, gq: "" };

function saveLocal() { try { localStorage.setItem(PKEY, JSON.stringify(P)); } catch (e) {} }
window.saveLocal = saveLocal;
function save() { P.v = (P.v || 0) + 1; saveLocal(); Auth.queuePut(); }
window.save = save;

/* progress helpers — same semantics as the source (Leitner boxes 0-4) */
window.box = (id) => (P.box || {})[id] || 0;
window.setBox = (id, v) => { P.box[id] = Math.max(0, Math.min(4, v)); P.seen[id] = 1; };
window.shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- shell ---------- */
const TABS = [
  { id: "learn", k: "tLearn", icon: '<path d="M3 4h7v7H3zM14 4h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' },
  { id: "theory", k: "tTheory", icon: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 8h6M9 12h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' },
  { id: "exam", k: "tExam", icon: '<rect x="5" y="4" width="14" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' },
  { id: "quiz", k: "tQuiz", icon: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
  { id: "progress", k: "tProg", icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
];
const LANGS = [["en", "English"], ["ml", "മലയാളം"], ["both", "EN + മലയാളം"]];

const tabHtml = () => TABS.map(t =>
  `<a href="#${t.id}" ${(t.id === S.view || (S.view === "cards" && t.id === "quiz")) ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg>${esc(I18n.u(t.k))}</a>`).join("");
const langHtml = () => LANGS.map(l =>
  `<button class="lg ${I18n.lang() === l[0] ? "on" : ""}" data-lang="${l[0]}" aria-pressed="${I18n.lang() === l[0]}">${l[1]}</button>`).join("");

/* theme: dark is the Aurora default; "light" sets data-theme=light */
const SUN = '<circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5 5l1.8 1.8M17.2 17.2 19 19M19 5l-1.8 1.8M6.8 17.2 5 19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
const MOON = '<path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
function isLight() { return document.documentElement.dataset.theme === "light"; }
function applyThemeIcon() {
  const ico = document.getElementById("themeIco"), btn = document.getElementById("themeBtn");
  if (!ico) return;
  ico.innerHTML = isLight() ? MOON : SUN;
  btn.setAttribute("aria-label", I18n.u(isLight() ? "themeDark" : "themeLight"));
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.content = isLight() ? "#eef0f7" : "#06080f";
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
  document.getElementById("subline").textContent = I18n.u("sub");
  document.getElementById("foot").textContent = I18n.u("foot");
  document.getElementById("langs").innerHTML = langHtml();
  applyThemeIcon();
  const sc = document.getElementById("sClose");
  if (sc) sc.setAttribute("aria-label", I18n.u("close"));
}

function setHash(v) {
  const h = "#" + v;
  if (location.hash !== h) history.replaceState(null, "", h);
}
window.setHash = setHash;

function viewFromHash() {
  const h = (location.hash || "#learn").slice(1);
  return (TABS.some(t => t.id === h) || h === "cards") ? h : "learn";
}

/* ---------- render ---------- */
const VIEWS = {
  learn: (app) => Learn.view(app),
  theory: (app) => Theory.view(app),
  exam: (app) => Exam.view(app),
  quiz: (app) => Quiz.view(app),
  cards: (app) => Quiz.cardsView(app),
  progress: (app) => Progress.view(app),
};

function render() {
  Exam.stopTimer();
  // leaving the exam tab mid-mock pauses the question timer, like the source
  const ex = S.exam;
  if (S.view !== "exam" && ex && ex.mode === "mock" && ex.stage === "play" && ex.pausedLeft == null)
    ex.pausedLeft = Math.max(0, ex.deadline - Date.now());
  document.getElementById("tabsTop").innerHTML = tabHtml();
  document.getElementById("dockin").innerHTML = tabHtml();
  applyStatic();
  Auth.renderChip();
  const app = document.getElementById("app");
  const r = (VIEWS[S.view] || VIEWS.learn)(app);
  if (r && r.then) r.catch(() => {});
  requestAnimationFrame(() => {
    Motion.jelly(document.getElementById("tabsTop"));
    Motion.jelly(document.getElementById("dockin"));
    Motion.langPill(document.getElementById("langs"));
    Motion.bindTilt();
  });
}
window.render = render;

/* ---------- event delegation (same contract as the source app) ---------- */
document.addEventListener("click", (e) => {
  if (e.target === document.getElementById("sheet")) { Learn.closeSheet(); return; }
  if (e.target === document.getElementById("amodal")) { Auth.closeModal(); return; }
  const t = e.target.closest("[data-go],[data-art],[data-etopic],[data-ans],[data-lang],[data-open],[data-act],[data-cat],[data-qcat],[data-qlen],[data-ccat],[data-opt],[data-amode],#sClose");
  if (!t) return;
  if (t.id === "sClose") { Learn.closeSheet(); return; }
  const ds = t.dataset;
  if (ds.go) { S.view = ds.go.slice(1); setHash(S.view); render(); return; }
  if (ds.art !== undefined) { S.art = ds.art || null; render(); window.scrollTo(0, 0); return; }
  if (ds.etopic) { Exam.startPractice(ds.etopic); return; }
  if (ds.ans !== undefined) { Exam.select(+ds.ans); return; }
  if (ds.lang) { P.lang = ds.lang; save(); render(); if (!document.getElementById("sheet").hidden) Learn.renderSheet(); return; }
  if (ds.open) {
    const solo = ds.solo || ds.today;
    Learn.openSheet(ds.open, solo ? [ds.open] : (S.view === "learn" ? S.list : null));
    return;
  }
  if (ds.cat) { S.cat = ds.cat; Learn.renderGrid(); return; }
  if (ds.qcat) { S.quizCat = ds.qcat; Quiz.view(document.getElementById("app")); return; }
  if (ds.qlen) { S.quizLen = +ds.qlen; Quiz.view(document.getElementById("app")); return; }
  if (ds.ccat) { S.cardCat = ds.ccat; S.cards = null; Quiz.cardsView(document.getElementById("app")); return; }
  if (ds.opt !== undefined) { Quiz.answer(+ds.opt); return; }
  if (ds.amode) { Auth.openModal(ds.amode); return; }
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
      Data.ensureSvgs("all").then(() => { S.view = "cards"; setHash("cards"); render(); });
      break;
    }
    case "reviseWeak": {
      Quiz.buildCards(Data.D.filter(d => P.wrong[d.id]).sort((a, b) => P.wrong[b.id] - P.wrong[a.id]).slice(0, 8).map(d => d.id));
      Data.ensureSvgs("all").then(() => { S.view = "cards"; setHash("cards"); render(); });
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
    case "reset0": render(); break;
    case "signin": Auth.openModal("login"); break;
    case "theme": toggleTheme(); break;
    case "account": if (confirm(I18n.u("signOut") + "?")) Auth.signOut(); break;
  }
});

document.addEventListener("keydown", (e) => {
  const sheet = document.getElementById("sheet");
  if (!sheet.hidden) {
    if (e.key === "Escape") Learn.closeSheet();
    if (e.key === "ArrowRight") Learn.sheetNav(1);
    if (e.key === "ArrowLeft") Learn.sheetNav(-1);
    return;
  }
  const am = document.getElementById("amodal");
  if (!am.hidden && e.key === "Escape") { Auth.closeModal(); return; }
  if (S.view === "cards" && S.cards && S.cards.i < S.cards.q.length) {
    if (e.key === " " || e.key === "Enter") {
      if (e.target.tagName !== "BUTTON") { e.preventDefault(); S.cards.flip = !S.cards.flip; Quiz.cardsView(document.getElementById("app")); }
    }
  }
});

window.addEventListener("hashchange", () => {
  const v = viewFromHash();
  if (v !== S.view) { S.view = v; render(); }
});

window.addEventListener("visibilitychange", () => {
  if (document.hidden && Auth.putTimer) { clearTimeout(Auth.putTimer); Auth.putToServer(); }
});
window.addEventListener("pagehide", saveLocal);

/* ---------- boot ---------- */
(async function boot() {
  S.view = viewFromHash();
  const app = document.getElementById("app");
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:26px;width:34%"></i><i style="height:16px"></i><i style="height:16px;width:80%"></i><i style="height:16px;width:60%"></i></div></section>`;
  try {
    await Data.loadIndex();
  } catch (e) {
    app.innerHTML = `<section class="panel"><h2>IDrive</h2><p class="muted">Failed to load content — is the server running?</p></section>`;
    return;
  }
  Data.ensureSvgs("all").catch(() => {});
  await Auth.restore();
  render();
})();
})();
