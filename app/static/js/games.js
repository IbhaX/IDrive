/* iDrive games.js — driving games that train reaction time, attention and
   road logic. One small engine (stage, centre ▶, HUD, result card, best
   scores in P.gm) and 31 games. Canvas games draw in a 640×400 logical
   space; logic games mostly use DOM buttons in the stage's layer.
   Best scores: P.gm[id] = points, higher is better (lower-is-better games
   store 10000 − value), merged per key with max like P.hz. */
(() => {
"use strict";
const u = (k, o) => I18n.u(k, o), e = (s) => I18n.X(s), t1 = (k, o) => I18n.one(u(k, o));
const W = 640, H = 400;
const DEF = {};
const def = (id, spec) => { DEF[id] = spec; };
const Gm = { DEF };
const rnd = (a, b) => a + Math.random() * (b - a), ri = (a, b) => Math.floor(rnd(a, b + 1)), pick = (a) => a[Math.floor(Math.random() * a.length)];
const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fx = (n, d = 1) => (+n).toFixed(d);

Gm.GROUPS = [
  ["gmReact", ["brakelight", "greenlight", "kidout", "gonogo", "indicator", "mirrors", "peripheral", "stopline", "dodge", "lanekeep", "speedkeep", "gapjudge", "animals", "fogspot", "nightped"]],
  ["gmLogic", ["parking", "route", "rightofway", "roundabout", "sequence", "fuelplan", "stopguess", "gapcount", "speedmath", "plates", "blindspots", "overtake"]],
  ["gmRules", ["signsprint", "signpairs", "oddsign", "dashlights"]],
];
Gm.ALL = Gm.GROUPS.flatMap(([, ids]) => ids);

/* ---------- scores ---------- */
const points = (id, v) => (DEF[id].lo ? Math.max(0, 10000 - Math.round(v)) : Math.round(v));
const fromPoints = (id, p) => (DEF[id].lo ? 10000 - p : p);
const fmt = (id, v) => { const un = DEF[id].unit || ""; return `${Math.round(v)}${un ? " " + un : ""}`; };
const bestOf = (id) => { const p = (P.gm || {})[id]; return p == null ? null : fromPoints(id, p); };

/* ---------- drawing helpers (logical 640×400) ---------- */
const D = {
  rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); },
  text(c, s, x, y, size = 18, col = "#f8fafc", align = "center", weight = 600) { c.font = `${weight} ${size}px Barlow, Inter, system-ui, sans-serif`; c.fillStyle = col; c.textAlign = align; c.textBaseline = "middle"; c.fillText(s, x, y); },
  sky(c, top = "#7fb4e8", bot = "#dbe8f3") { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot); c.fillStyle = g; c.fillRect(0, 0, W, H); },
  /* top-down vertical road: lanes of width lw centred at cx, dashes scroll */
  roadV(c, cx, lanes, lw, scroll = 0, grass = "#4d7c34") {
    c.fillStyle = grass; c.fillRect(0, 0, W, H);
    const w = lanes * lw, x0 = cx - w / 2;
    c.fillStyle = "#a8a29e"; c.fillRect(x0 - 16, 0, w + 32, H);
    c.fillStyle = "#3b3d40"; c.fillRect(x0, 0, w, H);
    c.fillStyle = "#f2f2f2"; c.fillRect(x0 + 4, 0, 3, H); c.fillRect(x0 + w - 7, 0, 3, H);
    for (let i = 1; i < lanes; i++) for (let y = -40 + (scroll % 40); y < H; y += 40) c.fillRect(x0 + i * lw - 2, y, 4, 22);
    for (let y = -24 + (scroll % 24); y < H; y += 24) { c.fillStyle = (Math.floor((y - scroll) / 24) % 2) ? "#111" : "#eee"; c.fillRect(x0 - 3, y, 3, 12); c.fillRect(x0 + w, y, 3, 12); }
  },
  /* top-down car, nose up when dir = 1 */
  carTop(c, x, y, w, h, col, o = {}) {
    c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.dir === -1) c.rotate(Math.PI);
    c.fillStyle = "rgba(0,0,0,.28)"; D.rr(c, -w / 2 + 3, -h / 2 + 4, w, h, w * 0.28); c.fill();
    c.fillStyle = col; D.rr(c, -w / 2, -h / 2, w, h, w * 0.28); c.fill();
    c.fillStyle = "#1b2733"; D.rr(c, -w * 0.38, -h * 0.28, w * 0.76, h * 0.2, 4); c.fill(); D.rr(c, -w * 0.36, h * 0.18, w * 0.72, h * 0.14, 4); c.fill();
    c.fillStyle = "rgba(255,255,255,.18)"; D.rr(c, -w * 0.36, -h * 0.06, w * 0.72, h * 0.22, 4); c.fill();
    c.fillStyle = "#fff6dc"; c.fillRect(-w * 0.42, -h / 2, w * 0.2, 3); c.fillRect(w * 0.22, -h / 2, w * 0.2, 3);
    c.fillStyle = o.brake ? "#ff2a2a" : "#7f1d1d"; c.fillRect(-w * 0.44, h / 2 - 4, w * 0.22, 4); c.fillRect(w * 0.22, h / 2 - 4, w * 0.22, 4);
    if (o.brake) { c.fillStyle = "rgba(255,40,40,.35)"; c.beginPath(); c.arc(-w * 0.33, h / 2, 9, 0, 7); c.arc(w * 0.33, h / 2, 9, 0, 7); c.fill(); }
    if (o.ind && o.on) { c.fillStyle = "#ffb020"; const sx = o.ind === "l" ? -w / 2 - 2 : w / 2 - 4; c.fillRect(sx, -h / 2 + 2, 6, 6); c.fillRect(sx, h / 2 - 8, 6, 6); }
    c.restore();
  },
  /* the back of a car seen from the driver's seat behind it */
  carRear(c, cx, cy, s, col, o = {}) {
    c.save(); c.translate(cx, cy); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.35)"; c.beginPath(); c.ellipse(0, 52, 108, 12, 0, 0, 7); c.fill();
    c.fillStyle = "#111"; c.fillRect(-92, 28, 30, 26); c.fillRect(62, 28, 30, 26);
    c.fillStyle = col; D.rr(c, -100, -10, 200, 56, 14); c.fill();
    c.beginPath(); c.moveTo(-74, -10); c.lineTo(-56, -58); c.lineTo(56, -58); c.lineTo(74, -10); c.closePath(); c.fill();
    c.fillStyle = "#1b2733"; c.beginPath(); c.moveTo(-64, -14); c.lineTo(-50, -52); c.lineTo(50, -52); c.lineTo(64, -14); c.closePath(); c.fill();
    c.fillStyle = "#f3f4f6"; c.fillRect(-28, 14, 56, 16); c.fillStyle = "#111"; c.font = "700 11px Barlow, sans-serif"; c.textAlign = "center"; c.fillText("KL 07", 0, 26);
    const tl = (x) => { c.fillStyle = o.brake ? "#ff2020" : "#7f1d1d"; D.rr(c, x, 0, 34, 14, 4); c.fill(); if (o.brake) { const g = c.createRadialGradient(x + 17, 7, 2, x + 17, 7, 46); g.addColorStop(0, "rgba(255,60,40,.85)"); g.addColorStop(1, "rgba(255,60,40,0)"); c.fillStyle = g; c.fillRect(x - 30, -38, 94, 90); } };
    tl(-92); tl(58);
    if (o.brake) { c.fillStyle = "#ff2020"; c.fillRect(-20, -62, 40, 5); }
    if (o.ind && o.on) { c.fillStyle = "#ffb020"; const x = o.ind === "l" ? -98 : 82; D.rr(c, x, 16, 16, 10, 3); c.fill(); const g = c.createRadialGradient(x + 8, 21, 2, x + 8, 21, 40); g.addColorStop(0, "rgba(255,176,32,.9)"); g.addColorStop(1, "rgba(255,176,32,0)"); c.fillStyle = g; c.fillRect(x - 34, -20, 84, 84); }
    c.restore();
  },
  /* simple perspective road towards a horizon */
  persp(c, hz = 170, scroll = 0, night = false) {
    if (night) { c.fillStyle = "#05070d"; c.fillRect(0, 0, W, H); } else D.sky(c);
    c.fillStyle = night ? "#0b1a0b" : "#5b8c3a"; c.fillRect(0, hz, W, H - hz);
    c.fillStyle = night ? "#15161a" : "#3b3d40"; c.beginPath(); c.moveTo(W / 2 - 20, hz); c.lineTo(W / 2 + 20, hz); c.lineTo(W + 160, H); c.lineTo(-160, H); c.closePath(); c.fill();
    c.fillStyle = night ? "#555" : "#f2f2f2";
    for (let i = 0; i < 12; i++) {
      const t0 = ((i + (scroll % 1)) / 12) ** 2, t1 = ((i + 0.45 + (scroll % 1)) / 12) ** 2;
      const y0 = hz + (H - hz) * t0, y1 = hz + (H - hz) * t1, w0 = 1 + 6 * t0, w1 = 1 + 6 * t1;
      c.beginPath(); c.moveTo(W / 2 - w0, y0); c.lineTo(W / 2 + w0, y0); c.lineTo(W / 2 + w1, y1); c.lineTo(W / 2 - w1, y1); c.fill();
    }
  },
  ped(c, x, y, s = 1, col = "#f97316", o = {}) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.25)"; c.beginPath(); c.ellipse(0, 30, 12, 4, 0, 0, 7); c.fill();
    const sw = o.walk ? Math.sin(o.walk) * 6 : 0;
    c.strokeStyle = o.dark ? "#1f2937" : "#334155"; c.lineWidth = 5; c.lineCap = "round";
    c.beginPath(); c.moveTo(-3, 10); c.lineTo(-3 - sw, 28); c.moveTo(3, 10); c.lineTo(3 + sw, 28); c.stroke();
    c.fillStyle = col; D.rr(c, -8, -12, 16, 24, 6); c.fill();
    c.fillStyle = "#c68642"; c.beginPath(); c.arc(0, -18, 7, 0, 7); c.fill();
    c.fillStyle = "#1c1917"; c.beginPath(); c.arc(0, -20, 7, Math.PI, 0); c.fill();
    c.restore();
  },
  cow(c, x, y, s = 1, face = 1) {
    c.save(); c.translate(x, y); c.scale(s * face, s);
    c.fillStyle = "rgba(0,0,0,.22)"; c.beginPath(); c.ellipse(0, 6, 26, 10, 0, 0, 7); c.fill();
    c.fillStyle = "#e7e2d6"; c.beginPath(); c.ellipse(0, 0, 24, 13, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(26, -2, 9, 7, 0, 0, 7); c.fill();
    c.fillStyle = "#8a7f70"; c.beginPath(); c.ellipse(-6, -3, 6, 4, 0, 0, 7); c.fill();
    c.strokeStyle = "#3f3a33"; c.lineWidth = 2; c.beginPath(); c.moveTo(28, -8); c.lineTo(33, -14); c.moveTo(24, -8); c.lineTo(22, -15); c.stroke();
    c.restore();
  },
  bike(c, x, y, s = 1, col = "#7c3aed", rot = 0) {
    c.save(); c.translate(x, y); c.rotate(rot); c.scale(s, s);
    c.fillStyle = "rgba(0,0,0,.25)"; D.rr(c, -6, -18, 14, 40, 6); c.fill();
    c.fillStyle = "#111"; D.rr(c, -4, -20, 8, 40, 4); c.fill();
    c.fillStyle = col; D.rr(c, -7, -8, 14, 18, 5); c.fill();
    c.fillStyle = "#111827"; c.beginPath(); c.arc(0, -1, 6, 0, 7); c.fill();
    c.strokeStyle = "#111"; c.lineWidth = 3; c.beginPath(); c.moveTo(-11, -14); c.lineTo(11, -14); c.stroke();
    c.restore();
  },
  tlight(c, x, y, s, state) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = "#4b5563"; c.fillRect(-5, 60, 10, 140);
    c.fillStyle = "#111827"; D.rr(c, -32, -90, 64, 156, 12); c.fill();
    [["red", -58, "#ef4444"], ["amber", -12, "#f59e0b"], ["green", 34, "#22c55e"]].forEach(([k, yy, col]) => {
      const on = state === k; c.fillStyle = on ? col : "#1f2937"; c.beginPath(); c.arc(0, yy, 19, 0, 7); c.fill();
      if (on) { const g = c.createRadialGradient(0, yy, 4, 0, yy, 60); g.addColorStop(0, col + "cc"); g.addColorStop(1, col + "00"); c.fillStyle = g; c.fillRect(-60, yy - 60, 120, 120); }
    });
    c.restore();
  },
  fog(c, a) { c.fillStyle = `rgba(203,213,225,${a})`; c.fillRect(0, 0, W, H); },
};

