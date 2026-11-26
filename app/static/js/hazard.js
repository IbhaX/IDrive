/* iDrive hazard.js — interactive hazard-perception scenarios.
   Top-down animated scene → pause → tap the hazard → choose a response →
   explanation + outcome animation. Scenes are data (scenarios.json). */
(() => {
"use strict";
const H = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);   // strings are escaped; [en, ml] pairs render bilingually

H.view = async (app) => {
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:240px"></i></div></section>`;
  let d;
  try { d = await Course.library("scenarios"); } catch (err) { app.innerHTML = `<p class="empty">${e(u("networkErr"))}</p>`; return; }
  if (S.view !== "hazard") return;
  H.all = d.scenarios;
  const s = H.all.find(x => x.id === S.param);
  if (s) { H.play(app, s); return; }
  H.index(app);
};
H.CATS = ["ped", "two", "junc", "hwy", "heavy", "rural", "wx", "town"];
H.cat = "";
H.index = (app) => {
  const score = H.all.filter(x => (P.hz || {})[x.id] > 0).length;
  const n = (c) => H.all.filter(x => x.cat === c).length;
  const chip = (c, label, cnt) => `<button class="chip${H.cat === c ? " on" : ""}" data-act="hzcat" data-k="${c}" aria-pressed="${H.cat === c}">${e(label)} <small>${cnt}</small></button>`;
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tHazard"), "#hazard"]])}
  <section class="panel rvl"><h2>${e(u("hazTitle"))}</h2><p class="lede">${e(u("hazLede"))}</p><p class="muted">${e(u("hazScore", { n: score, t: H.all.length }))}</p>
  <div class="plist hzcats" role="group" aria-label="${esc(I18n.one(u("hzCats")))}">${chip("", u("hzCatAll"), H.all.length)}${H.CATS.filter(n).map(c => chip(c, u("hzCat_" + c), n(c))).join("")}</div></section>
  <div class="feat" id="hzList">${H.all.map((x, i) => {
    if (H.cat && x.cat !== H.cat) return "";
    const v = (P.hz || {})[x.id] || 0;
    const mood = x.mood ? `<span class="hzmood">${e(u("hzMood_" + x.mood))}</span>` : "";
    return `<a class="fcard tiltc rvl hz-${v >= 2 ? "perfect" : v > 0 ? "ok" : "new"}" href="#hazard/${x.id}"><span class="fi">${i + 1}</span><b>${e(x.title)}</b><small>${e(x.brief)}</small><span class="mfoot">${e(u("hzCat_" + x.cat))}${mood} · ${e(u(v >= 2 ? "hzPerfect" : v > 0 ? "hzPassed" : "hzNew"))}</span></a>`;
  }).join("")}</div>`;
  Motion.reveal(app);
};
H.filter = (c) => { H.cat = H.cat === c ? "" : c; const app = document.getElementById("app"); if (app && S.view === "hazard" && !S.param) H.index(app); };

/* ---------- scene drawing ---------- */
const road = (layout) => {
  let g = `<rect width="400" height="600" class="grass"/>`;
  g += `<rect x="60" y="0" width="40" height="600" class="walk"/><rect x="300" y="0" width="40" height="600" class="walk"/>`;
  g += `<rect x="100" y="0" width="200" height="600" class="tarmac"/>`;
  if (layout === "junction") g += `<rect x="0" y="196" width="100" height="64" class="tarmac"/><line x1="96" y1="200" x2="96" y2="256" class="giveway"/>`;
  if (layout === "dual") g += `<line x1="300" y1="0" x2="300" y2="600" class="edge"/><rect x="302" y="0" width="8" height="600" class="median"/>`;
  else g += `<line x1="200" y1="0" x2="200" y2="600" class="centre"/>`;
  g += `<g class="dashes" id="hzDash">${Array.from({ length: 10 }, (_, i) => `<rect x="${layout === "dual" ? 197 : 197}" y="${i * 80 - 80}" width="6" height="40" rx="2" class="dash ${layout === "dual" ? "" : "cdash"}"/>`).join("")}</g>`;
  if (layout === "crossing") g += `<g class="zebra">${Array.from({ length: 8 }, (_, i) => `<rect x="${104 + i * 25}" y="222" width="14" height="30" class="zb"/>`).join("")}</g><line x1="100" y1="262" x2="200" y2="262" class="stopl"/>`;
  return g;
};
/* top-down person: feet, arms, shoulders, head (hair with a sliver of face in front) */
const SHIRTS = ["#f97316", "#38bdf8", "#f43f5e", "#a3e635", "#e879f9", "#facc15", "#2dd4bf"];
const HAIR = ["#1c1917", "#292524", "#44403c", "#78716c"];
const pick = (arr, id) => arr[[...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % arr.length];
const person = (a) => {
  const kid = /^kid/.test(a.id), worker = /^w\d*$/.test(a.id);
  const shirt = a.color || (worker ? "#facc15" : pick(SHIRTS, a.id)), hair = pick(HAIR, a.id + "h");
  return `<g class="person"${kid ? ' transform="scale(.78)"' : ""}>
    <g class="pfeet"><ellipse class="pfoot pf1" cx="-3.6" cy="0" rx="2.3" ry="3.6"/><ellipse class="pfoot pf2" cx="3.6" cy="0" rx="2.3" ry="3.6"/></g>
    <ellipse class="parm pa1" cx="-10" cy="0" rx="2.6" ry="4.4" fill="${shirt}"/><ellipse class="parm pa2" cx="10" cy="0" rx="2.6" ry="4.4" fill="${shirt}"/>
    <ellipse rx="9.5" ry="5.6" fill="${shirt}" class="pbody"/>${worker ? '<path d="M-7 -2 L7 -2 M-7 2 L7 2" class="pvest"/>' : ""}
    <circle r="4.6" cy="-0.6" class="pskin"/><circle r="4.4" cy="0.4" fill="${hair}"/></g>`;
};
/* people face the way they walk; vehicles keep their set rotation */
const facing = (a, x0, y0, x1, y1) => {
  if (a.kind !== "ped") return a.rot || 0;
  const dx = x1 - x0, dy = y1 - y0;
  return Math.hypot(dx, dy) < 2 ? (a.rot || 0) : Math.atan2(dx, -dy) * 180 / Math.PI;
};
const walk = (id, on) => { const g = document.getElementById("hzA-" + id); if (g) g.classList.toggle("walking", on); };
const shape = (a) => {
  const c = a.color || "#94a3b8";
  switch (a.kind) {
    case "car": return `<rect x="-17" y="-30" width="34" height="60" rx="9" fill="${c}"/><rect x="-13" y="-18" width="26" height="14" rx="3" class="glass"/><rect x="-13" y="12" width="26" height="10" rx="3" class="glass"/><rect x="-15" y="26" width="8" height="4" rx="1" class="tail"/><rect x="7" y="26" width="8" height="4" rx="1" class="tail"/>`;
    case "truck": return `<rect x="-20" y="-50" width="40" height="100" rx="6" fill="${c}"/><rect x="-18" y="-48" width="36" height="24" rx="4" class="glass"/>`;
    case "bus": return `<rect x="-20" y="-55" width="40" height="110" rx="8" fill="${c}"/><rect x="-16" y="-50" width="32" height="12" rx="3" class="glass"/><rect x="-15" y="50" width="8" height="4" class="tail"/><rect x="7" y="50" width="8" height="4" class="tail"/>`;
    case "bike": return `<rect x="-6" y="-20" width="12" height="40" rx="6" fill="${c}"/><circle cy="-4" r="7" class="rider"/>`;
    case "ped": return person(a);
    case "cow": return `<ellipse rx="22" ry="12" class="cow"/><circle cx="-24" cy="0" r="7" class="cow"/><circle cx="6" cy="-3" r="4" class="cowspot"/>`;
    case "dog": return `<ellipse rx="12" ry="6" class="dog"/><circle cx="-13" r="4" class="dog"/>`;
    case "auto": return `<path d="M-14 -24 Q0 -34 14 -24 L15 22 Q15 26 11 26 L-11 26 Q-15 26 -15 22 Z" fill="${a.color || "#facc15"}"/><path d="M-12 -6 L12 -6 L12 22 L-12 22 Z" class="autotop"/><rect x="-10" y="-20" width="20" height="9" rx="3" class="glass"/><rect x="-12" y="23" width="6" height="3" class="tail"/><rect x="6" y="23" width="6" height="3" class="tail"/>`;
    case "cycle": return `<line x1="0" y1="-18" x2="0" y2="18" class="cyc"/><line x1="-8" y1="-12" x2="8" y2="-12" class="cyc"/><circle cy="2" r="6" class="cycr" fill="${a.color || "#22c55e"}"/>`;
    case "ball": return `<circle r="7" class="ball"/><path d="M-7 0 Q0 -4 7 0 M0 -7 Q-3 0 0 7" class="ballseam"/>`;
  }
  return "";
};
const mood = (m) => {
  if (m === "night") return `<rect width="400" height="600" class="mood mnight"/>`;
  if (m === "fog") return `<defs><linearGradient id="hzFogG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbd5e1" stop-opacity=".95"/><stop offset=".45" stop-color="#cbd5e1" stop-opacity=".7"/><stop offset=".8" stop-color="#cbd5e1" stop-opacity=".18"/><stop offset="1" stop-color="#cbd5e1" stop-opacity=".05"/></linearGradient></defs><rect width="400" height="600" fill="url(#hzFogG)" class="mood mfog"/>`;
  if (m === "rain") {
    let r = "", seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 70; i++) { const x = rnd() * 420, y = rnd() * 600; r += `<line x1="${x.toFixed(0)}" y1="${y.toFixed(0)}" x2="${(x - 6).toFixed(0)}" y2="${(y + 18).toFixed(0)}"/>`; }
    return `<rect width="400" height="600" class="mood mrainsky"/><g class="mood mrain"><g>${r}</g><g transform="translate(0,-600)">${r}</g></g>`;
  }
  return "";
};
const ego = `<g id="hzEgo" transform="translate(150,500)"><rect x="-17" y="-30" width="34" height="60" rx="9" class="egob"/><rect x="-13" y="-22" width="26" height="12" rx="3" class="glass"/><path d="M-12 -34 L-30 -150 L30 -150 L12 -34 Z" class="beam"/></g>`;
const actorG = (a, pos) => `<g class="actor" id="hzA-${a.id}" data-hz="${a.id}" tabindex="-1" role="button" aria-label="${e(u("kind_" + a.kind))}" transform="translate(${pos[0]},${pos[1]}) rotate(${facing(a, a.x, a.y, a.tx, a.ty)})">${shape(a)}<circle r="34" class="hit"/></g>`;
const place = (id, x, y, rot) => { const g = document.getElementById("hzA-" + id); if (g) g.setAttribute("transform", `translate(${x},${y}) rotate(${rot || 0})`); };

