/* iDrive course.js — Home, curriculum outline, module pages, lesson reader,
   knowledge checks and the revision queue. Content comes from
   /api/curriculum/*; nothing educational is hard-coded here. */
(() => {
"use strict";
const C = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);   // strings are escaped; [en, ml] pairs render bilingually

/* ---------- data ---------- */
C.outline = null;
C.lessons = {};
C.lib = {};
C.loadOutline = async () => {
  if (C.outline) return C.outline;
  C.outline = await Api.get("/api/curriculum");
  C.modById = Object.fromEntries(C.outline.modules.map(m => [m.id, m]));
  C.lessonMeta = {};
  for (const m of C.outline.modules) for (const c of m.chapters) for (const it of c.items)
    if (it.type === "lesson") C.lessonMeta[it.id] = { ...it, module: m.id, chapter: c.title };
  return C.outline;
};
C.lesson = async (id) => {
  if (!C.lessons[id]) C.lessons[id] = await Api.get("/api/curriculum/lessons/" + encodeURIComponent(id));
  return C.lessons[id];
};
C.library = async (name) => {
  if (!C.lib[name]) C.lib[name] = await Api.get("/api/library/" + name);
  return C.lib[name];
};

/* ---------- progress helpers (extend the P blob; merge rules in auth.js) ---------- */
const today = () => new Date().toISOString().slice(0, 10);
C.touchDay = () => { P.days = P.days || {}; P.days[today()] = 1; };
C.done = (id) => !!((P.les || {})[id] && P.les[id].d);
C.score = (id) => ((P.les || {})[id] || {}).s || 0;
C.bookmarked = (id) => ((P.bm || {})[id] || 0) > 0;
C.toggleBookmark = (id) => {
  P.bm = P.bm || {};
  const now = Date.now();
  P.bm[id] = C.bookmarked(id) ? -now : now;   // sign = state, |ts| = recency (merge keeps latest)
  save();
};
C.markRecent = (id) => {
  P.rec = [id, ...(P.rec || []).filter(x => x !== id)].slice(0, 8);
};
C.moduleStats = (m) => {
  const ids = [];
  for (const c of m.chapters) for (const it of c.items) if (it.type === "lesson") ids.push(it.id);
  const done = ids.filter(C.done).length;
  return { ids, done, total: ids.length, pct: ids.length ? Math.round(done / ids.length * 100) : 0 };
};
C.nextLesson = () => {
  const order = (C.outline || {}).lessonOrder || [];
  return order.find(id => !C.done(id)) || null;
};
C.streak = () => {
  const days = P.days || {};
  let n = 0;
  const d = new Date();
  if (!days[d.toISOString().slice(0, 10)]) d.setDate(d.getDate() - 1);
  while (days[d.toISOString().slice(0, 10)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
};
C.LEVELS = ["lvBeginner", "lvFoundation", "lvIntermediate", "lvAdvanced", "lvMastery"];
C.level = () => {
  const order = (C.outline || {}).lessonOrder || [];
  const frac = order.length ? order.filter(C.done).length / order.length : 0;
  const mocks = (P.mock || {}).passed || 0;
  const hz = Object.values(P.hz || {}).filter(v => v > 0).length;
  if (frac >= 1 && mocks >= 3 && hz >= 6) return 4;
  if (frac >= .75 && mocks >= 1) return 3;
  if (frac >= .5) return 2;
  if (frac >= .2) return 1;
  return 0;
};

/* ---------- shared bits ---------- */
const ICONS = {
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M4 11h11M15 8l3 3v7a2 2 0 0 0 4 0V9l-3-3"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
  mountain: '<path d="M3 20l7-12 4 6 2-3 5 9z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h5l3 3v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 7 18z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  engine: '<path d="M4 10h3l2-3h6l2 3h3v7h-3l-2 2H9l-2-2H4z"/><path d="M2 12v3M22 12v3"/>',
  gauge: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="M12 18l4-6"/>',
  sign: '<path d="M12 3l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  law: '<path d="M12 3v18M5 7h14M7 7l-3 7a3 3 0 0 0 6 0zM17 7l-3 7a3 3 0 0 0 6 0z"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 3v6.5M4.5 16.5l5.4-3M19.5 16.5l-5.4-3"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-3-3z"/>',
  alert: '<path d="M12 3l9 16H3z"/><path d="M12 9v5M12 17h.01"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  badge: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M6 16c.6-1.6 1.7-2.4 3-2.4s2.4.8 3 2.4M14 10h4M14 13h3"/>',
};
C.icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[k] || ICONS.key}</svg>`;
C.ring = (pct, accent, size = 46) => {
  const r = (size - 6) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ringbg"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ringfg" style="stroke:${accent}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - pct / 100)).toFixed(1)}" data-c="${c.toFixed(1)}" data-pct="${pct}"/></svg>`;
};
const TYPE_KEY = { lesson: "itLesson", article: "itArticle", lab: "itLab", scenario: "itScenario", library: "itLibrary", signs: "itSigns", practice: "itPractice", exam: "itExam" };
C.itemHref = (it) => {
  const id = it.id;
  switch (it.type) {
    case "lesson": return "#lesson/" + id;
    case "article": return "#theory/" + id;
    case "lab": return "#science/" + id;
    case "scenario": return "#hazard/" + id;
    case "library": return id === "lights" ? "#vehicle/lights" : id === "speed-limits" ? "#limits" : "#vehicle/explore";
    case "signs": return "#learn/" + id;
    case "practice": return id === "signs" ? "#quiz" : "#exam/practice/" + id;
    case "exam": return "#exam";
  }
  return "#course";
};
C.itemRow = (it) => {
  const done = it.type === "lesson" && C.done(it.id);
  const meta = it.type === "lesson" ? `${it.minutes} ${u("min")} · ${u(it.level)}` : u(TYPE_KEY[it.type] || "itLesson");
  return `<a class="irow ${done ? "done" : ""}" href="${C.itemHref(it)}"><span class="ibadge t-${it.type}" aria-hidden="true"></span><span class="itxt"><b>${e(it.title)}</b><small>${e(meta)}</small></span>${done ? `<span class="ok" aria-label="${I18n.attr(u("completed"))}">✓</span>` : '<span class="chev" aria-hidden="true">›</span>'}</a>`;
};
C.crumbs = (parts) => `<nav class="crumbs" aria-label="${I18n.attr(u("breadcrumb"))}">${parts.map((p, i) => i < parts.length - 1 ? `<a href="${p[1]}">${esc(I18n.one(p[0]))}</a><span aria-hidden="true">/</span>` : `<span aria-current="page">${esc(I18n.one(p[0]))}</span>`).join("")}</nav>`;
const fail = (app) => { app.innerHTML = `<section class="panel"><p class="empty">${e(u("networkErr"))}</p></section>`; };
const skel = (app) => { app.innerHTML = `<section class="panel"><div class="skel"><i style="height:26px;width:40%"></i><i style="height:14px"></i><i style="height:14px;width:80%"></i><i style="height:14px;width:60%"></i></div></section>`; };

/* ---------- Home ---------- */
C.home = async (app) => {
  skel(app);
  try { await C.loadOutline(); } catch (err) { fail(app); return; }
  if (S.view !== "home") return;
  const o = C.outline, nx = C.nextLesson(), lv = C.level();
  const doneN = o.lessonOrder.filter(C.done).length;
  const pct = o.lessonOrder.length ? Math.round(doneN / o.lessonOrder.length * 100) : 0;
  const nxm = nx ? C.lessonMeta[nx] : null;
  const recent = (P.rec || []).filter(id => C.lessonMeta[id]).slice(0, 3);
  const feats = [
    ["#vehicle/explore", "engine", "fVehicle", "fVehicleSub"],
    ["#vehicle/lights", "gauge", "fLights", "fLightsSub"],
    ["#science/stopping", "atom", "fLab", "fLabSub"],
    ["#hazard", "eye", "fHazard", "fHazardSub"],
    ["#exam", "badge", "fExam", "fExamSub"],
    ["#ask", "brain", "fAsk", "fAskSub"],
  ];
  app.innerHTML = `
  <section class="hero2 rvl">
    <div class="herotxt">
      <span class="eyebrow">${e(u("heroEyebrow"))}</span>
      <h1 class="htitle">${e(u("heroTitle"))}</h1>
      <p class="lede">${e(u("heroLede", { m: o.counts.modules, l: o.counts.lessons }))}</p>
      <div class="row">
        <a class="btn primary mag" href="${nx ? "#lesson/" + nx : "#course"}">${e(nx && doneN ? u("continue") : u("startLearning"))} →</a>
        <a class="btn ghost" href="#course">${e(u("seeCurriculum"))}</a>
      </div>
    </div>
    <div class="heroAnim" id="heroAnim" aria-hidden="true"></div>
  </section>
  <section class="statrow rvl">
    <div class="stile">${C.ring(pct, "var(--acc2)", 58)}<div><b><span id="hPct">0</span>%</b><span>${e(u("curriculumDone"))}</span></div></div>
    <div class="stile"><div class="bignum" id="hStreak">0</div><div><b>${e(u("dayStreak"))}</b><span>${e(u("streakSub"))}</span></div></div>
    <div class="stile"><div class="lvpill">${lv + 1}/5</div><div><b>${e(u(C.LEVELS[lv]))}</b><span>${e(u("levelSub"))}</span></div></div>
  </section>
  ${Pwa.cardHtml()}
  ${nxm ? `<a class="nextcard rvl" href="#lesson/${nx}" style="--accent:${C.modById[nxm.module].accent}"><span class="eyebrow">${e(doneN ? u("upNext") : u("startHere"))} · ${e(u("moduleN", { n: C.modById[nxm.module].n }))}</span><b>${e(nxm.title)}</b><small>${e(nxm.chapter)} · ${nxm.minutes} ${e(u("min"))}</small></a>` : ""}
  ${recent.length ? `<section class="rvl"><h3 class="lab">${e(u("recent"))}</h3><div class="ilist">${recent.map(id => C.itemRow({ type: "lesson", ...C.lessonMeta[id] })).join("")}</div></section>` : ""}
  <section class="rvl"><h3 class="lab">${e(u("explore"))}</h3><div class="feat">${feats.map(f => `<a class="fcard tiltc" href="${f[0]}"><span class="fi">${C.icon(f[1])}</span><b>${e(u(f[2]))}</b><small>${e(u(f[3]))}</small></a>`).join("")}</div></section>
  <section class="rvl"><h3 class="lab">${e(u("curriculum"))}</h3>${C.modGrid()}</section>`;
  Motion.roadScene(document.getElementById("heroAnim"));
  Motion.countTo(document.getElementById("hPct"), pct);
  Motion.countTo(document.getElementById("hStreak"), C.streak());
  Motion.rings(app);
  Motion.reveal(app);
};

C.modGrid = () => `<div class="modgrid">${C.outline.modules.map(m => {
  const st = C.moduleStats(m);
  return `<a class="modcard tiltc" href="#course/${m.id}" style="--accent:${m.accent}"><span class="mhead"><span class="mi">${C.icon(m.icon)}</span>${C.ring(st.pct, m.accent, 40)}</span><span class="mn">${e(u("moduleN", { n: m.n }))} · ${e(u(m.level))}</span><b>${e(m.title)}</b><small>${e(m.summary)}</small><span class="mfoot">${st.done}/${st.total} ${e(u("lessonsL"))} · ${m.minutes} ${e(u("min"))}</span></a>`;
}).join("")}</div>`;

/* ---------- Course outline / module ---------- */
C.course = async (app) => {
  skel(app);
  try { await C.loadOutline(); } catch (err) { fail(app); return; }
  if (S.view !== "course") return;
  const mid = S.param;
  if (mid === "review") { C.review(app); return; }
  if (mid && C.modById[mid]) { C.moduleView(app, C.modById[mid]); return; }
  const rq = Object.keys(P.rq || {}).length;
  app.innerHTML = `${C.crumbs([[u("home"), "#home"], [u("tCourse"), "#course"]])}
  <section class="panel rvl"><h2>${e(u("curriculum"))}</h2><p class="lede">${e(u("courseLede"))}</p>
  <div class="levels">${C.LEVELS.map((k, i) => `<span class="lvl ${i <= C.level() ? "on" : ""}">${e(u(k))}</span>`).join('<i aria-hidden="true">→</i>')}</div>
  ${rq ? `<div class="row"><a class="btn" href="#course/review">↻ ${e(u("reviewN", { n: rq }))}</a></div>` : ""}</section>
  ${C.modGrid()}`;
  Motion.rings(app);
  Motion.reveal(app);
};

C.moduleView = (app, m) => {
  const st = C.moduleStats(m);
  const i = C.outline.modules.indexOf(m);
  const pv = C.outline.modules[i - 1], nx = C.outline.modules[i + 1];
  app.innerHTML = `${C.crumbs([[u("home"), "#home"], [u("tCourse"), "#course"], [u("moduleN", { n: m.n }), "#course/" + m.id]])}
  <section class="panel mhero rvl" style="--accent:${m.accent}"><div class="mhrow"><span class="mi big">${C.icon(m.icon)}</span><div><span class="eyebrow">${e(u("moduleN", { n: m.n }))} · ${e(u(m.level))}</span><h2>${e(m.title)}</h2></div>${C.ring(st.pct, m.accent, 64)}</div>
  <p class="lede">${e(m.summary)}</p><p class="muted">${st.done}/${st.total} ${e(u("lessonsL"))} · ${m.minutes} ${e(u("min"))}</p></section>
  ${m.chapters.map((c, ci) => `<section class="panel chap rvl"><h3 class="sh"><span class="cn">${ci + 1}</span>${e(c.title)}</h3><div class="ilist">${c.items.map(C.itemRow).join("")}</div></section>`).join("")}
  <div class="pn">${pv ? `<a class="btn" href="#course/${pv.id}">← ${e(pv.title)}</a>` : "<span></span>"}${nx ? `<a class="btn" href="#course/${nx.id}">${e(nx.title)} →</a>` : ""}</div>`;
  Motion.rings(app);
  Motion.reveal(app);
};

/* ---------- Lesson reader ---------- */
const NOTE_KEY = { safety: "noteSafety", law: "noteLaw", tip: "noteTip", model: "noteModel" };
C.lessonView = async (app) => {
  const id = S.param;
  skel(app);
  let p;
  try { await C.loadOutline(); p = await C.lesson(id); }
  catch (err) { if (err.status === 404) { app.innerHTML = `<section class="panel"><p class="empty">${e(u("notFound"))}</p><a class="btn" href="#course">${e(u("tCourse"))}</a></section>`; return; } fail(app); return; }
  if (S.view !== "lesson" || S.param !== id) return;
  const L = p.lesson, M = p.module, mod = C.modById[M.id];
  C.markRecent(id); saveLocal();
  const sec = (s, i) => `<section class="panel lsec rvl" id="s${i}"><h3 class="sh">${e(s.h)}</h3>${s.p.map(x => `<p>${e(x)}</p>`).join("")}${s.steps.length ? `<ol class="steps">${s.steps.map(x => `<li>${e(x)}</li>`).join("")}</ol>` : ""}${s.note ? `<aside class="lnote n-${s.note.kind}"><b>${e(u(NOTE_KEY[s.note.kind]))}</b><p>${e(s.note.text)}</p></aside>` : ""}</section>`;
  const list = (k, arr, cls) => arr && arr.length ? `<section class="panel ${cls} rvl"><h3 class="lab">${e(u(k))}</h3><ul>${arr.map(x => `<li>${e(x)}</li>`).join("")}</ul></section>` : "";
  const demo = L.lab ? `<a class="democard rvl" href="#science/${L.lab}"><span class="fi">${C.icon("atom")}</span><span><b>${e(u("tryLab"))}</b><small>${e(u("lab_" + L.lab))}</small></span><span class="chev">›</span></a>`
    : L.scenario ? `<a class="democard rvl" href="#hazard/${L.scenario}"><span class="fi">${C.icon("eye")}</span><span><b>${e(u("tryScenario"))}</b><small>${e(u("fHazardSub"))}</small></span><span class="chev">›</span></a>` : "";
  const toc = L.sections.map((s, i) => `<a href="#lesson/${id}" data-toc="s${i}">${e(s.h)}</a>`).join("");
  const bm = C.bookmarked(id);
  app.innerHTML = `${C.crumbs([[u("tCourse"), "#course"], [u("moduleN", { n: M.n }) + " · " + I18n.one(M.title), "#course/" + M.id], [L.title, "#lesson/" + id]])}
  <div class="lgrid">
  <aside class="ltoc" aria-label="${I18n.attr(u("onThisPage"))}"><h3 class="lab">${e(u("onThisPage"))}</h3>${toc}<a href="#lesson/${id}" data-toc="kc">${e(u("knowledgeCheck"))}</a></aside>
  <article class="lmain">
  <section class="panel lhead rvl" style="--accent:${M.accent}">
    <div class="lmeta"><span class="tagc">${e(u(L.level))}</span><span class="tagc">${L.minutes} ${e(u("min"))}</span>${C.done(id) ? `<span class="tagc good">✓ ${e(u("completed"))}</span>` : ""}
      <button class="iconbtn ${bm ? "on" : ""}" data-act="bookmark" data-id="${id}" aria-pressed="${bm}" aria-label="${I18n.attr(u(bm ? "unbookmark" : "bookmark"))}" title="${I18n.attr(u(bm ? "unbookmark" : "bookmark"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z" fill="${bm ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg></button></div>
    <h2>${e(L.title)}</h2>
    <p class="lede">${e(L.intro)}</p>
    <div class="objs"><h3 class="lab">${e(u("objectives"))}</h3><ul>${L.objectives.map(x => `<li>${e(x)}</li>`).join("")}</ul></div>
  </section>
  ${demo}
  ${L.sections.map(sec).join("")}
  ${L.terms.length ? `<section class="panel rvl"><h3 class="lab">${e(u("terms"))}</h3><dl class="terms">${L.terms.map(t => `<div><dt>${e(t[0])}</dt><dd>${e(t[1])}</dd></div>`).join("")}</dl></section>` : ""}
  ${list("examples", L.examples, "exs")}
  ${(L.mistakes.length || L.safety.length) ? `<div class="dd rvl">${L.mistakes.length ? `<div class="dont"><h4>✗ ${e(u("mistakes"))}</h4><ul>${L.mistakes.map(x => `<li>${e(x)}</li>`).join("")}</ul></div>` : ""}${L.safety.length ? `<div class="do"><h4>⚑ ${e(u("safetyH"))}</h4><ul>${L.safety.map(x => `<li>${e(x)}</li>`).join("")}</ul></div>` : ""}</div>` : ""}
  ${L.deep ? `<details class="primer deep rvl"><summary>${e(u("deepDive"))}</summary><div class="lbody"><p>${e(L.deep)}</p></div></details>` : ""}
  <section class="panel kc rvl" id="kc"><h3 class="sh">${e(u("knowledgeCheck"))}</h3><p class="muted">${e(u("kcLede"))}</p><div id="kcBody"></div></section>
  ${p.related.length ? `<section class="panel rvl"><h3 class="lab">${e(u("related"))}</h3><div class="ilist">${p.related.map(C.itemRow).join("")}</div></section>` : ""}
  ${p.references.length ? `<section class="panel refs rvl"><h3 class="lab">${e(u("references"))}</h3><ul>${p.references.map(r => `<li><a href="${e(r.url)}" target="_blank" rel="noopener noreferrer">${e(r.title)}</a><small>${e(r.publisher)} · ${e(u(r.scope === "kerala" ? "scopeKerala" : "scopeNational"))} · ${e(u("verifiedOn", { d: r.verified }))}${r.note ? " · " + e(r.note) : ""}</small></li>`).join("")}</ul></section>` : ""}
  <p class="muted vnote">${e(u("lessonVerified", { d: L.verified }))} ${e(u("artCheck"))}</p>
  <div class="pn">${p.prev ? `<a class="btn" href="#lesson/${p.prev}">← ${e((C.lessonMeta[p.prev] || {}).title || "")}</a>` : "<span></span>"}${p.next ? `<a class="btn primary" href="#lesson/${p.next}">${e((C.lessonMeta[p.next] || {}).title || "")} →</a>` : `<a class="btn primary" href="#course/${M.id}">${e(u("backToModule"))}</a>`}</div>
  </article></div>`;
  C.kcRender(L, id);
  Motion.reveal(app);
  Motion.tocSpy(app);
};

/* knowledge check: one question at a time, instant feedback, score saved */
C.kcState = null;
C.kcRender = (L, id) => {
  const box = document.getElementById("kcBody");
  if (!box) return;
  if (!C.kcState || C.kcState.id !== id) C.kcState = { id, L, i: 0, right: 0, picked: null, wrong: [] };
  const st = C.kcState;
  if (st.i >= L.check.length) {
    const pct = Math.round(st.right / L.check.length * 100);
    const pass = pct >= 70;
    box.innerHTML = `<div class="kcdone ${pass ? "pass" : ""}"><div class="kcscore">${C.ring(pct, pass ? "var(--good)" : "var(--bad)", 72)}<b>${st.right}/${L.check.length}</b></div><div><h4>${e(u(pass ? "kcPass" : "kcRetry"))}</h4><p class="muted">${e(u(pass ? "kcPassSub" : "kcRetrySub"))}</p><div class="row"><button class="btn" data-act="kcretry">${e(u("tryAgain"))}</button>${pass && C.kcState.next !== undefined ? "" : ""}</div></div></div>`;
    Motion.rings(box);
    if (pass) Motion.confetti();
    return;
  }
  const q = L.check[st.i];
  const answered = st.picked !== null;
  box.innerHTML = `<div class="kcq"><span class="muted">${e(u("qOf", { i: st.i + 1, n: L.check.length }))}</span><p class="kcp">${e(q.q)}</p>
  <div class="opts">${q.o.map((o, j) => {
    let cls = "";
    if (answered) cls = j === q.a ? "right" : (j === st.picked ? "wrong" : "dim");
    return `<button class="opt ${cls}" data-kc="${j}" ${answered ? "disabled" : ""}>${e(o)}</button>`;
  }).join("")}</div>
  ${answered ? `<div class="fb ${st.picked === q.a ? "ok" : "no"}"><b>${e(u(st.picked === q.a ? "right" : "notQuite"))}</b> ${e(q.r)}${st.picked !== q.a ? `<span class="en">${e(u("addedReview"))}</span>` : ""}</div><div class="row"><button class="btn primary" data-act="kcnext">${e(u(st.i + 1 < L.check.length ? "next" : "seeScore"))}</button></div>` : ""}</div>`;
};
C.kcAnswer = (j) => {
  const st = C.kcState;
  if (!st || st.picked !== null) return;
  const q = st.L.check[st.i];
  st.picked = j;
  const key = st.id + "#" + st.i;
  P.rq = P.rq || {};
  if (j === q.a) { st.right++; if (P.rq[key]) { P.rq[key] -= 1; if (P.rq[key] <= 0) delete P.rq[key]; } }
  else { st.wrong.push(st.i); P.rq[key] = Math.min(3, (P.rq[key] || 0) + 1); }
  C.kcRender(st.L, st.id);
  const el = document.querySelector(`[data-kc="${j}"]`);
  if (j === q.a) Motion.pop(el); else Motion.shake(el);
};
C.kcNext = () => {
  const st = C.kcState; if (!st) return;
  st.i++; st.picked = null;
  if (st.i >= st.L.check.length) {
    const pct = Math.round(st.right / st.L.check.length * 100);
    P.les = P.les || {};
    const prev = P.les[st.id] || {};
    P.les[st.id] = { d: pct >= 70 ? (prev.d || Date.now()) : (prev.d || 0), s: Math.max(prev.s || 0, pct), n: (prev.n || 0) + 1 };
    if (pct >= 70 && !prev.d) if (window.Analytics) Analytics.event("lesson_complete", { lesson_id: st.id, score: pct });
    C.touchDay();
    save();
  }
  C.kcRender(st.L, st.id);
};
C.kcRetry = () => { if (C.kcState) { C.kcState = { ...C.kcState, i: 0, right: 0, picked: null, wrong: [] }; C.kcRender(C.kcState.L, C.kcState.id); } };

/* ---------- revision queue (spaced: each miss adds weight, each hit removes) ---------- */
C.review = async (app) => {
  const keys = Object.keys(P.rq || {}).sort((a, b) => P.rq[b] - P.rq[a]).slice(0, 10);
  if (!keys.length) {
    app.innerHTML = `${C.crumbs([[u("tCourse"), "#course"], [u("review"), "#course/review"]])}<section class="panel"><h2>${e(u("review"))}</h2><p class="muted">${e(u("reviewEmpty"))}</p><a class="btn primary" href="#course">${e(u("tCourse"))}</a></section>`;
    return;
  }
  const ids = [...new Set(keys.map(k => k.split("#")[0]))];
  try { await Promise.all(ids.map(C.lesson)); } catch (err) { fail(app); return; }
  if (S.view !== "course" || S.param !== "review") return;
  const qs = keys.map(k => { const [lid, qi] = k.split("#"); const q = (C.lessons[lid] || { lesson: { check: [] } }).lesson.check[+qi]; return q ? { ...q, _k: k, _lid: lid } : null; }).filter(Boolean);
  const pseudo = { check: qs };
  C.kcState = { id: "__review", L: pseudo, i: 0, right: 0, picked: null, wrong: [], review: true };
  app.innerHTML = `${C.crumbs([[u("tCourse"), "#course"], [u("review"), "#course/review"]])}<section class="panel"><h2>${e(u("review"))}</h2><p class="lede">${e(u("reviewLede"))}</p></section><section class="panel kc"><div id="kcBody"></div></section>`;
  C.kcRender(pseudo, "__review");
};
/* review answers adjust the original key, not the pseudo lesson */
const _answer = C.kcAnswer;
C.kcAnswer = (j) => {
  const st = C.kcState;
  if (st && st.review) {
    if (st.picked !== null) return;
    const q = st.L.check[st.i];
    st.picked = j;
    P.rq = P.rq || {};
    if (j === q.a) { st.right++; P.rq[q._k] = (P.rq[q._k] || 1) - 1; if (P.rq[q._k] <= 0) delete P.rq[q._k]; }
    else P.rq[q._k] = Math.min(3, (P.rq[q._k] || 0) + 1);
    C.touchDay(); save();
    C.kcRender(st.L, st.id);
    return;
  }
  _answer(j);
};
const _next = C.kcNext;
C.kcNext = () => {
  const st = C.kcState;
  if (st && st.review) { st.i++; st.picked = null; C.kcRender(st.L, st.id); return; }
  _next();
};

/* time-on-task: counted only while a learning view is visible */
setInterval(() => {
  if (document.hidden || !window.S) return;
  if (["lesson", "course", "science", "hazard", "vehicle", "theory"].includes(S.view)) { P.secs = (P.secs || 0) + 15; saveLocal(); }
}, 15000);

window.Course = C;
})();