/* ---------- the runner ---------- */
function makeRunner(id, stage, onEnd) {
  const sp = DEF[id], cv = stage.querySelector("canvas"), c = cv.getContext("2d"), lay = stage.querySelector(".glay"), hudEl = stage.querySelector(".ghud"), msgEl = stage.querySelector(".gmsg");
  let raf = 0, timers = [], frameFn = null, alive = false, last = 0, handlers = {}, msgT = 0;
  const fit = () => { const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.max(2, Math.round(r.width * dpr)); cv.height = Math.max(2, Math.round(r.height * dpr)); };
  fit();
  const ro = window.ResizeObserver ? new ResizeObserver(fit) : null; if (ro) ro.observe(cv);
  const toLogical = (ev) => { const r = cv.getBoundingClientRect(); return { x: (ev.clientX - r.left) / r.width * W, y: (ev.clientY - r.top) / r.height * H }; };
  const prep = () => { c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0); };
  const g = {
    W, H, c, lay, D, rnd, ri, pick, shuffle, clamp,
    get alive() { return alive; },
    hud(html) { hudEl.innerHTML = html; },
    msg(text, cls = "", ms = 900) { msgEl.textContent = text; msgEl.className = "gmsg show " + cls; clearTimeout(msgT); if (ms) msgT = setTimeout(() => { msgEl.className = "gmsg"; }, ms); },
    loop(fn) { frameFn = fn; },
    after(ms, fn) { const t = setTimeout(() => { if (alive) fn(); }, ms); timers.push(t); return t; },
    cancel(t) { clearTimeout(t); },
    on(type, fn) { handlers[type] = fn; },
    now: () => performance.now(),
    draw(fn) { prep(); fn(c); },
    btns(list, cb, cls = "") {
      lay.innerHTML = `<div class="gbtns ${cls}">${list.map((b, i) => `<button type="button" class="gbtn" data-gb="${i}">${b}</button>`).join("")}</div>`;
      lay.querySelectorAll("[data-gb]").forEach((b) => b.addEventListener("click", (ev) => { ev.stopPropagation(); if (alive) cb(+b.dataset.gb, b); }));
    },
    panel(html) { lay.innerHTML = html; return lay; },
    end(value, detail) {
      if (!alive) return;
      alive = false; frameFn = null; timers.forEach(clearTimeout); timers = [];
      window.removeEventListener("keydown", onKey);
      onEnd(value, detail);
    },
  };
  const onKey = (ev) => { if (!alive || !handlers.key) return; if ([" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter"].includes(ev.key)) ev.preventDefault(); handlers.key(ev.key, ev); };
  stage.addEventListener("pointerdown", (ev) => {
    if (!alive || ev.target.closest(".gbtn,.scenebtn,.glay button,.glay input")) return;
    const p = toLogical(ev); if (handlers.tap) handlers.tap(p.x, p.y, ev); if (handlers.down) handlers.down(p.x, p.y, ev);
  });
  stage.addEventListener("pointermove", (ev) => { if (alive && handlers.move) { const p = toLogical(ev); handlers.move(p.x, p.y, ev); } });
  const upH = (ev) => { if (alive && handlers.up) { const p = toLogical(ev); handlers.up(p.x, p.y, ev); } };
  stage.addEventListener("pointerup", upH); stage.addEventListener("pointercancel", upH);
  const frame = (now) => {
    if (!cv.isConnected) { alive = false; timers.forEach(clearTimeout); window.removeEventListener("keydown", onKey); if (ro) ro.disconnect(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (frameFn) { prep(); frameFn(dt, now); }
    raf = requestAnimationFrame(frame);
  };
  return {
    g,
    start() { handlers = {}; lay.innerHTML = ""; hudEl.innerHTML = ""; alive = true; last = performance.now(); window.addEventListener("keydown", onKey); sp.start(g); if (!raf) raf = requestAnimationFrame(frame); },
    preview() { prep(); (sp.preview || defaultPreview)(g); },
  };
}
function defaultPreview(g) { g.draw((c) => { D.roadV(c, W / 2, 2, 90, 0); D.carTop(c, W / 2 - 45, 300, 46, 84, "#2563eb"); }); }

/* ---------- views ---------- */
Gm.view = (app) => {
  const id = DEF[S.param] ? S.param : null;
  if (!id) { hub(app); return; }
  play(app, id);
};
function hub(app) {
  const played = Gm.ALL.filter((k) => (P.gm || {})[k] != null).length;
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tGames"), "#games"]])}
  <section class="panel rvl"><h2>${e(u("gmTitle"))}</h2><p class="lede">${e(u("gmLede"))}</p><p class="muted">${e(u("gmPlayed", { n: played, t: Gm.ALL.length }))}</p></section>
  ${Gm.GROUPS.map(([gk, ids]) => `<h3 class="labgroup rvl">${e(u(gk))}</h3><div class="feat">${ids.map((k) => {
    const b = bestOf(k);
    return `<a class="fcard tiltc rvl gcard" href="#games/${k}"><span class="fi gico" aria-hidden="true">${DEF[k].icon}</span><b>${e(u("gm_" + k))}</b><small>${e(u("gmSub_" + k))}</small><span class="mfoot">${b == null ? e(u("gmNoBest")) : `${e(u("gmBest"))}: <b>${fmt(k, b)}</b>`}</span></a>`;
  }).join("")}</div>`).join("")}`;
  Motion.reveal(app);
}
function play(app, id) {
  const sp = DEF[id], i = Gm.ALL.indexOf(id), prev = Gm.ALL[(i - 1 + Gm.ALL.length) % Gm.ALL.length], next = Gm.ALL[(i + 1) % Gm.ALL.length];
  const grp = Gm.GROUPS.find(([, ids]) => ids.includes(id))[0];
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tGames"), "#games"], [u("gm_" + id), "#games/" + id]])}
  <nav class="labnav"><a class="btn small" href="#games">← ${e(u("gmAll"))}</a><span class="labgrp">${e(u(grp))} · ${i + 1}/${Gm.ALL.length}</span>
    <span class="labpn"><a class="btn small" href="#games/${prev}" aria-label="${I18n.attr(u("gm_" + prev))}">‹</a><a class="btn small" href="#games/${next}">${e(u("gm_" + next))} ›</a></span></nav>
  <section class="panel lab rvl"><h2>${sp.icon} ${e(u("gm_" + id))}</h2><p class="lede">${e(u("gmHow_" + id))}</p>
    <div class="gstage ${sp.dom ? "dom" : ""}" id="gStage"><canvas aria-hidden="true"></canvas><div class="ghud" aria-live="polite"></div><div class="glay"></div><div class="gmsg" aria-live="assertive"></div>
      <div class="gres" hidden></div>
      <button type="button" class="scenebtn" id="gPlay" aria-label="${I18n.attr(u("gmStart"))}" title="${I18n.attr(u("gmStart"))}"><i aria-hidden="true">▶</i></button></div>
    <p class="muted gbest" id="gBest"></p></section>`;
  const stage = document.getElementById("gStage"), btn = document.getElementById("gPlay"), res = stage.querySelector(".gres");
  const showBest = () => { const b = bestOf(id); document.getElementById("gBest").innerHTML = b == null ? e(u("gmNoBest")) : `${e(u("gmBest"))}: <b>${fmt(id, b)}</b>`; };
  showBest();
  const run = makeRunner(id, stage, (value, detail) => {
    const pts = points(id, value), prevPts = (P.gm || {})[id], isBest = prevPts == null || pts > prevPts;
    if (value != null && isFinite(value)) { P.gm = P.gm || {}; if (isBest) P.gm[id] = pts; Course.touchDay(); save(); }
    const prevV = prevPts == null ? null : fromPoints(id, prevPts);
    res.innerHTML = `<div class="gresin"><span class="eyebrow">${e(u("gmScore"))} · ${e(u(DEF[id].lo ? "gmLowBetter" : "gmHighBetter"))}</span><b class="gval">${value == null ? "—" : fmt(id, value)}</b>${isBest && value != null ? `<span class="gnew">★ ${e(u("gmNewBest"))}</span>` : prevV != null ? `<span class="gprev">${e(u("gmBest"))}: ${fmt(id, prevV)}</span>` : ""}${detail ? `<p>${detail}</p>` : ""}</div>`;
    res.hidden = false; btn.querySelector("i").textContent = "↻"; btn.setAttribute("aria-label", I18n.one(u("tryAgain"))); btn.hidden = false;
    showBest();
    if (isBest && value != null && window.Motion && Motion.confetti) Motion.confetti();
  });
  run.preview();
  btn.addEventListener("click", () => { btn.hidden = true; res.hidden = true; run.start(); });
}

/* ---------- shared bits for games ---------- */
const rounds = (g, n, label) => g.hud(`${e(u(label || "gmRound"))} <b>${n}</b>`);
const avg = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const chips = (list) => `<span class="gchips">${list.map(([t, cls]) => `<span class="gchip ${cls || ""}">${t}</span>`).join("")}</span>`;
const msChips = (times) => chips(times.map((ms) => [`${Math.round(ms)} ms`]));
const metresAt = (ms, kmh = 60) => fx(kmh / 3.6 * ms / 1000, 1);

/* =========================== REACTION =========================== */

/* tap when the lead car's brake lights come on */
def("brakelight", {
  icon: "🚨", lo: true, unit: "ms",
  preview(g) { g.draw((c) => { D.persp(c, 170, 0); D.carRear(c, W / 2, 250, 1, "#475569"); }); },
  start(g) {
    const R = 5, times = []; let state = "wait", t0 = 0, scroll = 0, n = 1;
    const arm = () => { state = "wait"; rounds(g, n + " / " + R); g.after(rnd(1300, 3800), () => { state = "go"; t0 = g.now(); }); };
    g.loop((dt) => { if (state === "wait") scroll += dt * 1.8; g.draw((c) => { D.persp(c, 170, scroll); D.carRear(c, W / 2, 250 + (state === "go" ? 4 : 0), 1, "#475569", { brake: state === "go" }); }); });
    const hit = () => {
      if (state === "wait") { g.msg(t1("gmTooSoon"), "bad"); arm(); return; }
      if (state !== "go") return;
      const ms = g.now() - t0; times.push(ms); state = "done"; g.msg(`${Math.round(ms)} ms`, ms < 400 ? "good" : "", 800);
      if (++n > R) g.after(700, () => g.end(avg(times), `${e(u("gmAvgOf"))} ${msChips(times)}${e(u("gmAt60", { m: metresAt(avg(times)) }))}`));
      else g.after(800, arm);
    };
    g.on("tap", hit); g.on("key", (k) => { if (k === " " || k === "Enter") hit(); });
    arm();
  },
});

/* wait for green, don't jump the light */
def("greenlight", {
  icon: "🚦", lo: true, unit: "ms",
  preview(g) { g.draw((c) => { D.sky(c, "#1e293b", "#475569"); D.tlight(c, W / 2, 180, 1.05, "red"); }); },
  start(g) {
    const R = 5, times = []; let state = "red", t0 = 0, n = 1, jumps = 0;
    const arm = () => { state = "red"; rounds(g, n + " / " + R); g.after(rnd(1500, 4200), () => { state = "green"; t0 = g.now(); }); };
    g.loop(() => g.draw((c) => { D.sky(c, "#1e293b", "#475569"); D.tlight(c, W / 2, 180, 1.05, state === "green" || state === "done" ? "green" : "red"); }));
    const hit = () => {
      if (state === "red") { state = "done"; jumps++; g.msg(t1("gmJump"), "bad", 1100); times.push(1000); n++; if (n > R) return g.after(600, () => g.end(avg(times), `${e(u("gmAvgOf"))} ${msChips(times)}${jumps ? e(u("gmJumps", { n: jumps })) : ""}`)); return g.after(900, arm); }
      if (state !== "green") return;
      const ms = g.now() - t0; times.push(ms); state = "done"; g.msg(`${Math.round(ms)} ms`, "good", 700);
      if (++n > R) g.after(600, () => g.end(avg(times), `${e(u("gmAvgOf"))} ${msChips(times)}${jumps ? e(u("gmJumps", { n: jumps })) : ""}`)); else g.after(800, arm);
    };
    g.on("tap", hit); g.on("key", (k) => { if (k === " " || k === "Enter") hit(); });
    arm();
  },
});

/* a child steps out between parked cars */
def("kidout", {
  icon: "🧒", lo: true, unit: "ms",
  preview(g) { g.draw((c) => { D.roadV(c, W / 2, 2, 100, 0); [60, 170, 280].forEach((y) => D.carTop(c, W / 2 - 128, y, 44, 80, "#94a3b8")); D.carTop(c, W / 2 - 50, 330, 46, 84, "#2563eb"); }); },
  start(g) {
    const R = 5, times = []; let scroll = 0, n = 1, kid = null, t0 = 0, state = "drive";
    const arm = () => { state = "drive"; kid = null; rounds(g, n + " / " + R); g.after(rnd(1400, 3600), () => { kid = { y: rnd(110, 200), x: W / 2 - 128, w: 0 }; state = "go"; t0 = g.now(); }); };
    g.loop((dt) => {
      if (state === "drive" || state === "go") scroll += dt * 260;
      if (kid) { kid.x += dt * 60; kid.w += dt * 9; kid.y += state === "done" ? 0 : dt * 260; }
      g.draw((c) => {
        D.roadV(c, W / 2, 2, 100, scroll);
        for (let k = 0; k < 6; k++) { const y = ((k * 130 + scroll) % 780) - 130; D.carTop(c, W / 2 - 128, y, 44, 80, ["#94a3b8", "#64748b", "#cbd5e1"][k % 3]); }
        if (kid) D.ped(c, kid.x, kid.y, 0.9, "#f43f5e", { walk: kid.w });
        D.carTop(c, W / 2 - 50, 330, 46, 84, "#2563eb", { brake: state === "done" });
      });
    });
    const hit = () => {
      if (state === "drive") { g.msg(t1("gmTooSoon"), "bad"); return; }
      if (state !== "go") return;
      const ms = g.now() - t0; times.push(ms); state = "done"; g.msg(`${Math.round(ms)} ms · ${metresAt(ms, 40)} m`, ms < 700 ? "good" : "bad", 1000);
      if (++n > R) g.after(900, () => g.end(avg(times), `${e(u("gmAvgOf"))} ${msChips(times)}${e(u("gmAt40", { m: metresAt(avg(times), 40) }))}`)); else g.after(1100, arm);
    };
    g.on("tap", hit); g.on("key", (k) => { if (k === " " || k === "Enter") hit(); });
    arm();
  },
});

/* go / no-go: tap green arrows only */
def("gonogo", {
  icon: "✋", unit: "%",
  preview(g) { g.draw((c) => { D.sky(c, "#0f172a", "#1e293b"); D.text(c, "➜", W / 2 - 80, 200, 96, "#22c55e"); D.text(c, "✋", W / 2 + 80, 200, 80, "#ef4444"); }); },
  start(g) {
    const N = 20; let i = 0, ok = 0, cur = null, t0 = 0, rts = [];
    const nextT = () => {
      if (i >= N) return g.end(ok / N * 100, e(u("gmAvgMs", { ms: Math.round(avg(rts)) })));
      i++; rounds(g, i + " / " + N);
      cur = { go: Math.random() < 0.65, done: false }; t0 = g.now();
      g.after(950, () => { if (!cur.done) { if (!cur.go) ok++; else g.msg(t1("gmMissed"), "bad", 500); } cur = null; g.after(rnd(250, 600), nextT); });
    };
    g.loop(() => g.draw((c) => { D.sky(c, "#0f172a", "#1e293b"); if (cur) cur.go ? D.text(c, "➜", W / 2, 200, 150, "#22c55e") : D.text(c, "✋", W / 2, 200, 130, "#ef4444"); }));
    const hit = () => { if (!cur || cur.done) return; cur.done = true; if (cur.go) { ok++; rts.push(g.now() - t0); g.msg(t1("gmCorrect"), "good", 350); } else g.msg(t1("gmWrong"), "bad", 500); };
    g.on("tap", hit); g.on("key", (k) => { if (k === " " || k === "Enter") hit(); });
    g.after(600, nextT);
  },
});

/* match the indicator: left or right */
def("indicator", {
  icon: "↔️", lo: true, unit: "ms",
  preview(g) { g.draw((c) => { D.persp(c, 170, 0); D.carRear(c, W / 2, 250, 1, "#0f766e", { ind: "l", on: true }); }); },
  start(g) {
    const R = 10; let n = 0, side = null, t0 = 0, times = [], wrong = 0;
    const arm = () => { side = null; if (n >= R) return g.end(avg(times) + wrong * 250, `${e(u("gmAvgOf"))} ${msChips(times)}${wrong ? e(u("gmWrongN", { n: wrong })) : ""}`); n++; rounds(g, n + " / " + R); g.after(rnd(800, 2200), () => { side = pick(["l", "r"]); t0 = g.now(); }); };
    g.loop((dt, now) => g.draw((c) => { D.persp(c, 170, 0); D.carRear(c, W / 2, 250, 1, "#0f766e", { ind: side, on: Math.floor(now / 330) % 2 === 0 }); }));
    const ans = (s) => {
      if (!side) { g.msg(t1("gmTooSoon"), "bad", 500); return; }
      const ms = g.now() - t0;
      if (s === side) { times.push(ms); g.msg(`${Math.round(ms)} ms`, "good", 500); } else { wrong++; times.push(ms); g.msg(t1("gmWrong"), "bad", 600); }
      side = null; g.after(500, arm);
    };
    g.btns([`← ${t1("gmLeft")}`, `${t1("gmRight")} →`], (i) => ans(i ? "r" : "l"), "two");
    g.on("key", (k) => { if (k === "ArrowLeft") ans("l"); if (k === "ArrowRight") ans("r"); });
    arm();
  },
});

/* spot the bike in the mirrors */
def("mirrors", {
  icon: "🪞", unit: "",
  preview(g) { g.draw((c) => drawMirrors(c, null, 0)); },
  start(g) {
    const N = 12; let i = 0, ok = 0, cur = null, shown = null, answered = true;
    const nextT = () => {
      if (i >= N) return g.end(ok, e(u("gmOutOf", { n: ok, t: N })));
      i++; rounds(g, i + " / " + N); answered = false; shown = null;
      g.after(rnd(500, 1400), () => { cur = { m: ri(0, 2) }; shown = cur.m; g.after(Math.max(260, 900 - i * 50), () => { cur = null; }); });
      g.after(2600, () => { if (!answered) g.msg(t1("gmMissed"), "bad", 500); nextT(); });
    };
    g.loop((dt, now) => g.draw((c) => drawMirrors(c, cur ? cur.m : null, now)));
    g.on("tap", (x, y) => {
      const m = mirrorAt(x, y); if (m == null || answered) return;
      if (shown == null) { g.msg(t1("gmTooSoon"), "bad", 500); return; }
      answered = true;
      if (m === shown) { ok++; g.msg(t1("gmCorrect"), "good", 400); } else g.msg(t1("gmWrong"), "bad", 500);
    });
    nextT();
  },
});
const MIR = [[40, 90, 150, 90], [245, 20, 150, 60], [450, 90, 150, 90]];
const mirrorAt = (x, y) => { const k = MIR.findIndex(([mx, my, w, h]) => x >= mx - 10 && x <= mx + w + 10 && y >= my - 10 && y <= my + h + 10); return k < 0 ? null : k; };
function drawMirrors(c, show, now) {
  c.fillStyle = "#0f172a"; c.fillRect(0, 0, W, H);
  D.persp(c, 230, now / 900);
  c.fillStyle = "#111827"; c.fillRect(0, 300, W, 100);
  c.strokeStyle = "#334155"; c.lineWidth = 14; c.beginPath(); c.arc(W / 2, 400, 82, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  MIR.forEach(([x, y, w, h], i) => {
    c.save(); D.rr(c, x - 6, y - 6, w + 12, h + 12, 16); c.fillStyle = "#020617"; c.fill(); D.rr(c, x, y, w, h, 12); c.clip();
    const gr = c.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, "#9cc3e6"); gr.addColorStop(0.5, "#dbe8f3"); gr.addColorStop(0.5, "#3b3d40"); gr.addColorStop(1, "#2a2c30"); c.fillStyle = gr; c.fillRect(x, y, w, h);
    if (show === i) D.bike(c, x + w / 2 + (i === 1 ? 0 : (i === 0 ? 25 : -25)), y + h * 0.66, 0.9, "#dc2626");
    c.restore();
  });
}

/* hazards at the edge of vision */
def("peripheral", {
  icon: "👁️", unit: "",
  preview(g) { g.draw((c) => { D.persp(c, 170, 0); D.text(c, "+", W / 2, 140, 40, "#fff"); }); },
  start(g) {
    const N = 12; let i = 0, ok = 0, cur = null, scroll = 0, answered = true, lastSide = null;
    const nextT = () => {
      if (i >= N) return g.end(ok, e(u("gmOutOf", { n: ok, t: N })));
      i++; rounds(g, i + " / " + N); answered = false; lastSide = null;
      g.after(rnd(600, 1600), () => { cur = { side: pick(["l", "r"]), kind: pick(["ped", "bike", "cow"]) }; lastSide = cur.side; g.after(Math.max(200, 700 - i * 40), () => { cur = null; }); });
      g.after(2600, () => { if (!answered) g.msg(t1("gmMissed"), "bad", 500); nextT(); });
    };
    g.loop((dt) => { scroll += dt * 1.4; g.draw((c) => {
      D.persp(c, 170, scroll); D.text(c, "+", W / 2, 140, 40, "#fff");
      if (cur) { const x = cur.side === "l" ? 40 : W - 40; if (cur.kind === "ped") D.ped(c, x, 250, 1.1); else if (cur.kind === "cow") D.cow(c, x, 270, 1, cur.side === "l" ? 1 : -1); else D.bike(c, x, 260, 1.2, "#dc2626", cur.side === "l" ? 0.6 : -0.6); }
    }); });
    const ans = (s) => { if (answered) return; if (!lastSide) { g.msg(t1("gmTooSoon"), "bad", 500); return; } answered = true; if (s === lastSide) { ok++; g.msg(t1("gmCorrect"), "good", 400); } else g.msg(t1("gmWrong"), "bad", 500); };
    g.btns([`← ${t1("gmLeft")}`, `${t1("gmRight")} →`], (k) => ans(k ? "r" : "l"), "two");
    g.on("key", (k) => { if (k === "ArrowLeft") ans("l"); if (k === "ArrowRight") ans("r"); });
    nextT();
  },
});

/* brake to stop on the line */
def("stopline", {
  icon: "🛑", lo: true, unit: "cm",
  preview(g) { g.draw((c) => { D.roadV(c, W / 2, 1, 120, 0); c.fillStyle = "#fff"; c.fillRect(W / 2 - 60, 80, 120, 8); D.carTop(c, W / 2, 330, 50, 90, "#2563eb"); }); },
  start(g) {
    const R = 4, errs = [], rec = []; let n = 0, car = null;
    const PX = 5;   // px per metre
    const arm = () => {
      if (n >= R) return g.end(avg(errs), `${e(u("gmAvgOf"))} ${chips(rec)}${e(u("gmStopTip"))}`);
      n++; const kmh = ri(30, 60); rounds(g, `${n} / ${R} · ${kmh} km/h`);
      car = { m: -((kmh / 3.6) ** 2) / (2 * 6.9) - rnd(16, 28), v: kmh / 3.6, braking: false, done: false };
    };
    g.loop((dt) => {
      if (car && !car.done) {
        if (car.braking) car.v = Math.max(0, car.v - 6.9 * dt);
        car.m += car.v * dt;
        if (car.v === 0 && car.braking) { car.done = true; const err = Math.abs(car.m) * 100; const crossed = car.m > 0.05;
          errs.push(crossed ? Math.max(err, 300) : err); rec.push([crossed ? `${Math.round(err)} cm ${t1("gmOver")}${err < 300 ? " → 300 cm" : ""}` : `${Math.round(err)} cm ${t1("gmShort")}`, crossed ? "bad" : err < 100 ? "good" : ""]); g.msg(crossed ? `${t1("gmCrossed")} ${Math.round(err)} cm` : `${Math.round(err)} cm`, crossed ? "bad" : err < 100 ? "good" : "", 1200); g.after(1300, arm); }
        if (car.m > 12) { car.done = true; errs.push(1200); rec.push([`${t1("gmOver")} → 1200 cm`, "bad"]); g.msg(t1("gmCrossed"), "bad", 1000); g.after(1200, arm); }
      }
      g.draw((c) => {
        const off = car ? car.m * PX : 0;
        D.roadV(c, W / 2, 1, 120, off * 0);
        const ly = 110 - 0;
        c.fillStyle = "#fff"; c.fillRect(W / 2 - 60, ly, 120, 8);
        for (let k = -8; k <= 8; k++) { if (!k) continue; c.fillStyle = "rgba(255,255,255,.35)"; c.fillRect(W / 2 + 64, ly - k * PX * 5, 10, 2); }
        const cy = ly - (car ? car.m : -40) * PX + 45;
        D.carTop(c, W / 2, Math.min(cy, 600), 50, 90, "#2563eb", { brake: car && car.braking });
      });
    });
    const hit = () => { if (car && !car.braking && !car.done) car.braking = true; };
    g.on("tap", hit); g.on("key", (k) => { if (k === " " || k === "Enter") hit(); });
    arm();
  },
});

/* lane changes to dodge potholes and cones */
def("dodge", {
  icon: "🕳️", unit: "m",
  start(g) {
    let lane = 1, x = W / 2, scroll = 0, speed = 220, dist = 0, obs = [], spawn = 0, crashed = false;
    const LX = (l) => W / 2 + (l - 1) * 90;
    g.loop((dt) => {
      if (!crashed) {
        speed += dt * 8; scroll += speed * dt; dist += speed * dt / 10; spawn -= dt;
        if (spawn <= 0) { const free = ri(0, 2); [0, 1, 2].forEach((l) => { if (l !== free && Math.random() < 0.55) obs.push({ l, y: -40, k: pick(["hole", "cone", "auto"]) }); }); spawn = clamp(260 / speed, 0.45, 1.1); }
        obs.forEach((o) => { o.y += speed * dt; }); obs = obs.filter((o) => o.y < H + 60);
        x += (LX(lane) - x) * Math.min(1, dt * 14);
        if (obs.some((o) => Math.abs(LX(o.l) - x) < 40 && Math.abs(o.y - 320) < (o.k === "auto" ? 58 : 36))) { crashed = true; g.msg(t1("gmCrash"), "bad", 0); g.after(900, () => g.end(dist)); }
        g.hud(`<b>${Math.round(dist)} m</b> · ${Math.round(speed / 4)} km/h`);
      }
      g.draw((c) => {
        D.roadV(c, W / 2, 3, 90, scroll);
        obs.forEach((o) => { const ox = LX(o.l); if (o.k === "hole") { c.fillStyle = "#1c1917"; c.beginPath(); c.ellipse(ox, o.y, 26, 15, 0, 0, 7); c.fill(); c.fillStyle = "#57534e"; c.beginPath(); c.ellipse(ox - 3, o.y - 3, 18, 9, 0, 0, 7); c.fill(); }
          else if (o.k === "cone") { [-14, 14].forEach((dx) => { c.fillStyle = "#f97316"; c.beginPath(); c.moveTo(ox + dx, o.y - 16); c.lineTo(ox + dx + 10, o.y + 12); c.lineTo(ox + dx - 10, o.y + 12); c.fill(); c.fillStyle = "#fff"; c.fillRect(ox + dx - 5, o.y - 2, 10, 4); }); }
          else D.carTop(c, ox, o.y, 40, 64, "#facc15", { brake: true }); });
        D.carTop(c, x, 320, 46, 84, crashed ? "#dc2626" : "#2563eb");
      });
    });
    const go = (d) => { lane = clamp(lane + d, 0, 2); };
    g.on("tap", (px) => go(px < W / 2 ? -1 : 1));
    g.on("key", (k) => { if (k === "ArrowLeft") go(-1); if (k === "ArrowRight") go(1); });
  },
});

/* keep inside a winding lane */
def("lanekeep", {
  icon: "〰️", unit: "%",
  start(g) {
    let s = 0, x = W / 2, target = 0, inLane = 0, total = 0, t = 0;
    const T = 30, centre = (yy) => W / 2 + Math.sin((s + (400 - yy)) / 160) * 120 + Math.sin((s + (400 - yy)) / 63) * 30;
    let hold = 0; x = target = centre(320) - 35;
    g.on("down", (px) => { hold = px < W / 2 ? -1 : 1; }); g.on("up", () => { hold = 0; });
    g.on("move", (px, py, ev) => { if (ev.pressure > 0 || ev.buttons) hold = px < W / 2 ? -1 : 1; });
    const keys = {}; g.on("key", (k, ev) => { keys[k] = true; const up = () => { keys[k] = false; window.removeEventListener("keyup", up); }; window.addEventListener("keyup", up); void ev; });
    g.loop((dt) => {
      t += dt; s += dt * 260;
      const dir = hold || (keys.ArrowLeft ? -1 : keys.ArrowRight ? 1 : 0);
      target += dir * 360 * dt; x += (target - x) * Math.min(1, dt * 8); x = clamp(x, 40, W - 40); target = clamp(target, 40, W - 40);
      const off = Math.abs(x - (centre(320) - 35)); total += dt; if (off < 30) inLane += dt;
      g.hud(`<b>${Math.round(inLane / Math.max(0.01, total) * 100)}%</b> · ${Math.ceil(T - t)} s`);
      if (t >= T) g.end(inLane / total * 100);
      g.draw((c) => {
        c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
        const ys = []; for (let yy = -10; yy <= H + 10; yy += 5) ys.push(yy);
        const edge = (dx) => { c.beginPath(); ys.forEach((yy, k) => { const x2 = centre(yy) + dx; k ? c.lineTo(x2, yy) : c.moveTo(x2, yy); }); };
        c.fillStyle = "#a8a29e"; c.beginPath(); ys.forEach((yy, k) => { const x2 = centre(yy) - 80; k ? c.lineTo(x2, yy) : c.moveTo(x2, yy); }); ys.slice().reverse().forEach((yy) => c.lineTo(centre(yy) + 80, yy)); c.fill();
        c.fillStyle = "#3b3d40"; c.beginPath(); ys.forEach((yy, k) => { const x2 = centre(yy) - 70; k ? c.lineTo(x2, yy) : c.moveTo(x2, yy); }); ys.slice().reverse().forEach((yy) => c.lineTo(centre(yy) + 70, yy)); c.fill();
        c.strokeStyle = "#f2f2f2"; c.lineWidth = 3; edge(-66); c.stroke(); edge(66); c.stroke();
        c.setLineDash([14, 14]); c.lineDashOffset = -s; edge(0); c.stroke(); c.setLineDash([]);
        D.carTop(c, x, 320, 40, 72, off < 30 ? "#2563eb" : "#dc2626", { rot: clamp((target - x) / 300, -0.4, 0.4) });
      });
    });
  },
});

/* hold the speed inside the band */
def("speedkeep", {
  icon: "⏱️", unit: "%",
  start(g) {
    let v = 40, t = 0, inBand = 0, hold = false, grade = 0, gt = 0;
    const T = 30, lo = 45, hi = 55;
    g.on("down", () => { hold = true; }); g.on("up", () => { hold = false; });
    g.on("key", (k) => { if (k === " " || k === "ArrowUp") { hold = true; const up = () => { hold = false; window.removeEventListener("keyup", up); }; window.addEventListener("keyup", up); } });
    g.loop((dt, now) => {
      t += dt; gt -= dt; if (gt <= 0) { grade = rnd(-6, 6); gt = rnd(2, 4); }
      v += ((hold ? 9 : -2.5) - grade * 1.2) * dt; v = clamp(v, 0, 90);
      if (v >= lo && v <= hi) inBand += dt;
      g.hud(`<b>${Math.round(inBand / Math.max(0.01, t) * 100)}%</b> · ${Math.ceil(T - t)} s · ${grade > 1 ? "⬆" : grade < -1 ? "⬇" : "➡"}`);
      if (t >= T) g.end(inBand / t * 100);
      g.draw((c) => {
        c.fillStyle = "#0f172a"; c.fillRect(0, 0, W, H);
        const cx = W / 2, cy = 260, R = 160, A = (s) => Math.PI * (1.1 - s / 90 * 1.2);
        c.lineWidth = 18;
        c.beginPath(); c.strokeStyle = "#334155"; c.arc(cx, cy, R, -A(0), -A(90)); c.stroke();
        c.beginPath(); c.strokeStyle = "#22c55e"; c.arc(cx, cy, R, -A(lo), -A(hi)); c.stroke();
        for (let s = 0; s <= 90; s += 10) { const a = A(s); D.text(c, s, cx + Math.cos(a) * (R - 34), cy - Math.sin(a) * (R - 34), 14, "#cbd5e1"); }
        const a = A(v); c.lineWidth = 5; c.strokeStyle = "#ef4444"; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 10), cy - Math.sin(a) * (R - 10)); c.stroke();
        D.text(c, `${Math.round(v)} km/h`, cx, cy + 40, 30, v >= lo && v <= hi ? "#22c55e" : "#f8fafc", "center", 700);
        D.text(c, hold ? "⛽" : "", cx, cy - 60, 30); void now;
      });
    });
  },
});