/* ---------- player ---------- */
H.st = null;
H.play = (app, s) => {
  H.st = { s, phase: "intro", spotted: null, choice: null, tl: null };
  app.innerHTML = `${Course.crumbs([[u("tHazard"), "#hazard"], [s.title, "#hazard/" + s.id]])}
  <div class="hzgrid"><section class="panel hzscene"><svg id="hzSvg" class="${s.mood ? "m-" + s.mood : ""}" viewBox="0 0 400 600" role="img" aria-label="${esc(I18n.one(s.title))}">${road(s.layout)}${s.actors.map(a => actorG(a, [a.x, a.y])).join("")}${mood(s.mood)}${ego}<rect id="hzFlash" width="400" height="600" class="flash" opacity="0"/></svg></section>
  <section class="panel hzpanel" id="hzPanel" aria-live="polite"></section></div>`;
  H.panel();
};
H.panel = () => {
  const st = H.st, s = st.s, box = document.getElementById("hzPanel");
  if (!box) return;
  if (st.phase === "intro") {
    box.innerHTML = `<span class="eyebrow">${e(u("tHazard"))}</span><h2>${e(s.title)}</h2><p class="lede">${e(s.brief)}</p><ol class="steps"><li>${e(u("hzStep1"))}</li><li>${e(u("hzStep2"))}</li><li>${e(u("hzStep3"))}</li></ol><button class="btn primary mag" data-act="hzstart">▶ ${e(u("hzStart"))}</button>`;
  } else if (st.phase === "play") {
    box.innerHTML = `<p class="lede">${e(u("hzWatch"))}</p><div class="hzbar"><i id="hzProg"></i></div>`;
  } else if (st.phase === "spot") {
    box.innerHTML = `<h3 class="sh">${e(u("hzSpot"))}</h3><p class="muted">${e(u("hzSpotSub"))}</p><div class="plist">${s.actors.filter((a, i, all) => all.findIndex(b => b.kind === a.kind) === i).map(a => `<button class="chip" data-hz="${a.id}">${e(u("kind_" + a.kind))}</button>`).join("")}</div>`;
  } else if (st.phase === "choose") {
    box.innerHTML = `${st.spotted !== null ? `<div class="fb ${st.spotted ? "ok" : "no"}">${e(u(st.spotted ? "hzSpotRight" : "hzSpotWrong", { k: u("kind_" + s.actors.find(a => a.id === s.hazard).kind) }))}</div>` : ""}<h3 class="sh">${e(s.question)}</h3><div class="opts">${s.choices.map((c, i) => `<button class="opt" data-hzc="${i}">${e(c.t)}</button>`).join("")}</div>`;
  } else {
    const c = s.choices[st.choice], right = s.choices.find(x => x.ok);
    box.innerHTML = `<div class="fb ${c.ok ? "ok" : "no"}"><b>${e(u(c.ok ? "right" : "notQuite"))}</b> ${e(c.why)}</div>
    ${c.ok ? "" : `<div class="kv"><h4>${e(u("hzSafest"))}</h4><p>${e(right.t)}</p><p class="muted">${e(right.why)}</p></div>`}
    <details class="primer"><summary>${e(u("hzWhyOthers"))}</summary><div class="lbody"><ul>${s.choices.filter(x => !x.ok && x !== c).map(x => `<li><b>${e(x.t)}</b> — ${e(x.why)}</li>`).join("")}</ul></div></details>
    <div class="row"><button class="btn" data-act="hzreplay">↻ ${e(u("tryAgain"))}</button>${H.nextId() ? `<a class="btn primary" href="#hazard/${H.nextId()}">${e(u("next"))} →</a>` : `<a class="btn primary" href="#hazard">${e(u("allScenarios"))}</a>`}${s.lesson ? `<a class="btn ghost" href="#lesson/${s.lesson}">${e(u("readLesson"))}</a>` : ""}</div>`;
  }
};
H.nextId = () => { const i = H.all.indexOf(H.st.s); return H.all[i + 1] ? H.all[i + 1].id : null; };

