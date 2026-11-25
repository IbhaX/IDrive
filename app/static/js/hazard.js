/* iDrive hazard.js — interactive hazard-perception scenarios.
   Top-down animated scene → pause → tap the hazard → choose a response →
   explanation + outcome animation. Scenes are data (scenarios.json). */
(() => {
"use strict";
const H = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => esc(s == null ? "" : s);

H.view = async (app) => {
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:240px"></i></div></section>`;
  let d;
  try { d = await Course.library("scenarios"); } catch (err) { app.innerHTML = `<p class="empty">${e(u("networkErr"))}</p>`; return; }
  if (S.view !== "hazard") return;
  H.all = d.scenarios;
  const s = H.all.find(x => x.id === S.param);
  if (s) { H.play(app, s); return; }
  const score = H.all.filter(x => (P.hz || {})[x.id] > 0).length;
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tHazard"), "#hazard"]])}
  <section class="panel rvl"><h2>${e(u("hazTitle"))}</h2><p class="lede">${e(u("hazLede"))}</p><p class="muted">${e(u("hazScore", { n: score, t: H.all.length }))}</p></section>
  <div class="feat">${H.all.map((x, i) => {
    const v = (P.hz || {})[x.id] || 0;
    return `<a class="fcard tiltc rvl hz-${v >= 2 ? "perfect" : v > 0 ? "ok" : "new"}" href="#hazard/${x.id}"><span class="fi">${i + 1}</span><b>${e(x.title)}</b><small>${e(x.brief)}</small><span class="mfoot">${e(u(v >= 2 ? "hzPerfect" : v > 0 ? "hzPassed" : "hzNew"))}</span></a>`;
  }).join("")}</div>`;
  Motion.reveal(app);
};

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
const shape = (a) => {
  const c = a.color || "#94a3b8";
  switch (a.kind) {
    case "car": return `<rect x="-17" y="-30" width="34" height="60" rx="9" fill="${c}"/><rect x="-13" y="-18" width="26" height="14" rx="3" class="glass"/><rect x="-13" y="12" width="26" height="10" rx="3" class="glass"/><rect x="-15" y="26" width="8" height="4" rx="1" class="tail"/><rect x="7" y="26" width="8" height="4" rx="1" class="tail"/>`;
    case "truck": return `<rect x="-20" y="-50" width="40" height="100" rx="6" fill="${c}"/><rect x="-18" y="-48" width="36" height="24" rx="4" class="glass"/>`;
    case "bus": return `<rect x="-20" y="-55" width="40" height="110" rx="8" fill="${c}"/><rect x="-16" y="-50" width="32" height="12" rx="3" class="glass"/><rect x="-15" y="50" width="8" height="4" class="tail"/><rect x="7" y="50" width="8" height="4" class="tail"/>`;
    case "bike": return `<rect x="-6" y="-20" width="12" height="40" rx="6" fill="${c}"/><circle cy="-4" r="7" class="rider"/>`;
    case "ped": return `<circle r="9" class="ped"/><circle r="4" cy="-1" class="pedh"/>`;
    case "cow": return `<ellipse rx="22" ry="12" class="cow"/><circle cx="-24" cy="0" r="7" class="cow"/><circle cx="6" cy="-3" r="4" class="cowspot"/>`;
    case "dog": return `<ellipse rx="12" ry="6" class="dog"/><circle cx="-13" r="4" class="dog"/>`;
  }
  return "";
};
const ego = `<g id="hzEgo" transform="translate(150,500)"><rect x="-17" y="-30" width="34" height="60" rx="9" class="egob"/><rect x="-13" y="-22" width="26" height="12" rx="3" class="glass"/><path d="M-12 -34 L-30 -150 L30 -150 L12 -34 Z" class="beam"/></g>`;
const actorG = (a, pos) => `<g class="actor" id="hzA-${a.id}" data-hz="${a.id}" tabindex="-1" role="button" aria-label="${e(u("kind_" + a.kind))}" transform="translate(${pos[0]},${pos[1]}) rotate(${a.rot || 0})">${shape(a)}<circle r="34" class="hit"/></g>`;
const place = (id, x, y, rot) => { const g = document.getElementById("hzA-" + id); if (g) g.setAttribute("transform", `translate(${x},${y}) rotate(${rot || 0})`); };

/* ---------- player ---------- */
H.st = null;
H.play = (app, s) => {
  H.st = { s, phase: "intro", spotted: null, choice: null, tl: null };
  app.innerHTML = `${Course.crumbs([[u("tHazard"), "#hazard"], [s.title, "#hazard/" + s.id]])}
  <div class="hzgrid"><section class="panel hzscene"><svg id="hzSvg" viewBox="0 0 400 600" role="img" aria-label="${e(s.title)}">${road(s.layout)}${s.actors.map(a => actorG(a, [a.x, a.y])).join("")}${ego}<rect id="hzFlash" width="400" height="600" class="flash" opacity="0"/></svg></section>
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
    box.innerHTML = `<h3 class="sh">${e(u("hzSpot"))}</h3><p class="muted">${e(u("hzSpotSub"))}</p><div class="plist">${s.actors.map(a => `<button class="chip" data-hz="${a.id}">${e(u("kind_" + a.kind))}</button>`).join("")}</div>`;
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
  s.actors.forEach(a => place(a.id, a.x, a.y, a.rot));
  const done = () => {
    s.actors.forEach(a => { if (a.brake) { const g = document.getElementById("hzA-" + a.id); if (g) g.classList.add("braking"); } });
    st.phase = "spot";
    document.getElementById("hzSvg").classList.add("pick");
    H.panel();
  };
  if (!G || Motion.reduced()) { s.actors.forEach(a => place(a.id, a.tx, a.ty, a.rot)); done(); return; }
  Motion.scoped(() => {
    const dash = document.getElementById("hzDash");
    st.dashTl = G.fromTo(dash, { y: 0 }, { y: 80, duration: .45, ease: "none", repeat: -1 });
    const tl = G.timeline({ onComplete: done });
    s.actors.forEach(a => {
      const o = { x: a.x, y: a.y };
      tl.to(o, { x: a.tx, y: a.ty, duration: s.duration, ease: "sine.inOut", onUpdate: () => place(a.id, o.x, o.y, a.rot) }, 0);
      if (a.brake) tl.add(() => { const g = document.getElementById("hzA-" + a.id); if (g) g.classList.add("braking"); }, s.duration * .55);
    });
    tl.to("#hzProg", { width: "100%", duration: s.duration, ease: "none" }, 0);
    st.tl = tl;
  });
};
H.spot = (id) => {
  const st = H.st;
  if (!st || st.phase !== "spot") return;
  st.spotted = id === st.s.hazard;
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
  if (!G || Motion.reduced()) { place(hz.id, hz.then[0], hz.then[1], hz.rot); return; }
  Motion.scoped(() => {
    const o = { x: hz.tx, y: hz.ty };
    G.to(o, { x: hz.then[0], y: hz.then[1], duration: 1.6, ease: "power1.inOut", onUpdate: () => place(hz.id, o.x, o.y, hz.rot) });
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