/* pull out of a side road into a safe gap */
def("gapjudge", {
  icon: "🚗", unit: "",
  start(g) {
    const R = 6; let n = 0, score = 0, cars = [], waiting = 0, state = "wait", you = 0;
    const NEED = 4.2, SPEED = 140;   // s to clear; px/s
    const newRound = () => { if (n >= R) return g.end(score, e(u("gmGapTip"))); n++; rounds(g, n + " / " + R); cars = []; let x = W + 60; for (let k = 0; k < 14; k++) { x += rnd(90, 900); cars.push({ x }); } waiting = 0; state = "wait"; you = 0; };
    g.loop((dt) => {
      cars.forEach((cc) => { cc.x -= SPEED * dt; });
      if (state === "wait") waiting += dt;
      if (state === "go") { you += dt; if (you > NEED) { state = "done"; } }
      g.draw((c) => {
        c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
        c.fillStyle = "#3b3d40"; c.fillRect(0, 110, W, 110); c.fillRect(W / 2 - 50, 220, 100, 180);
        c.fillStyle = "#f2f2f2"; for (let x = 0; x < W; x += 40) c.fillRect(x, 163, 22, 4);
        for (let x = W / 2 - 46; x < W / 2 + 46; x += 14) c.fillRect(x, 222, 8, 4);
        cars.forEach((cc) => D.carTop(c, cc.x, 192, 44, 78, "#dc2626", { rot: -Math.PI / 2 }));
        const yy = state === "wait" ? 280 : 280 - clamp(you / NEED, 0, 1) * 88, rot = state === "wait" ? 0 : -clamp(you / NEED * 1.6, 0, Math.PI / 2);
        D.carTop(c, W / 2 - 25 - (state === "wait" ? 0 : clamp(you / NEED, 0, 1) * 80), yy, 42, 76, "#2563eb", { rot });
      });
    });
    g.btns([`▶ ${t1("gmGo")}`], () => {
      if (state !== "wait") return;
      state = "go";
      const tGap = cars.filter((cc) => cc.x > W / 2 - 30).map((cc) => (cc.x - W / 2) / SPEED).filter((s) => s > -0.5);
      const next = tGap.length ? Math.min(...tGap) : 99, safe = next > NEED + 0.5;
      const pts = safe ? Math.max(20, 100 - Math.round(waiting * 6)) : 0; score += pts;
      g.msg(safe ? `${t1("gmSafe")} +${pts}` : t1("gmUnsafe"), safe ? "good" : "bad", 1200);
      g.after(1500, newRound);
    }, "one");
    newRound();
  },
});