H.start = () => {
  const st = H.st, s = st.s, G = Motion.gsap;
  st.phase = "play"; H.panel();
  s.actors.forEach(a => place(a.id, a.x, a.y, facing(a, a.x, a.y, a.tx, a.ty)));
  const done = () => {
    s.actors.forEach(a => walk(a.id, false));
    s.actors.forEach(a => { if (a.brake) { const g = document.getElementById("hzA-" + a.id); if (g) g.classList.add("braking"); } });
    st.phase = "spot";
    document.getElementById("hzSvg").classList.add("pick");
    H.panel();
  };
  if (!G || Motion.reduced()) { s.actors.forEach(a => place(a.id, a.tx, a.ty, facing(a, a.x, a.y, a.tx, a.ty))); done(); return; }
  Motion.scoped(() => {
    const dash = document.getElementById("hzDash");
    st.dashTl = G.fromTo(dash, { y: 0 }, { y: 80, duration: .45, ease: "none", repeat: -1 });
    const tl = G.timeline({ onComplete: done });
    s.actors.forEach(a => {
      const o = { x: a.x, y: a.y }, r = facing(a, a.x, a.y, a.tx, a.ty);
      if (a.kind === "ped" && Math.hypot(a.tx - a.x, a.ty - a.y) > 2) walk(a.id, true);
      tl.to(o, { x: a.tx, y: a.ty, duration: s.duration, ease: "sine.inOut", onUpdate: () => place(a.id, o.x, o.y, r) }, 0);
      if (a.brake) tl.add(() => { const g = document.getElementById("hzA-" + a.id); if (g) g.classList.add("braking"); }, s.duration * .55);
    });
    tl.to("#hzProg", { width: "100%", duration: s.duration, ease: "none" }, 0);
    st.tl = tl;
  });
};
H.spot = (id) => {
  const st = H.st;
  if (!st || st.phase !== "spot") return;
  const hk = st.s.actors.find(a => a.id === st.s.hazard).kind, pk = (st.s.actors.find(a => a.id === id) || {}).kind;
  st.spotted = id === st.s.hazard || pk === hk;
  document.getElementById("hzSvg").classList.remove("pick");
  const g = document.getElementById("hzA-" + st.s.hazard);
  if (g) g.classList.add("hazard");
  st.phase = "choose"; H.panel();
};
H.choose = (i) => {
  const st = H.st, s = st.s, G = Motion.gsap;
  if (!st || st.phase !== "choose") return;
  st.choice = i; st.phase = "result";
  const ok = s.choices[i].ok;
  P.hz = P.hz || {};
  P.hz[s.id] = Math.max(P.hz[s.id] || 0, ok ? (st.spotted ? 2 : 1) : 0);
  Course.touchDay(); save();
  H.panel();
  const hz = s.actors.find(a => a.id === s.hazard);
  const hr = facing(hz, hz.tx, hz.ty, hz.then[0], hz.then[1]);
  if (!G || Motion.reduced()) { place(hz.id, hz.then[0], hz.then[1], hr); return; }
  Motion.scoped(() => {
    const o = { x: hz.tx, y: hz.ty };
    const moves = hz.kind === "ped" && Math.hypot(hz.then[0] - hz.tx, hz.then[1] - hz.ty) > 2;
    if (moves) walk(hz.id, true);
    G.to(o, { x: hz.then[0], y: hz.then[1], duration: 1.6, ease: "power1.inOut", onUpdate: () => place(hz.id, o.x, o.y, hr), onComplete: () => walk(hz.id, false) });
    if (st.dashTl) G.to(st.dashTl, { timeScale: ok ? 0 : 1.4, duration: ok ? 1.2 : .3, ease: "power2.out" });
    if (ok) { Motion.confetti(); }
    else {
      G.fromTo("#hzFlash", { opacity: 0 }, { opacity: .35, duration: .18, yoyo: true, repeat: 3 });
      G.to("#hzEgo", { y: -40, duration: 1, ease: "power1.in" });
    }
  });
};
H.replay = () => { const app = document.getElementById("app"); H.play(app, H.st.s); };

window.Hazard = H;
})();
