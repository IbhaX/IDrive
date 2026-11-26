/* iDrive labs.js — Driving-science laboratory: stopping distance,
   reaction time, four-stroke engine. All physics are simplified
   educational models and are labelled as such in the UI. */
(() => {
"use strict";
const Lb = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);   // strings are escaped; [en, ml] pairs render bilingually
const G = () => Motion.gsap;

Lb.GROUPS = [
  ["lgStop", ["stopping", "reaction", "following", "cornering", "slope", "abs", "aquaplaning", "tyrepressure", "weighttransfer"]],
  ["lgSee", ["headlights", "fog", "blindspot", "truckzones", "eyesoff"]],
  ["lgCrash", ["energy", "seatbelt", "helmet", "rollover"]],
  ["lgCar", ["engine", "gears", "economy", "drag", "regen", "ghat"]],
  ["lgTraffic", ["overtaking", "offtracking", "traveltime", "trafficwave"]],
];
Lb.LABS = Lb.GROUPS.flatMap(([, ids]) => ids);
const LAB_ICON = { stopping: "atom", reaction: "brain", engine: "engine", following: "gauge", cornering: "wheel", energy: "alert", headlights: "eye", blindspot: "eye",
  slope: "mountain", abs: "wheel", aquaplaning: "drop", tyrepressure: "wheel", weighttransfer: "gauge", fog: "cloud", truckzones: "truck", eyesoff: "phone",
  seatbelt: "shield", helmet: "shield", rollover: "alert", gears: "gauge", economy: "fuel", drag: "wind", regen: "bolt", ghat: "mountain",
  overtaking: "truck", offtracking: "truck", traveltime: "clock", trafficwave: "wind" };
Lb.view = (app) => {
  const id = Lb.LABS.includes(S.param) && typeof Lb[S.param] === "function" ? S.param : null;
  if (!id) {
    app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tScience"), "#science"]])}
    <section class="panel rvl"><h2>${e(u("scienceTitle"))}</h2><p class="lede">${e(u("scienceLede"))}</p></section>
    ${Lb.GROUPS.map(([gk, ids]) => `<h3 class="labgroup rvl">${e(u(gk))}</h3><div class="feat">${ids.map(l => `<a class="fcard tiltc rvl" href="#science/${l}"><span class="fi">${Course.icon(LAB_ICON[l] || "atom")}</span><b>${e(u("lab_" + l))}</b><small>${e(u("labSub_" + l))}</small></a>`).join("")}</div>`).join("")}`;
    Motion.reveal(app);
    return;
  }
  const i = Lb.LABS.indexOf(id), prev = Lb.LABS[(i - 1 + Lb.LABS.length) % Lb.LABS.length], next = Lb.LABS[(i + 1) % Lb.LABS.length];
  const grp = Lb.GROUPS.find(([, ids]) => ids.includes(id))[0];
  const nav = `<nav class="labnav" aria-label="${I18n.esc(I18n.one(u("tScience")))}">
    <a class="btn small" href="#science">← ${e(u("labAll"))}</a><span class="labgrp">${e(u(grp))} · ${i + 1}/${Lb.LABS.length}</span>
    <span class="labpn"><a class="btn small" href="#science/${prev}" aria-label="${I18n.esc(I18n.one(u("labPrev")))}: ${I18n.esc(I18n.one(u("lab_" + prev)))}">‹</a><a class="btn small" href="#science/${next}" aria-label="${I18n.esc(I18n.one(u("labNext")))}: ${I18n.esc(I18n.one(u("lab_" + next)))}">${e(u("lab_" + next))} ›</a></span></nav>`;
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tScience"), "#science"], [u("lab_" + id), "#science/" + id]])}${nav}<div id="labHost"></div>`;
  const host = document.getElementById("labHost");
  Lb[id](host);
};

/* ---------- stopping distance ---------- */
const SURF = { dry: .7, wet: .4, gravel: .35, worn: .25 };
Lb.calc = (kmh, rt, mu) => {
  const v = kmh / 3.6, g = 9.81;
  const react = v * rt, brake = (v * v) / (2 * mu * g);
  return { v, react, brake, total: react + brake, tStop: rt + v / (mu * g) };
};
Lb.impact = (kmh, rt, mu, hazard) => {
  const c = Lb.calc(kmh, rt, mu);
  if (hazard >= c.total) return 0;
  if (hazard <= c.react) return kmh;
  const v2 = c.v * c.v - 2 * mu * 9.81 * (hazard - c.react);
  return Math.max(0, Math.sqrt(Math.max(0, v2)) * 3.6);
};
Lb.st = { kmh: 50, rt: 1.5, surf: "wet", hz: 30 };
Lb.stopping = (host) => {
  const st = Lb.st;
  host.innerHTML = `<section class="panel lab rvl">
  <div class="labgrid">
    <div class="controls">
      <label class="ctl"><span>${e(u("speed"))} <b id="vKmh">${st.kmh}</b> km/h</span><input type="range" id="inKmh" min="20" max="120" step="5" value="${st.kmh}"></label>
      <label class="ctl"><span>${e(u("reactionTime"))} <b id="vRt">${st.rt.toFixed(1)}</b> s</span><input type="range" id="inRt" min="0.5" max="3" step="0.1" value="${st.rt}"></label>
      <label class="ctl"><span>${e(u("compareSurface"))}</span><select id="inSurf">${Object.keys(SURF).filter(k => k !== "dry").map(k => `<option value="${k}" ${st.surf === k ? "selected" : ""}>${e(u("surf_" + k))} (μ ≈ ${SURF[k]})</option>`).join("")}</select></label>
      <label class="ctl"><span>${e(u("hazardAt"))} <b id="vHz">${st.hz}</b> m</span><input type="range" id="inHz" min="5" max="120" step="1" value="${st.hz}"></label>
      <button class="btn primary mag" data-act="labrun">▶ ${e(u("runTest"))}</button>
    </div>
    <div class="labviz"><svg id="stopSvg" viewBox="0 0 720 230" role="img" aria-label="${e(u("lab_stopping"))}"></svg><div class="readout" id="stopOut" aria-live="polite"></div></div>
  </div>
  <aside class="lnote n-model"><b>${e(u("noteModel"))}</b><p>${e(u("stopModelNote"))}</p></aside>
  </section>`;
  const bind = (id, key, fmt) => {
    const el = document.getElementById(id);
    el.addEventListener("input", () => { st[key] = key === "surf" ? el.value : +el.value; Lb.drawStop(false); });
  };
  bind("inKmh", "kmh"); bind("inRt", "rt"); bind("inSurf", "surf"); bind("inHz", "hz");
  Lb.drawStop(false);
  Motion.reveal(host);
};
Lb.drawStop = (animate) => {
  const st = Lb.st, svg = document.getElementById("stopSvg");
  if (!svg) return;
  document.getElementById("vKmh").textContent = st.kmh;
  document.getElementById("vRt").textContent = st.rt.toFixed(1);
  document.getElementById("vHz").textContent = st.hz;
  const lanes = [["dry", SURF.dry], [st.surf, SURF[st.surf]]];
  const calcs = lanes.map(l => Lb.calc(st.kmh, st.rt, l[1]));
  const maxD = Math.max(60, ...calcs.map(c => c.total), st.hz) * 1.08;
  const X0 = 70, W = 620, sx = (m) => X0 + (m / maxD) * W;
  const tick = maxD > 150 ? 25 : maxD > 80 ? 20 : 10;
  let g = `<rect x="0" y="0" width="720" height="230" rx="14" class="labbg"/>`;
  for (let m = 0; m <= maxD; m += tick) g += `<line x1="${sx(m)}" y1="20" x2="${sx(m)}" y2="200" class="gridl"/><text x="${sx(m)}" y="218" class="axis" text-anchor="middle">${m} m</text>`;
  lanes.forEach((l, i) => {
    const c = calcs[i], y = 30 + i * 86;
    g += `<rect x="${X0 - 40}" y="${y}" width="${W + 40}" height="66" rx="8" class="lane"/>
      <text x="${X0 - 30}" y="${y + 16}" class="lname">${e(u("surf_" + l[0]))} <tspan class="lsub">μ ≈ ${l[1]}</tspan></text>
      <rect x="${X0}" y="${y + 38}" width="${sx(c.react) - X0}" height="10" rx="5" class="seg-r"/>
      <rect x="${sx(c.react)}" y="${y + 38}" width="${sx(c.total) - sx(c.react)}" height="10" rx="5" class="seg-b"/>
      <line x1="${sx(c.total)}" y1="${y + 24}" x2="${sx(c.total)}" y2="${y + 62}" class="stopline"/>
      <g class="lcar" data-i="${i}" transform="translate(${X0 - 30},${y + 30})"><rect width="30" height="26" rx="7" class="carb"/><rect x="18" y="4" width="8" height="18" rx="2" class="carw"/></g>`;
  });
  g += `<g class="hzm"><line x1="${sx(st.hz)}" y1="26" x2="${sx(st.hz)}" y2="202" class="hzline"/><circle cx="${sx(st.hz)}" cy="24" r="8" class="hzdot"/><text x="${sx(st.hz)}" y="28" text-anchor="middle" class="hzt">!</text></g>`;
  svg.innerHTML = g;
  const out = document.getElementById("stopOut");
  out.innerHTML = lanes.map((l, i) => {
    const c = calcs[i], imp = Lb.impact(st.kmh, st.rt, l[1], st.hz);
    return `<div class="ro"><b>${e(u("surf_" + l[0]))}</b><span><i class="sw r"></i>${e(u("reactionDist"))} ${c.react.toFixed(1)} m</span><span><i class="sw b"></i>${e(u("brakingDist"))} ${c.brake.toFixed(1)} m</span><span>${e(u("totalDist"))} <b>${c.total.toFixed(1)} m</b> · ${c.tStop.toFixed(1)} s</span><span class="${imp > 0 ? "bad" : "good"}">${imp > 0 ? e(u("impactAt", { v: Math.round(imp) })) : e(u("stopsInTime", { m: (st.hz - c.total).toFixed(1) }))}</span></div>`;
  }).join("") + `<p class="muted">${e(u("squareLaw"))}</p>`;
  if (!animate) return;
  const gs = G();
  if (!gs || Motion.reduced()) {
    svg.querySelectorAll(".lcar").forEach((car, i) => car.setAttribute("transform", `translate(${sx(calcs[i].total) - 30},${30 + i * 86 + 30})`));
    return;
  }
  Motion.scoped(() => {
    svg.querySelectorAll(".lcar").forEach((car, i) => {
      const c = calcs[i], y = 30 + i * 86 + 30, k = 1.6 / Math.max(...calcs.map(x => x.tStop));
      const o = { x: X0 - 30 };
      const tl = gs.timeline({ onUpdate: () => car.setAttribute("transform", `translate(${o.x},${y})`) });
      tl.to(o, { x: sx(c.react) - 30, duration: c.rt * k * 1.4 || .01, ease: "none" })
        .to(o, { x: sx(c.total) - 30, duration: (c.tStop - st.rt) * k * 1.4, ease: "power1.out" });
    });
  });
};

/* ---------- reaction time ---------- */
Lb.rt = { state: "idle", t0: 0, timer: null, tries: [] };
Lb.reaction = (host) => {
  Lb.rt = { state: "idle", t0: 0, timer: null, tries: [] };
  host.innerHTML = `<section class="panel lab rvl"><p class="lede">${e(u("rtLede"))}</p>
  <button class="rtpad idle" id="rtPad" data-act="rtpad" aria-live="assertive">${e(u("rtStart"))}</button>
  <div class="rtres" id="rtRes"></div>
  <aside class="lnote n-model"><b>${e(u("noteModel"))}</b><p>${e(u("rtNote"))}</p></aside></section>`;
  Lb.rtRender();
  Motion.reveal(host);
};
Lb.rtPress = () => {
  const r = Lb.rt, pad = document.getElementById("rtPad");
  if (!pad) return;
  if (r.state === "idle" || r.state === "done" || r.state === "early") {
    r.state = "wait";
    pad.className = "rtpad wait"; pad.textContent = u("rtWait");
    clearTimeout(r.timer);
    r.timer = setTimeout(() => { r.state = "go"; r.t0 = performance.now(); pad.className = "rtpad go"; pad.textContent = u("rtGo"); }, 1500 + Math.random() * 2500);
  } else if (r.state === "wait") {
    clearTimeout(r.timer);
    r.state = "early"; pad.className = "rtpad early"; pad.textContent = u("rtEarly");
  } else if (r.state === "go") {
    const ms = Math.round(performance.now() - r.t0);
    r.tries.push(ms); r.state = "done";
    pad.className = "rtpad done"; pad.textContent = u("rtResult", { ms });
    P.lab = P.lab || {};
    if (!P.lab.rt || ms < P.lab.rt) P.lab.rt = ms;
    Course.touchDay(); save();
    Lb.rtRender();
    Motion.pop(pad);
  }
};
Lb.rtRender = () => {
  const box = document.getElementById("rtRes");
  if (!box) return;
  const t = Lb.rt.tries;
  if (!t.length) { box.innerHTML = P.lab && P.lab.rt ? `<p class="muted">${e(u("rtBest", { ms: P.lab.rt }))}</p>` : ""; return; }
  const avg = Math.round(t.reduce((a, b) => a + b, 0) / t.length);
  const at = (kmh) => (kmh / 3.6 * avg / 1000).toFixed(1);
  box.innerHTML = `<div class="stat"><div><b>${avg} ms</b><span class="muted">${e(u("rtAvg", { n: t.length }))}</span></div><div><b>${at(50)} m</b><span class="muted">${e(u("rtAt", { v: 50 }))}</span></div><div><b>${at(100)} m</b><span class="muted">${e(u("rtAt", { v: 100 }))}</span></div></div>
  <p class="muted">${e(u("rtReal"))}</p><div class="row"><a class="btn" href="#science/stopping">${e(u("lab_stopping"))} →</a></div>`;
};

/* ---------- four-stroke engine ---------- */
const STROKES = ["intake", "compression", "power", "exhaust"];
Lb.eng = { tl: null, theta: 0 };
Lb.engine = (host) => {
  host.innerHTML = `<section class="panel lab rvl"><div class="labgrid">
  <div class="engviz"><svg id="engSvg" viewBox="0 0 260 360" role="img" aria-label="${e(u("lab_engine"))}">
    <defs><linearGradient id="cyl" x1="0" x2="1"><stop offset="0" stop-color="#2a3150"/><stop offset=".5" stop-color="#3a4370"/><stop offset="1" stop-color="#2a3150"/></linearGradient></defs>
    <rect x="70" y="40" width="120" height="170" rx="6" fill="url(#cyl)" class="cylwall"/>
    <rect id="gas" x="76" y="48" width="108" height="40" class="gas"/>
    <g id="vIn"><line x1="100" y1="20" x2="100" y2="44" class="stem"/><rect x="88" y="40" width="24" height="6" rx="2" class="valve"/></g>
    <g id="vEx"><line x1="160" y1="20" x2="160" y2="44" class="stem"/><rect x="148" y="40" width="24" height="6" rx="2" class="valve"/></g>
    <text x="100" y="14" text-anchor="middle" class="tiny">${e(u("valveIn"))}</text><text x="160" y="14" text-anchor="middle" class="tiny">${e(u("valveEx"))}</text>
    <g id="spark" opacity="0"><path d="M130 44 l-6 10 h8 l-6 12" class="spark"/></g>
    <rect id="piston" x="76" y="110" width="108" height="34" rx="4" class="piston"/>
    <line id="rod" x1="130" y1="127" x2="130" y2="290" class="rod"/>
    <circle cx="130" cy="290" r="44" class="crankc"/>
    <line id="crank" x1="130" y1="290" x2="130" y2="246" class="crankarm"/>
    <circle id="pin" cx="130" cy="246" r="6" class="pin"/>
    <circle cx="130" cy="290" r="7" class="pin"/>
  </svg></div>
  <div class="controls">
    <ol class="strokes" id="strokes">${STROKES.map((s, i) => `<li data-s="${i}"><b>${i + 1}. ${e(u("st_" + s))}</b><small>${e(u("stD_" + s))}</small></li>`).join("")}</ol>
    <div class="row"><button class="btn primary" data-act="engplay" id="engPlay">▶ ${e(u("play"))}</button><button class="btn" data-act="engstep">${e(u("nextStroke"))} ⏭</button></div>
    <label class="ctl"><span>${e(u("engSpeed"))}</span><input type="range" id="engRpm" min="0.25" max="3" step="0.25" value="1"></label>
    <p class="muted">${e(u("engNote"))}</p>
    <div class="row"><a class="btn" href="#lesson/engine-basics">${e(u("readLesson"))} →</a></div>
  </div></div>
  <aside class="lnote n-model"><b>${e(u("noteModel"))}</b><p>${e(u("engModel"))}</p></aside></section>`;
  Lb.eng = { tl: null, theta: 0 };
  Lb.engSet(90);
  const rpm = document.getElementById("engRpm");
  rpm.addEventListener("input", () => { if (Lb.eng.tl) Lb.eng.tl.timeScale(+rpm.value); });
  Motion.reveal(host);
};
Lb.engSet = (theta) => {
  Lb.eng.theta = theta;
  const r = 44, l = 150, cx = 130, cy = 290;
  const a = (theta % 360) * Math.PI / 180;        // 0 = piston at top (TDC)
  const px = cx + r * Math.sin(a), py = cy - r * Math.cos(a);
  const pistonPin = py - Math.sqrt(l * l - (px - cx) * (px - cx));
  const $ = (id) => document.getElementById(id);
  if (!$("piston")) return;
  $("piston").setAttribute("y", (pistonPin - 17).toFixed(1));
  $("rod").setAttribute("x1", cx); $("rod").setAttribute("y1", pistonPin.toFixed(1));
  $("rod").setAttribute("x2", px.toFixed(1)); $("rod").setAttribute("y2", py.toFixed(1));
  $("crank").setAttribute("x2", px.toFixed(1)); $("crank").setAttribute("y2", py.toFixed(1));
  $("pin").setAttribute("cx", px.toFixed(1)); $("pin").setAttribute("cy", py.toFixed(1));
  const top = 48, gasH = Math.max(6, pistonPin - 17 - top);
  $("gas").setAttribute("height", gasH.toFixed(1));
  const t = ((theta % 720) + 720) % 720, stroke = Math.floor(t / 180);
  const inOpen = stroke === 0 ? Math.sin((t / 180) * Math.PI) * 10 : 0;
  const exOpen = stroke === 3 ? Math.sin(((t - 540) / 180) * Math.PI) * 10 : 0;
  $("vIn").setAttribute("transform", `translate(0,${inOpen.toFixed(1)})`);
  $("vEx").setAttribute("transform", `translate(0,${exOpen.toFixed(1)})`);
  $("gas").setAttribute("class", "gas g" + stroke + (stroke === 2 && t < 400 ? " burn" : ""));
  $("spark").setAttribute("opacity", stroke === 2 && t < 380 ? "1" : "0");
  document.querySelectorAll("#strokes li").forEach(li => li.classList.toggle("on", +li.dataset.s === stroke));
};
Lb.engPlay = () => {
  const btn = document.getElementById("engPlay");
  const gs = G();
  if (Lb.eng.tl) { Lb.eng.tl.kill(); Lb.eng.tl = null; btn.textContent = "▶ " + u("play"); return; }
  if (!gs || Motion.reduced()) { Lb.engStep(); return; }
  const o = { t: Lb.eng.theta };
  Motion.scoped(() => {
    Lb.eng.tl = gs.to(o, { t: o.t + 720, duration: 6, ease: "none", repeat: -1, onUpdate: () => Lb.engSet(o.t) });
    Lb.eng.tl.timeScale(+document.getElementById("engRpm").value);
  });
  btn.textContent = "❚❚ " + u("pause");
};
Lb.engStep = () => {
  if (Lb.eng.tl) { Lb.eng.tl.kill(); Lb.eng.tl = null; const b = document.getElementById("engPlay"); if (b) b.textContent = "▶ " + u("play"); }
  const from = Lb.eng.theta, to = (Math.floor(from / 180) + 1) * 180 + 90;
  const gs = G();
  if (!gs || Motion.reduced()) { Lb.engSet(to); return; }
  const o = { t: from };
  Motion.scoped(() => gs.to(o, { t: to, duration: .9, ease: "power2.inOut", onUpdate: () => Lb.engSet(o.t) }));
};

window.Labs = Lb;
})();