/* which animal is coming onto the road? */
def("animals", {
  icon: "🐄", unit: "",
  start(g) {
    const N = 14; let i = 0, ok = 0, cur = null, scroll = 0;
    const nextT = () => {
      if (i >= N) return g.end(ok, e(u("gmOutOf", { n: ok, t: N })));
      i++; rounds(g, i + " / " + N);
      const side = pick([-1, 1]), onto = Math.random() < 0.5;
      cur = { side, onto, x: W / 2 + side * 170, y: 90, kind: pick(["cow", "dog"]), done: false };
      g.after(2400, () => { if (cur && !cur.done) { if (!cur.onto) ok++; else g.msg(t1("gmMissed"), "bad", 500); } cur = null; g.after(300, nextT); });
    };
    g.loop((dt) => { scroll += dt * 150; if (cur) { cur.y += dt * 150; if (cur.onto) cur.x -= cur.side * dt * 40; } g.draw((c) => {
      D.roadV(c, W / 2, 2, 100, scroll, "#5f8f3b");
      if (cur) { if (cur.kind === "cow") D.cow(c, cur.x, cur.y, 1, cur.onto ? -cur.side : (cur.side > 0 ? 1 : -1)); else { c.fillStyle = "#b7793f"; c.beginPath(); c.ellipse(cur.x, cur.y, 16, 8, 0, 0, 7); c.fill(); c.beginPath(); c.arc(cur.x + (cur.onto ? -cur.side : cur.side) * 16, cur.y - 2, 6, 0, 7); c.fill(); } }
      D.carTop(c, W / 2 - 50, 330, 46, 84, "#2563eb");
    }); });
    g.btns([`🛑 ${t1("gmBrake")}`, `➡ ${t1("gmCarryOn")}`], (k) => { if (!cur || cur.done) return; cur.done = true; const right = (k === 0) === cur.onto; if (right) { ok++; g.msg(t1("gmCorrect"), "good", 400); } else g.msg(t1("gmWrong"), "bad", 500); }, "two");
    nextT();
  },
});

/* tap when you can see the vehicle in the fog */
def("fogspot", {
  icon: "🌫️", lo: true, unit: "ms",
  preview(g) { g.draw((c) => { D.persp(c, 170, 0); D.fog(c, 0.85); }); },
  start(g) {
    const R = 5, times = []; let n = 0, obj = null, scroll = 0, t0 = 0;
    const arm = () => { obj = null; if (n >= R) return g.end(avg(times), `${e(u("gmAvgOf"))} ${msChips(times)}${e(u("gmFogTip"))}`); n++; rounds(g, n + " / " + R); g.after(rnd(1000, 3000), () => { obj = { k: pick(["car", "ped", "truck"]), t: 0, x: W / 2 + pick([-60, -40, 40]) }; t0 = g.now(); }); };
    g.loop((dt) => { scroll += dt; if (obj) obj.t += dt; g.draw((c) => {
      D.persp(c, 170, scroll);
      if (obj) { const sc = 0.35 + obj.t * 0.35; if (obj.k === "ped") D.ped(c, obj.x, 230 + obj.t * 30, sc * 1.6); else D.carRear(c, obj.x, 220 + obj.t * 30, sc * 0.8, obj.k === "truck" ? "#a16207" : "#64748b", { brake: true }); }
      D.fog(c, obj ? clamp(0.93 - obj.t * 0.22, 0.25, 0.93) : 0.93);
      D.carRear(c, W / 2, 470, 1.6, "#2563eb");
    }); });
    const hit = () => { if (!obj) { g.msg(t1("gmTooSoon"), "bad", 500); return; } const ms = g.now() - t0; times.push(ms); g.msg(`${Math.round(ms)} ms`, ms < 1400 ? "good" : "", 700); obj = null; g.after(800, arm); };
    g.on("tap", hit); g.on("key", (k) => { if (k === " " || k === "Enter") hit(); });
    arm();
  },
});

/* a pedestrian in dark clothes at night */
def("nightped", {
  icon: "🌙", lo: true, unit: "ms",
  preview(g) { g.draw((c) => drawNight(c, 0, null)); },
  start(g) {
    const R = 6, times = []; let n = 0, ped = null, scroll = 0, t0 = 0, misses = 0;
    const arm = () => { ped = null; if (n >= R) return g.end(avg(times) + misses * 300, `${e(u("gmAvgOf"))} ${msChips(times)}${misses ? e(u("gmMissTaps", { n: misses })) + " " : ""}${e(u("gmNightTip"))}`); n++; rounds(g, n + " / " + R); g.after(rnd(900, 2800), () => { ped = { x: pick([210, 260, 380, 430]), y: rnd(210, 250), t: 0 }; t0 = g.now(); }); };
    g.loop((dt) => { scroll += dt * 1.2; if (ped) ped.t += dt; g.draw((c) => drawNight(c, scroll, ped)); });
    g.on("tap", (x, y) => {
      if (!ped) { g.msg(t1("gmTooSoon"), "bad", 500); return; }
      if (Math.hypot(x - ped.x, y - ped.y) > 70) { misses++; g.msg(t1("gmWrong"), "bad", 500); return; }
      const ms = g.now() - t0; times.push(ms); g.msg(`${Math.round(ms)} ms`, "good", 600); ped = null; g.after(700, arm);
    });
    arm();
  },
});
function drawNight(c, scroll, ped) {
  D.persp(c, 170, scroll, true);
  const g = c.createRadialGradient(W / 2, 330, 20, W / 2, 230, 300); g.addColorStop(0, "rgba(255,240,200,.38)"); g.addColorStop(1, "rgba(255,240,200,0)");
  c.fillStyle = g; c.beginPath(); c.moveTo(W / 2 - 160, H); c.lineTo(W / 2 - 50, 190); c.lineTo(W / 2 + 50, 190); c.lineTo(W / 2 + 160, H); c.fill();
  if (ped) { c.globalAlpha = clamp(0.25 + ped.t * 0.35, 0, 0.9); D.ped(c, ped.x, ped.y, 0.9 + ped.t * 0.15, "#1f2937", { dark: true, walk: ped.t * 8 }); c.globalAlpha = 1; }
}

/* =========================== LOGIC =========================== */

/* slide the cars out of the way (verified puzzles; min = fewest moves) */
const PARK = [{ "cars": [[2, 1, 2, true], [3, 3, 2, false], [1, 4, 3, false], [3, 1, 2, true], [5, 2, 2, true], [4, 0, 2, true], [0, 0, 2, true], [3, 0, 3, false]], "min": 4 }, { "cars": [[2, 0, 2, true], [0, 2, 3, false], [0, 4, 2, false], [5, 1, 2, true], [1, 3, 2, false], [4, 3, 2, false], [3, 4, 3, false]], "min": 7 }, { "cars": [[2, 0, 2, true], [0, 3, 3, false], [3, 0, 2, true], [4, 5, 2, false], [0, 2, 2, false], [1, 5, 2, false], [3, 2, 2, false]], "min": 8 }, { "cars": [[2, 0, 2, true], [0, 2, 3, false], [4, 4, 2, true], [3, 3, 2, true], [0, 5, 3, false], [0, 3, 2, true], [5, 0, 3, true], [3, 5, 2, false]], "min": 10 }, { "cars": [[2, 0, 2, true], [1, 2, 2, false], [3, 3, 3, true], [0, 5, 3, false], [4, 1, 2, false], [2, 4, 2, false], [0, 3, 2, false]], "min": 13 }, { "cars": [[2, 0, 2, true], [0, 2, 2, false], [2, 5, 2, false], [4, 0, 2, true], [0, 4, 2, false], [2, 3, 3, false], [5, 4, 2, true], [1, 1, 2, true]], "min": 14 }];
def("parking", {
  icon: "🅿️", unit: "",
  preview(g) { g.draw((c) => drawPark(c, PARK[0].cars.map((x) => x.slice()), -1)); },
  start(g) {
    let lv = 0, cars, moves = 0, sel = -1, solved = 0, drag = null;
    const load = () => { cars = PARK[lv].cars.map((x) => x.slice()); moves = 0; sel = -1; hud(); };
    const hud = () => g.hud(`${e(u("gmLevel"))} <b>${lv + 1}/${PARK.length}</b> · ${e(u("gmMoves"))} <b>${moves}</b> · ${e(u("gmMin"))} ${PARK[lv].min}`);
    const cell = (x, y) => [Math.floor((y - 20) / 60), Math.floor((x - 140) / 60)];
    const grid = () => { const gg = [...Array(6)].map(() => Array(6).fill(-1)); cars.forEach(([r, cc, l, h], i) => { for (let k = 0; k < l; k++) gg[h ? r : r + k][h ? cc + k : cc] = i; }); return gg; };
    const tryMove = (i, d) => {
      const [r, cc, l, h] = cars[i], gg = grid();
      const nr = h ? r : r + d, nc = h ? cc + d : cc;
      const cells = []; for (let k = 0; k < l; k++) cells.push(h ? [nr, nc + k] : [nr + k, nc]);
      if (cells.some(([a, b]) => a < 0 || b < 0 || a > 5 || b > 5 || (gg[a][b] !== -1 && gg[a][b] !== i))) return false;
      cars[i] = [nr, nc, l, h]; return true;
    };
    g.on("down", (x, y) => { const [r, cc] = cell(x, y); if (r < 0 || r > 5 || cc < 0 || cc > 5) return; const gg = grid(); sel = gg[r][cc]; drag = sel >= 0 ? { x, y, moved: 0 } : null; });
    g.on("move", (x, y) => {
      if (!drag || sel < 0) return; const h = cars[sel][3], d = h ? x - drag.x : y - drag.y;
      if (Math.abs(d) >= 60) { if (tryMove(sel, Math.sign(d))) { drag.moved++; if (h) drag.x += Math.sign(d) * 60; else drag.y += Math.sign(d) * 60; } }
    });
    g.on("up", () => {
      if (drag && drag.moved) { moves++; hud(); }
      drag = null;
      if (cars[0][1] + cars[0][2] === 6) {
        solved++; g.msg(`${t1("gmSolved")} · ${moves} / ${PARK[lv].min}`, "good", 1400);
        if (++lv >= PARK.length) g.after(1400, () => g.end(solved, e(u("gmParkDone"))));
        else g.after(1400, load);
      }
    });
    g.on("key", (k) => { if (sel < 0) return; const h = cars[sel][3]; const d = (h && k === "ArrowLeft") || (!h && k === "ArrowUp") ? -1 : (h && k === "ArrowRight") || (!h && k === "ArrowDown") ? 1 : 0; if (d && tryMove(sel, d)) { moves++; hud(); g.on("_", null); } });
    g.btns([`⏭ ${t1("gmSkip")}`], () => { if (++lv >= PARK.length) g.end(solved, e(u("gmParkDone"))); else load(); }, "one");
    g.loop(() => g.draw((c) => drawPark(c, cars, sel)));
    load();
  },
});
function drawPark(c, cars, sel) {
  c.fillStyle = "#1e293b"; c.fillRect(0, 0, W, H);
  c.fillStyle = "#3b3d40"; D.rr(c, 136, 16, 368, 368, 12); c.fill();
  c.strokeStyle = "rgba(255,255,255,.12)"; c.lineWidth = 1;
  for (let k = 1; k < 6; k++) { c.beginPath(); c.moveTo(140 + k * 60, 20); c.lineTo(140 + k * 60, 380); c.stroke(); c.beginPath(); c.moveTo(140, 20 + k * 60); c.lineTo(500, 20 + k * 60); c.stroke(); }
  c.fillStyle = "#22c55e"; c.fillRect(500, 140, 18, 60); D.text(c, "EXIT", 560, 170, 16, "#22c55e");
  const cols = ["#2563eb", "#f59e0b", "#a855f7", "#14b8a6", "#ef4444", "#84cc16", "#f97316", "#0ea5e9", "#e879f9", "#facc15", "#94a3b8", "#fb7185"];
  cars.forEach(([r, cc, l, h], i) => {
    const x = 140 + cc * 60 + 5, y = 20 + r * 60 + 5, w = (h ? l * 60 : 60) - 10, hh = (h ? 60 : l * 60) - 10;
    c.fillStyle = i === 0 ? "#dc2626" : cols[i % cols.length]; D.rr(c, x, y, w, hh, 10); c.fill();
    c.fillStyle = "rgba(15,23,42,.55)"; if (h) { D.rr(c, x + w * 0.55, y + 6, w * 0.18, hh - 12, 4); } else D.rr(c, x + 6, y + hh * 0.22, w - 12, hh * 0.16, 4); c.fill();
    if (i === sel) { c.strokeStyle = "#fff"; c.lineWidth = 3; D.rr(c, x, y, w, hh, 10); c.stroke(); }
    if (l === 3) D.text(c, "🚚", x + w / 2, y + hh / 2, 20);
  });
}

/* legal shortest route on a grid with one-way streets */
def("route", {
  icon: "🗺️", unit: "", dom: false,
  start(g) {
    const N = 5, R = 5; let n = 0, ok = 0, P0, path, edges, A, Bn, best;
    const key = (a, b) => a + ">" + b, id = (r, cc) => r * N + cc, rc = (k) => [Math.floor(k / N), k % N];
    const gen = () => {
      for (;;) {
        edges = {};
        for (let r = 0; r < N; r++) for (let cc = 0; cc < N; cc++) [[0, 1], [1, 0]].forEach(([dr, dc]) => {
          const r2 = r + dr, c2 = cc + dc; if (r2 >= N || c2 >= N) return;
          const a = id(r, cc), b = id(r2, c2), k = Math.random();
          if (k < 0.12) { /* closed */ } else if (k < 0.35) edges[key(a, b)] = 1; else if (k < 0.58) edges[key(b, a)] = 1; else { edges[key(a, b)] = 1; edges[key(b, a)] = 1; }
        });
        A = id(N - 1, ri(0, 1)); Bn = id(0, ri(N - 2, N - 1));
        const dist = { [A]: 0 }, q = [A];
        while (q.length) { const x = q.shift(); for (let y = 0; y < N * N; y++) if (edges[key(x, y)] && dist[y] == null) { dist[y] = dist[x] + 1; q.push(y); } }
        if (dist[Bn] != null && dist[Bn] >= 6) { best = dist[Bn]; return; }
      }
    };
    const round = () => { if (n >= R) return g.end(ok, e(u("gmOutOf", { n: ok, t: R }))); n++; gen(); path = [A]; P0 = A; hud(); };
    const hud = () => g.hud(`${e(u("gmRound"))} <b>${n}/${R}</b> · ${e(u("gmMoves"))} <b>${path.length - 1}</b> · ${e(u("gmMin"))} ${best}`);
    const XY = (k) => { const [r, cc] = rc(k); return [170 + cc * 75, 50 + r * 75]; };
    g.on("tap", (x, y) => {
      let near = -1, d0 = 30; for (let k = 0; k < N * N; k++) { const [px, py] = XY(k); const d = Math.hypot(px - x, py - y); if (d < d0) { d0 = d; near = k; } }
      if (near < 0) return;
      const cur = path[path.length - 1];
      if (path.length > 1 && near === path[path.length - 2]) { path.pop(); hud(); return; }
      if (!edges[key(cur, near)]) { g.msg(t1("gmNoEntry"), "bad", 600); return; }
      path.push(near); hud();
      if (near === Bn) { const good = path.length - 1 === best; if (good) ok++; g.msg(good ? t1("gmShortest") : `${t1("gmLonger")} (${path.length - 1} / ${best})`, good ? "good" : "", 1300); g.after(1400, round); }
    });
    g.loop(() => g.draw((c) => {
      c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
      for (let a = 0; a < N * N; a++) for (let b = a + 1; b < N * N; b++) {
        const ab = edges[key(a, b)], ba = edges[key(b, a)]; const [ra, ca] = rc(a), [rb, cb] = rc(b); if (Math.abs(ra - rb) + Math.abs(ca - cb) !== 1) continue;
        const [x1, y1] = XY(a), [x2, y2] = XY(b);
        c.strokeStyle = ab || ba ? "#3b3d40" : "#7f1d1d"; c.lineWidth = 22; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        if (!ab && !ba) D.text(c, "⛔", mx, my, 18);
        else if (ab !== ba) { const ang = Math.atan2((ab ? y2 - y1 : y1 - y2), (ab ? x2 - x1 : x1 - x2)); c.save(); c.translate(mx, my); c.rotate(ang); c.fillStyle = "#f8fafc"; c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -7); c.lineTo(-6, 7); c.fill(); c.restore(); }
      }
      c.strokeStyle = "#38bdf8"; c.lineWidth = 6; c.beginPath(); path.forEach((k, i) => { const [x, y] = XY(k); if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke();
      for (let k = 0; k < N * N; k++) { const [x, y] = XY(k); c.fillStyle = "#1f2937"; c.beginPath(); c.arc(x, y, 9, 0, 7); c.fill(); }
      const [ax, ay] = XY(A), [bx, by] = XY(Bn), [px, py] = XY(path[path.length - 1]);
      D.text(c, "🏠", bx, by, 26); D.text(c, "A", ax - 22, ay + 20, 16, "#fff"); D.carTop(c, px, py, 18, 30, "#2563eb");
      D.text(c, t1("gmRouteHint"), 12, 388, 13, "#e2e8f0", "left", 500);
    }));
    round();
  },
});

/* who goes first at the junction? */
const ROW = [
  { q: "rw1", d: { j: "x", cars: [["S", "A", "you"], ["E", "B"]] }, o: ["rwA", "rwB"], a: 1, why: "rwWhy1" },
  { q: "rw1", d: { j: "x", cars: [["S", "A", "you"], ["W", "B"]] }, o: ["rwA", "rwB"], a: 0, why: "rwWhy2" },
  { q: "rw1", d: { j: "t", cars: [["S", "A", "you"], ["E", "B"]], gw: "S" }, o: ["rwA", "rwB"], a: 1, why: "rwWhy3" },
  { q: "rw1", d: { j: "x", cars: [["S", "A", "you"], ["W", "B", "amb"]] }, o: ["rwA", "rwB"], a: 1, why: "rwWhy4" },
  { q: "rw2", d: { j: "z", cars: [["S", "A", "you"]], ped: true }, o: ["rwYouGo", "rwPedGo"], a: 1, why: "rwWhy5" },
  { q: "rw1", d: { j: "x", cars: [["S", "A", "you"], ["E", "B"], ["N", "C"]] }, o: ["rwA", "rwB", "rwC"], a: 2, why: "rwWhy6" },
  { q: "rw1", d: { j: "r", cars: [["S", "A", "you"], ["E", "B", "on"]] }, o: ["rwA", "rwB"], a: 1, why: "rwWhy7" },
  { q: "rw3", d: { j: "x", cars: [["S", "A", "you"]], police: true }, o: ["rwGoGreen", "rwObey"], a: 1, why: "rwWhy8" },
];
def("rightofway", {
  icon: "🚸", unit: "", dom: true,
  start(g) {
    const order = shuffle(ROW); let i = 0, ok = 0;
    const show = () => {
      if (i >= order.length) return g.end(ok, e(u("gmOutOf", { n: ok, t: order.length })));
      const p = order[i]; rounds(g, `${i + 1} / ${order.length}`);
      g.panel(`<div class="gq"><div class="gdia">${rowSvg(p.d)}</div><div class="gqa"><b>${e(u(p.q))}</b><div class="gbtns col">${p.o.map((k, j) => `<button type="button" class="gbtn" data-o="${j}">${e(u(k))}</button>`).join("")}</div><p class="gwhy" hidden></p></div></div>`);
      g.lay.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        if (b.disabled) return; g.lay.querySelectorAll("[data-o]").forEach((x) => { x.disabled = true; });
        const right = +b.dataset.o === p.a; if (right) ok++;
        b.classList.add(right ? "ok" : "no"); g.lay.querySelector(`[data-o="${p.a}"]`).classList.add("ok");
        const w = g.lay.querySelector(".gwhy"); w.innerHTML = e(u(p.why)); w.hidden = false;
        g.after(2600, () => { i++; show(); });
      }));
    };
    show();
  },
});
function rowSvg(d) {
  const P = { S: [150, 262, 0], N: [150, 38, 180], E: [262, 150, 270], W: [38, 150, 90] }, off = { S: [-14, 0], N: [14, 0], E: [0, -14], W: [0, 14] };
  let s = `<svg viewBox="0 0 300 300" role="img"><rect width="300" height="300" fill="#4d7c34"/>`;
  if (d.j === "r") s += `<circle cx="150" cy="150" r="118" fill="#3b3d40"/><circle cx="150" cy="150" r="58" fill="#5b8c3a" stroke="#f8fafc" stroke-width="3"/><rect x="118" y="230" width="64" height="70" fill="#3b3d40"/><rect x="230" y="118" width="70" height="64" fill="#3b3d40"/><rect x="0" y="118" width="70" height="64" fill="#3b3d40"/><rect x="118" y="0" width="64" height="70" fill="#3b3d40"/>`;
  else {
    s += `<rect x="0" y="118" width="300" height="64" fill="#3b3d40"/>`;
    s += `<rect x="118" y="${d.j === "t" ? 118 : 0}" width="64" height="${d.j === "t" ? 182 : 300}" fill="#3b3d40"/>`;
    if (d.j === "t" || d.gw) s += `<path d="M120 186 H180" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/><path d="M120 192 H180" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/>`;
    if (d.j === "z") s += [0, 1, 2, 3, 4, 5].map((k) => `<rect x="${121 + k * 10}" y="190" width="6" height="26" fill="#fff"/>`).join("");
  }
  if (d.ped) s += `<g transform="translate(176,203)"><circle r="6" cy="-10" fill="#c68642"/><rect x="-6" y="-4" width="12" height="16" rx="4" fill="#f43f5e"/></g>`;
  if (d.police) s += `<g transform="translate(196,196)"><circle r="7" cy="-12" fill="#c68642"/><rect x="-7" y="-5" width="14" height="18" rx="4" fill="#f8fafc"/><rect x="-11" y="-7" width="5" height="12" fill="#f8fafc" transform="rotate(-50)"/></g><g transform="translate(222,240)"><rect x="-9" y="-26" width="18" height="52" rx="5" fill="#111827"/><circle cy="14" r="6" fill="#22c55e"/></g>`;
  (d.cars || []).forEach(([dir, lab, kind]) => {
    let [x, y, rot] = P[dir], [ox, oy] = off[dir];
    if (kind === "on") { [x, y, rot] = [236, 162, 180]; ox = oy = 0; }
    const col = kind === "you" ? "#2563eb" : kind === "amb" ? "#f8fafc" : "#f59e0b";
    s += `<g transform="translate(${x + ox},${y + oy}) rotate(${rot})"><rect x="-12" y="-21" width="24" height="42" rx="7" fill="${col}" stroke="#111" stroke-width="1"/><rect x="-9" y="-14" width="18" height="8" rx="2" fill="#1b2733"/>${kind === "amb" ? `<path d="M-4 4h8M0 0v8" stroke="#dc2626" stroke-width="3"/>` : ""}</g>`;
    s += `<text x="${x + ox * 2.6 + (kind === "on" ? 24 : 0)}" y="${y + oy * 2.6 + 5}" text-anchor="middle" font-weight="700" font-size="16" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${lab}</text>`;
    if (kind === "on") s += `<path d="M246 188 Q236 226 200 238" fill="none" stroke="#fde047" stroke-width="3" marker-end="url(#ah)"/>`;
  });
  return s + `<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#fde047"/></marker></defs></svg>`;
}

/* which exit? (India: roundabouts go clockwise, keep left) */
const TOWNS = ["Kochi", "Thrissur", "Kollam", "Kozhikode", "Kannur", "Alappuzha", "Palakkad", "Kottayam"];
def("roundabout", {
  icon: "🔄", unit: "",
  start(g) {
    const R = 10; let i = 0, ok = 0, cur;
    const gen = () => {
      const n = ri(3, 5), angs = []; const base = rnd(0, Math.PI * 2);
      for (let k = 0; k < n; k++) angs.push(base + k * Math.PI * 2 / n + rnd(-0.25, 0.25));
      const names = shuffle(TOWNS).slice(0, n), you = ri(0, n - 1); let tgt = ri(0, n - 1); if (tgt === you) tgt = (you + 1 + ri(0, n - 2)) % n;
      /* exits counted clockwise from your entry */
      const order = [...Array(n).keys()].map((k) => ({ k, a: ((angs[you] - angs[k]) + Math.PI * 4) % (Math.PI * 2) })).filter((x) => x.k !== you).sort((p, q) => p.a - q.a);
      cur = { n, angs, names, you, tgt, ans: order.findIndex((x) => x.k === tgt) + 1 };
    };
    const round = () => {
      if (i >= R) return g.end(ok, e(u("gmOutOf", { n: ok, t: R })));
      i++; gen(); rounds(g, `${i} / ${R} · ${e(u("gmRbHint"))}`);
      g.btns([1, 2, 3, 4].slice(0, cur.n - 1).map((k) => t1("gmExit", { n: k })), (k) => {
        const right = k + 1 === cur.ans; if (right) ok++;
        g.msg(right ? t1("gmCorrect") : t1("gmExitWas", { n: cur.ans }), right ? "good" : "bad", 1100); g.after(1200, round);
      }, "row");
    };
    g.loop(() => g.draw((c) => {
      c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
      const cx = W / 2, cy = 190;
      cur.angs.forEach((a, k) => { c.save(); c.translate(cx, cy); c.rotate(-a); c.fillStyle = "#3b3d40"; c.fillRect(0, -26, 220, 52); c.restore();
        const lx = cx + Math.cos(a) * 190, ly = cy - Math.sin(a) * 160; D.text(c, cur.names[k], lx, ly, 15, k === cur.tgt ? "#fde047" : "#f8fafc", "center", 700); if (k === cur.tgt) D.text(c, "🏁", lx, ly - 20, 18); });
      c.fillStyle = "#3b3d40"; c.beginPath(); c.arc(cx, cy, 92, 0, 7); c.fill();
      c.fillStyle = "#5b8c3a"; c.beginPath(); c.arc(cx, cy, 46, 0, 7); c.fill();
      c.strokeStyle = "#f8fafc"; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, 70, -2.4, -0.9); c.stroke();
      const ya = cur.angs[cur.you]; D.carTop(c, cx + Math.cos(ya) * 130, cy - Math.sin(ya) * 130, 22, 40, "#2563eb", { rot: Math.PI / 2 - ya + Math.PI });
      D.text(c, "↻", cx, cy, 30, "#f8fafc");
    }));
    round();
  },
});

/* put the steps in the right order */
const SEQ = [["sqPre", 5], ["sqMoveOff", 5], ["sqOvertake", 5], ["sqTurnRight", 5], ["sqHill", 5], ["sqTyre", 5], ["sqBreak", 4]];
def("sequence", {
  icon: "🔢", unit: "", dom: true,
  start(g) {
    const order = shuffle(SEQ).slice(0, 5); let i = 0, ok = 0;
    const show = () => {
      if (i >= order.length) return g.end(ok, e(u("gmOutOf", { n: ok, t: order.length })));
      const [k, n] = order[i]; rounds(g, `${i + 1} / ${order.length}`);
      const steps = shuffle([...Array(n).keys()]); const picked = [];
      g.panel(`<div class="gseq"><b>${e(u(k))}</b><ol class="gpicked"></ol><div class="gbtns col">${steps.map((s) => `<button type="button" class="gbtn" data-s="${s}">${e(u(k + "_" + (s + 1)))}</button>`).join("")}</div></div>`);
      g.lay.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
        if (b.disabled) return; b.disabled = true; picked.push(+b.dataset.s);
        g.lay.querySelector(".gpicked").insertAdjacentHTML("beforeend", `<li>${b.innerHTML}</li>`);
        if (picked.length === n) {
          const right = picked.every((v, j) => v === j); if (right) ok++;
          g.msg(right ? t1("gmCorrect") : t1("gmWrongOrder"), right ? "good" : "bad", 1500);
          if (!right) g.lay.querySelector(".gpicked").insertAdjacentHTML("afterend", `<ol class="gright">${[...Array(n).keys()].map((s) => `<li>${e(u(k + "_" + (s + 1)))}</li>`).join("")}</ol>`);
          g.after(right ? 1500 : 3800, () => { i++; show(); });
        }
      }));
    };
    show();
  },
});

/* plan fuel stops: never run dry, fewest stops */
def("fuelplan", {
  icon: "⛽", unit: "",
  start(g) {
    const R = 5; let i = 0, ok = 0, cur;
    const gen = () => {
      for (;;) {
        const D0 = ri(5, 8) * 100, Rg = ri(15, 25) * 10, st = [];
        let x = 0; while (x < D0 - 40) { x += ri(40, Math.min(Rg, 160)); if (x < D0 - 20) st.push(x); }
        const pts = [0, ...st, D0]; if (pts.some((p, k) => k && p - pts[k - 1] > Rg)) continue;
        let pos = 0, need = 0; while (pos + Rg < D0) { const reach = st.filter((s) => s > pos && s <= pos + Rg); pos = Math.max(...reach); need++; }
        if (need < 2) continue;
        cur = { D0, Rg, st, need, pick: new Set() }; return;
      }
    };
    const X = (km) => 50 + km / cur.D0 * 540;
    const round = () => { if (i >= R) return g.end(ok, e(u("gmOutOf", { n: ok, t: R }))); i++; gen(); rounds(g, `${i} / ${R} · ${e(u("gmRange", { km: cur.Rg }))}`); };
    g.on("tap", (x, y) => { if (y < 150 || y > 260) return; const k = cur.st.findIndex((s) => Math.abs(X(s) - x) < 16); if (k < 0) return; const s = cur.st[k]; cur.pick.has(s) ? cur.pick.delete(s) : cur.pick.add(s); });
    g.btns([`✓ ${t1("gmCheck")}`], () => {
      const pts = [0, ...[...cur.pick].sort((a, b) => a - b), cur.D0];
      const dry = pts.some((p, k) => k && p - pts[k - 1] > cur.Rg), best = !dry && cur.pick.size === cur.need;
      if (best) ok++;
      g.msg(dry ? t1("gmRanDry") : best ? t1("gmFewest") : t1("gmTooMany", { n: cur.need }), best ? "good" : "bad", 1500);
      g.after(1600, round);
    }, "one");
    g.loop(() => g.draw((c) => {
      c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#3b3d40"; c.fillRect(30, 190, 580, 30);
      for (let km = 0; km <= cur.D0; km += 100) D.text(c, km, X(km), 240, 12, "#e2e8f0");
      D.text(c, "🏠", X(0), 170, 24); D.text(c, "🏁", X(cur.D0), 170, 24);
      const pts = [0, ...[...cur.pick].sort((a, b) => a - b), cur.D0];
      pts.forEach((p, k) => { if (!k) return; const bad = p - pts[k - 1] > cur.Rg; c.strokeStyle = bad ? "#ef4444" : "#22c55e"; c.lineWidth = 5; c.beginPath(); c.moveTo(X(pts[k - 1]), 186); c.lineTo(X(p), 186); c.stroke(); });
      cur.st.forEach((s) => { const on = cur.pick.has(s); c.fillStyle = on ? "#22c55e" : "#f8fafc"; c.beginPath(); c.arc(X(s), 205, 13, 0, 7); c.fill(); D.text(c, "⛽", X(s), 205, 14); D.text(c, s, X(s), 262, 11, "#e2e8f0"); });
      c.strokeStyle = "#fde047"; c.lineWidth = 3; c.beginPath(); c.moveTo(X(0), 120); c.lineTo(X(cur.Rg), 120); c.stroke(); D.text(c, t1("gmRange", { km: cur.Rg }), X(cur.Rg / 2), 105, 13, "#fde047");
    }));
    round();
  },
});

/* estimate the stopping distance */
const stopD = (kmh, rt, mu) => { const v = kmh / 3.6; return v * rt + v * v / (2 * mu * 9.81); };
def("stopguess", {
  icon: "📏", unit: "",
  start(g) {
    const R = 8; let i = 0, ok = 0;
    const round = () => {
      if (i >= R) return g.end(ok, e(u("gmSquare")));
      i++; const kmh = pick([30, 40, 50, 60, 70, 80, 90, 100]), wet = Math.random() < 0.4, rt = pick([1, 1.5, 2]), d = stopD(kmh, rt, wet ? 0.4 : 0.7);
      const opts = shuffle([d, d * pick([0.5, 0.6]), d * pick([1.5, 1.7]), d * pick([0.75, 1.3])]).map((x) => Math.round(x));
      const ans = opts.indexOf(Math.round(d));
      rounds(g, `${i} / ${R}`);
      g.draw((c) => { D.roadV(c, W / 2, 1, 130, 0, wet ? "#3f6b2a" : "#4d7c34"); if (wet) { c.fillStyle = "rgba(125,211,252,.18)"; c.fillRect(0, 0, W, H); }
        D.carTop(c, W / 2, 320, 50, 90, "#2563eb"); D.text(c, `${kmh} km/h`, W / 2, 60, 34, "#fff", "center", 700);
        D.text(c, `${t1(wet ? "surf_wet" : "surf_dry")} · ${t1("gmReactS", { s: rt })}`, W / 2, 100, 18, "#e2e8f0"); });
      g.btns(opts.map((x) => `${x} m`), (k) => { const right = k === ans; if (right) ok++; g.msg(right ? t1("gmCorrect") : `${Math.round(d)} m`, right ? "good" : "bad", 1100); g.after(1200, round); }, "row");
    };
    round();
  },
});

/* count the two-second gap */
def("gapcount", {
  icon: "2️⃣", unit: "",
  start(g) {
    const R = 6, V = 160, POST = 520; let i = 0, ok = 0, anim = null;
    const round = () => {
      if (i >= R) return g.end(ok, e(u("gmGapCountTip")));
      i++; rounds(g, `${i} / ${R}`); g.lay.innerHTML = "";
      const gap = pick([1, 2, 3, 4]); anim = { t: 0, gap, x0: -60 - gap * V };
      g.after(((POST - anim.x0) / V + 0.7) * 1000, () => {
        anim.done = true;
        g.btns(["1 s", "2 s", "3 s", "4 s"], (k) => { const right = k + 1 === gap; if (right) ok++; g.msg(right ? t1("gmCorrect") : `${gap} s`, right ? "good" : "bad", 1100); g.after(1200, round); }, "row");
      });
    };
    g.loop((dt) => { if (!anim) return; if (!anim.done) anim.t += dt; g.draw((c) => {
      c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H); c.fillStyle = "#3b3d40"; c.fillRect(0, 150, W, 100);
      c.fillStyle = "#f2f2f2"; for (let x = 0; x < W; x += 40) c.fillRect(x, 198, 22, 4);
      c.fillStyle = "#f8fafc"; c.fillRect(POST - 3, 110, 6, 40); c.fillStyle = "#ef4444"; c.fillRect(POST - 9, 104, 18, 10);
      const you = anim.x0 + anim.t * V, lead = you + anim.gap * V;
      if (lead < W + 60) D.carTop(c, lead, 175, 34, 64, "#dc2626", { rot: Math.PI / 2 });
      D.carTop(c, you, 175, 34, 64, "#2563eb", { rot: Math.PI / 2 });
      D.text(c, t1("gmGapCountQ"), W / 2, 330, 16, "#f8fafc");
    }); });
    round();
  },
});

/* speed–time–distance in your head */
def("speedmath", {
  icon: "🧮", unit: "",
  preview(g) { g.draw((c) => { D.sky(c, "#0f172a", "#1e293b"); D.text(c, "60 km/h × 30 min = ?", W / 2, 200, 30, "#f8fafc"); }); },
  start(g) {
    let ok = 0, n = 0, left = 60;
    const gen = () => {
      const k = ri(0, 3);
      if (k === 0) { const v = pick([30, 40, 60, 80, 90, 120]), m = pick([15, 20, 30, 45, 90]); return [t1("gmQDist", { v, m }), v * m / 60, "km"]; }
      if (k === 1) { const v = pick([40, 50, 60, 80, 100]), d = v * pick([0.5, 1, 1.5, 2, 3]); return [t1("gmQTime", { v, d }), d / v * 60, "min"]; }
      if (k === 2) { const v = pick([18, 36, 54, 72, 90, 108]); return [t1("gmQMs", { v }), v / 3.6, "m/s"]; }
      const v = pick([36, 54, 72, 90]), t = pick([1, 1.5, 2]); return [t1("gmQReact", { v, t }), v / 3.6 * t, "m"];
    };
    const q = () => {
      n++; const [text, ans, unit] = gen(); const opts = shuffle([ans, ans * 1.5, ans * 0.5, ans + pick([5, 10, 15])]).map((x) => Math.round(x * 10) / 10);
      g.draw((c) => { D.sky(c, "#0f172a", "#1e293b"); D.text(c, text, W / 2, 170, 24, "#f8fafc"); });
      g.btns(opts.map((x) => `${x} ${unit}`), (k) => { const right = Math.abs(opts[k] - ans) < 0.05; if (right) ok++; g.msg(right ? t1("gmCorrect") : `${Math.round(ans * 10) / 10} ${unit}`, right ? "good" : "bad", 700); q(); }, "row");
    };
    g.loop((dt) => { left -= dt; g.hud(`<b>${ok}</b> ✓ · ${Math.ceil(left)} s`); if (left <= 0) g.end(ok, e(u("gmOutOf", { n: ok, t: n - 1 }))); });
    q();
  },
});

/* remember the number plate */
const plateOf = () => { const L = "ABCDEFGHJKLMNPRSTUVWXYZ"; return [`KL`, String(ri(1, 85)).padStart(2, "0"), L[ri(0, 22)] + L[ri(0, 22)], String(ri(1000, 9999))]; };
const tweak = (p) => { const q = p.slice(), k = ri(1, 3), L = "ABCDEFGHJKLMNPRSTUVWXYZ"; if (k === 1) q[1] = String((+q[1] % 85) + 1).padStart(2, "0"); else if (k === 2) q[2] = q[2][0] + L[(L.indexOf(q[2][1]) + ri(1, 5)) % 23]; else { const d = q[3].split(""); const j = ri(0, 3); d[j] = String((+d[j] + ri(1, 8)) % 10); q[3] = d.join(""); } return q; };
const plateSvg = (p) => `<span class="gplate">${p.join(" ")}</span>`;
def("plates", {
  icon: "🔤", unit: "", dom: true,
  start(g) {
    const R = 10; let i = 0, ok = 0;
    const round = () => {
      if (i >= R) return g.end(ok, e(u("gmOutOf", { n: ok, t: R })));
      i++; rounds(g, `${i} / ${R}`);
      const p = plateOf(), show = Math.max(600, 1500 - i * 90);
      g.panel(`<div class="gcenter">${plateSvg(p)}</div>`);
      g.after(show, () => {
        const opts = shuffle([p, tweak(p), tweak(p), tweak(p)]);
        g.panel(`<div class="gcenter"><b>${e(u("gmWhichPlate"))}</b><div class="gbtns col">${opts.map((o, j) => `<button type="button" class="gbtn" data-p="${j}">${plateSvg(o)}</button>`).join("")}</div></div>`);
        g.lay.querySelectorAll("[data-p]").forEach((b) => b.addEventListener("click", () => {
          const right = opts[+b.dataset.p].join() === p.join(); if (right) ok++;
          g.msg(right ? t1("gmCorrect") : t1("gmWrong"), right ? "good" : "bad", 700); g.after(800, round);
        }));
      });
    };
    round();
  },
});

/* find where a motorcyclist would be hidden */
def("blindspots", {
  icon: "🙈", unit: "",
  start(g) {
    const N = 8; let n = 0, found = 0, marks = [];
    const S = 20, OX = W / 2, OY = 150, toM = (x, y) => [(x - OX) / S, (OY - y) / S];
    const sees = (x, y) => (window.Labs && Labs.bsSees ? Labs.bsSees(x, y) : []);
    g.hud(`${e(u("gmTapHidden"))} · <b>0/${N}</b>`);
    g.on("tap", (x, y) => {
      if (n >= N) return;
      const [mx, my] = toM(x, y); if (Math.abs(mx) > 5.25 || my > 4 || my < -13) return;
      if (Math.abs(mx) < 1.1 && Math.abs(my) < 2.4) return;
      const hid = !sees(mx, my).length; n++; if (hid) found++;
      marks.push([x, y, hid]); g.hud(`${e(u("gmTapHidden"))} · <b>${found}/${n}</b>`);
      g.msg(hid ? t1("gmHiddenHere") : t1("gmSeenHere"), hid ? "good" : "bad", 600);
      if (n >= N) g.after(900, () => g.end(found, e(u("gmBlindTip"))));
    });
    g.loop(() => g.draw((c) => {
      c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
      c.fillStyle = "#3b3d40"; c.fillRect(OX - 5.25 * S, 0, 10.5 * S, H);
      c.fillStyle = "#f2f2f2"; [-1.75, 1.75].forEach((lx) => { for (let y = 0; y < H; y += 30) c.fillRect(OX + lx * S - 2, y, 4, 16); });
      D.carTop(c, OX, OY, 1.8 * S, 4.5 * S, "#2563eb");
      if (n >= N) for (let x = -5; x <= 5; x += 0.5) for (let y = -12.5; y <= 3.5; y += 0.5) { if (Math.abs(x) < 1.2 && Math.abs(y) < 2.6) continue; if (!sees(x, y).length) { c.fillStyle = "rgba(239,68,68,.3)"; c.fillRect(OX + x * S - 5, OY - y * S - 5, 10, 10); } }
      marks.forEach(([x, y, hid]) => { D.bike(c, x, y, 0.7, hid ? "#22c55e" : "#94a3b8"); c.strokeStyle = hid ? "#22c55e" : "#ef4444"; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 16, 0, 7); c.stroke(); });
    }));
  },
});

/* overtake or wait? */
def("overtake", {
  icon: "🚚", unit: "",
  start(g) {
    const R = 8; let i = 0, ok = 0, cur;
    const gen = () => { for (;;) { const you = ri(50, 90), tr = ri(30, you - 10), len = pick([8, 10, 12, 16]), onc = ri(40, 80), avail = ri(150, 650);
      const dv = (you - tr) / 3.6, t = (20 + len + 4.5 + 20) / dv, need = (you + onc) / 3.6 * t; if (Math.abs(avail - need) / need > 0.2) return { you, tr, len, onc, avail, need, go: avail > need }; } };
    const round = () => {
      if (i >= R) return g.end(ok, e(u("gmOvTip")));
      i++; cur = gen(); rounds(g, `${i} / ${R}`);
      g.draw((c) => {
        c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H); c.fillStyle = "#3b3d40"; c.fillRect(0, 140, W, 120); c.fillStyle = "#f2f2f2"; for (let x = 0; x < W; x += 40) c.fillRect(x, 198, 22, 4);
        D.carTop(c, 90, 170, 40, 72, "#2563eb", { rot: Math.PI / 2 }); c.fillStyle = "#a16207"; D.rr(c, 130, 150, cur.len * 7, 40, 6); c.fill();
        D.carTop(c, 600, 230, 40, 72, "#e2e8f0", { rot: -Math.PI / 2 });
        D.text(c, `${t1("gmYou")} ${cur.you} km/h · ${t1("gmLorry")} ${cur.tr} km/h (${cur.len} m)`, W / 2, 60, 17, "#fff");
        D.text(c, `${t1("gmOncoming")} ${cur.onc} km/h · ${t1("gmClearAhead", { m: cur.avail })}`, W / 2, 95, 17, "#fde047");
      });
      g.btns([`↗ ${t1("gmOvertakeBtn")}`, `⏸ ${t1("gmWaitBtn")}`], (k) => { const right = (k === 0) === cur.go; if (right) ok++; g.msg(`${right ? t1("gmCorrect") : t1("gmWrong")} · ${t1("gmNeedM", { m: Math.round(cur.need) })}`, right ? "good" : "bad", 1600); g.after(1700, round); }, "two");
    };
    round();
  },
});

/* =========================== RULES & SIGNS =========================== */

const roadSigns = () => Data.D.filter((d) => ["mand", "caut", "info"].includes(d.cat));
const signImg = (d) => `<span class="gsign">${Data.SVG[d.id] || ""}</span>`;
const nameOf = (d) => I18n.T(d, "name");
async function needSvgs(ids) { try { await Data.ensureSvgIds(ids); } catch (err) { /* offline: names still work */ } }

def("signsprint", {
  icon: "⚡", unit: "", dom: true,
  async start(g) {
    let ok = 0, left = 60, n = 0;
    const all = roadSigns();
    const q = async () => {
      const d = pick(all), others = shuffle(all.filter((x) => x.id !== d.id && x.cat === d.cat)).slice(0, 2), opts = shuffle([d, ...others]);
      await needSvgs([d.id]); if (!g.alive) return; n++;
      g.panel(`<div class="gq"><div class="gdia">${signImg(d)}</div><div class="gqa"><div class="gbtns col">${opts.map((o, j) => `<button type="button" class="gbtn" data-o="${j}">${nameOf(o)}</button>`).join("")}</div></div></div>`);
      g.lay.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => { const right = opts[+b.dataset.o].id === d.id; if (right) ok++; g.msg(right ? t1("gmCorrect") : nameOf(d).replace(/<[^>]+>/g, " "), right ? "good" : "bad", 700); q(); }));
    };
    g.loop((dt) => { left -= dt; g.hud(`<b>${ok}</b> ✓ · ${Math.ceil(left)} s`); if (left <= 0) g.end(ok, e(u("gmOutOf", { n: ok, t: Math.max(ok, n - 1) }))); });
    q();
  },
});

def("signpairs", {
  icon: "🃏", lo: true, unit: "", dom: true,
  async start(g) {
    const ds = shuffle(roadSigns()).slice(0, 8); await needSvgs(ds.map((d) => d.id)); if (!g.alive) return;
    const cards = shuffle([...ds, ...ds]); let open = [], moves = 0, matched = 0, lock = false;
    g.panel(`<div class="gpairs">${cards.map((d, i) => `<button type="button" class="gcardb" data-i="${i}" aria-label="?"><span class="gface">${Data.SVG[d.id] || ""}</span></button>`).join("")}</div>`);
    const hud = () => g.hud(`${e(u("gmMoves"))} <b>${moves}</b> · ${matched}/8`); hud();
    g.lay.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
      if (lock || b.classList.contains("up")) return;
      b.classList.add("up"); open.push(b);
      if (open.length === 2) {
        moves++; hud(); const [a, c2] = open, same = cards[+a.dataset.i].id === cards[+c2.dataset.i].id;
        if (same) { a.classList.add("done"); c2.classList.add("done"); open = []; matched++; hud(); if (matched === 8) g.after(700, () => g.end(moves, e(u("gmPairsTip")))); }
        else { lock = true; g.after(800, () => { a.classList.remove("up"); c2.classList.remove("up"); open = []; lock = false; }); }
      }
    }));
  },
});

def("oddsign", {
  icon: "🔍", unit: "", dom: true,
  async start(g) {
    const R = 10; let i = 0, ok = 0; const all = roadSigns();
    const round = async () => {
      if (i >= R) return g.end(ok, e(u("gmOddTip")));
      i++; rounds(g, `${i} / ${R}`);
      const cats = shuffle(["mand", "caut", "info"]), main = all.filter((d) => d.cat === cats[0]), odd = pick(all.filter((d) => d.cat === cats[1]));
      const set = shuffle([...shuffle(main).slice(0, 3), odd]); await needSvgs(set.map((d) => d.id)); if (!g.alive) return;
      g.panel(`<div class="gcenter"><b>${e(u("gmOddQ"))}</b><div class="godd">${set.map((d, j) => `<button type="button" class="gcardb up" data-o="${j}"><span class="gface">${Data.SVG[d.id] || ""}</span></button>`).join("")}</div></div>`);
      g.lay.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        const d = set[+b.dataset.o], right = d.id === odd.id; if (right) ok++;
        g.msg(right ? t1("gmCorrect") : t1("gmWrong"), right ? "good" : "bad", 1100); g.after(1200, round);
      }));
    };
    round();
  },
});

def("dashlights", {
  icon: "🔆", unit: "", dom: true,
  async start(g) {
    let lights = [];
    try { lights = (await Course.library("lights")).lights; } catch (err) { lights = []; }
    if (!g.alive) return;
    try { await Data.ensureSvgs("dash"); } catch (err) { /* names still work */ } if (!g.alive) return;
    const R = Math.min(10, lights.length), order = shuffle(lights).slice(0, R); let i = 0, ok = 0;
    const sev = ["stop", "soon", "info"];
    const show = () => {
      if (i >= R) return g.end(ok, e(u("gmDashTip")));
      const w = order[i]; rounds(g, `${i + 1} / ${R}`);
      g.panel(`<div class="gq"><div class="gdia gdash"><span class="dashico big">${Data.SVG[w.sign] || ""}</span><b>${e(w.name)}</b></div><div class="gqa"><b>${e(u("gmDashQ"))}</b><div class="gbtns col">${sev.map((s, j) => `<button type="button" class="gbtn sv-${s}" data-o="${j}">${e(u("sev_" + s))}</button>`).join("")}</div></div></div>`);
      g.lay.querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        if (b.disabled) return; g.lay.querySelectorAll("[data-o]").forEach((x) => { x.disabled = true; });
        const right = sev[+b.dataset.o] === w.severity; if (right) ok++;
        b.classList.add(right ? "ok" : "no"); g.lay.querySelector(`[data-o="${sev.indexOf(w.severity)}"]`).classList.add("ok");
        g.after(1300, () => { i++; show(); });
      }));
    };
    show();
  },
});

window.Games = Gm;
})();
