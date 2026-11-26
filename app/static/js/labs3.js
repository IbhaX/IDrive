/* iDrive labs3.js — 20 more driving-science labs on one small engine.
   A lab declares its state, controls, a calc(st) → readout and a
   draw(st, r, t) → SVG markup (t = 0..1 for animated runs). Every number is
   a simplified, labelled educational model — no legal limits, no fines. */
(() => {
"use strict";
const Lb = window.Labs;
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);
const t1 = (k, o) => I18n.esc(I18n.one(u(k, o)));       // plain text for SVG
const fx = (n, d = 1) => (+n).toFixed(d);
const g = 9.81;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const MU = { dry: .7, wet: .4, gravel: .35 };
const SURF3 = ["surf", "roadSurface", [["dry", "surf_dry"], ["wet", "surf_wet"], ["gravel", "surf_gravel"]]];
const SURF2 = ["surf", "roadSurface", [["dry", "surf_dry"], ["wet", "surf_wet"]]];
const YESNO = (k, lk) => [k, lk, [["no", "no"], ["yes", "yes"]]];
const stopD = (v, rt, mu) => v * rt + v * v / (2 * mu * g);
const vmaxFor = (D, rt, mu) => { const a = mu * g; return a * (-rt + Math.sqrt(rt * rt + 2 * D / a)) * 3.6; };

const D = {}, ST = {};
const def = (id, spec) => { D[id] = spec; Lb[id] = (host) => mount(id, host); };
Lb.LABS3 = () => Object.keys(D);

/* ---------- svg helpers ---------- */
const BG = (w = 640, h = 260) => `<rect width="${w}" height="${h}" rx="14" class="labbg"/>`;
const T = (x, y, s, cls = "axis", a = "start") => `<text x="${fx(x)}" y="${fx(y)}" class="${cls}" text-anchor="${a}">${s}</text>`;
const R = (x, y, w, h, cls, rx = 4) => `<rect x="${fx(x)}" y="${fx(y)}" width="${fx(Math.max(0, w))}" height="${fx(Math.max(0, h))}" rx="${rx}" class="${cls}"/>`;
const Ln = (x1, y1, x2, y2, cls) => `<line x1="${fx(x1)}" y1="${fx(y1)}" x2="${fx(x2)}" y2="${fx(y2)}" class="${cls}"/>`;
const car = (x, y, cls = "you", s = 1, rot = 0) => `<g transform="translate(${fx(x)},${fx(y)}) rotate(${fx(rot)}) scale(${s})" class="${cls}"><rect x="-34" y="-14" width="34" height="28" rx="7"/><rect x="-12" y="-10" width="7" height="20" rx="2" class="win"/></g>`;
const plot = (pts, X, Y, cls) => `<path d="M${pts.map(([a, b]) => fx(X(a)) + " " + fx(Y(b))).join(" L")}" class="${cls}"/>`;
const hbar = (x, y, w, h, val, max, cls, label) => `${R(x, y, w, h, "l3track", h / 2)}${R(x, y, w * clamp(val / max, 0, 1), h, cls, h / 2)}${label ? T(x, y - 6, label) : ""}`;

/* ---------- the engine ---------- */
function mount(id, host) {
  const sp = D[id];
  const st = ST[id] || (ST[id] = JSON.parse(JSON.stringify(sp.st)));
  const ctl = sp.ctl.map((c) => c.length > 3 && typeof c[2] === "string" && typeof c[3] === "number"
    ? `<label class="ctl"><span>${e(u(c[2]))} <b data-v="${c[1]}">${fx(st[c[1]], c[7] || 0)}</b> ${c[6] || ""}</span><input type="range" data-l3r="${c[1]}" min="${c[3]}" max="${c[4]}" step="${c[5]}" value="${st[c[1]]}"></label>`
    : `<div class="ctl"><span>${e(u(c[1]))}</span><div class="pills" role="radiogroup" aria-label="${t1(c[1])}">${c[2].map(([v, lk]) => {
        const on = String(st[c[0]]) === v;
        return `<button type="button" role="radio" class="pill${on ? " on" : ""}" aria-checked="${on}" data-l3k="${c[0]}" data-l3v="${v}">${lk.startsWith("=") ? I18n.esc(lk.slice(1)) : e(u(lk))}</button>`;
      }).join("")}</div></div>`).join("");
  const run = sp.run ? `<button class="btn primary mag" data-l3run>▶ ${e(u(sp.run))}</button>` : "";
  host.innerHTML = `<section class="panel lab rvl"><div class="labgrid"><div class="controls">${ctl}${run}</div>
    <div class="labviz"><svg class="l3svg" viewBox="${sp.vb || "0 0 640 260"}" role="img" aria-label="${t1("lab_" + id)}"></svg><div class="readout" aria-live="polite"></div></div></div>
    <aside class="lnote n-model"><b>${e(u("noteModel"))}</b><p>${e(u("m_" + id))}</p></aside></section>`;
  const svg = host.querySelector(".l3svg"), out = host.querySelector(".readout");
  const draw = (t = 1) => { const r = sp.calc(st); svg.innerHTML = sp.draw(st, r, t); return r; };
  const redraw = () => { if (sp.live) { sp.changed && sp.changed(st); return; } out.innerHTML = readout(draw(1)); };
  host.querySelectorAll("[data-l3r]").forEach((inp) => inp.addEventListener("input", () => {
    const k = inp.dataset.l3r, c = sp.ctl.find((x) => x[1] === k);
    st[k] = +inp.value;
    const b = host.querySelector(`[data-v="${k}"]`);
    if (b) b.textContent = fx(inp.value, c[7] || 0);
    redraw();
  }));
  host.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-l3k]");
    if (b) {
      st[b.dataset.l3k] = b.dataset.l3v;
      b.parentElement.querySelectorAll(".pill").forEach((x) => { const on = x === b; x.classList.toggle("on", on); x.setAttribute("aria-checked", on); });
      redraw();
      return;
    }
    if (ev.target.closest("[data-l3run]")) {
      if (sp.onRun) { sp.onRun(st); return; }
      const gs = Motion.gsap;
      if (!gs || Motion.reduced()) { draw(1); return; }
      const o = { t: 0 };
      Motion.scoped(() => gs.to(o, { t: 1, duration: sp.dur || 2.2, ease: "none", onUpdate: () => draw(o.t) }));
    }
  });
  if (sp.place) sp.place(svg, st, () => {
    ["x", "y"].forEach((k) => { const i = host.querySelector(`[data-l3r="${k}"]`); if (i) { i.value = st[k]; host.querySelector(`[data-v="${k}"]`).textContent = fx(st[k], 1); } });
    redraw();
  });
  if (sp.live) sp.live(svg, st, out);
  else redraw();
  Motion.reveal(host);
}
const readout = (r) => `<div class="ro">${r.say ? `<b class="${r.say[2] || ""}">${e(u(r.say[0], r.say[1]))}</b>` : ""}${(r.rows || []).map(([k, v, c]) => `<span class="${c || ""}">${e(u(k))}: <b>${v}</b></span>`).join("")}</div>${r.tip ? `<div class="ro"><span class="muted">${e(u(r.tip))}</span></div>` : ""}`;

/* =================== STOPPING & GRIP =================== */

def("aquaplaning", {
  st: { kmh: 80, kpa: 220, tread: 4, water: 3 },
  ctl: [["r", "kmh", "speed", 30, 140, 5, "km/h"], ["r", "kpa", "aqP", 150, 300, 10, "kPa"], ["r", "tread", "aqTread", 1, 8, .5, "mm", 1], ["r", "water", "aqWater", 1, 10, .5, "mm", 1]],
  calc(st) {
    const f = clamp(.8 + .045 * st.tread - .03 * (st.water - 2), .6, 1.25);
    const von = 6.36 * Math.sqrt(st.kpa) * f, ratio = st.kmh / von, contact = clamp(1 - ratio * ratio, 0, 1);
    return { von, ratio, contact,
      say: ratio >= 1 ? ["aqFull", {}, "bad"] : ratio > .8 ? ["aqPartial", {}, "warnt"] : ["aqOk", {}, "good"],
      rows: [["aqOnset", `${Math.round(von)} km/h`], ["aqContact", `${Math.round(contact * 100)}%`]], tip: "aqTip" };
  },
  draw(st, r) {
    const cx = 300, cy = 128, rad = 72, road = 200, half = 46, wedge = (1 - r.contact) * half * 2;
    let s = BG() + `<rect x="0" y="${road}" width="640" height="60" class="road"/><rect x="0" y="${road - st.water * 1.6}" width="640" height="${st.water * 1.6}" class="l3water"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${rad}" class="l3tyre"/><circle cx="${cx}" cy="${cy}" r="${rad * .55}" class="l3rim"/>`;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; s += Ln(cx + Math.cos(a) * (rad - 2), cy + Math.sin(a) * (rad - 2), cx + Math.cos(a) * (rad - 2 - st.tread * 1.6), cy + Math.sin(a) * (rad - 2 - st.tread * 1.6), "l3groove"); }
    s += R(cx - half, road - 4, half * 2 - wedge, 6, "l3contact", 2);
    if (wedge > 1) s += `<path d="M${cx + half + 40} ${road} L${cx + half - wedge} ${road} L${cx + half} ${road - 10 - wedge * .25} Z" class="l3wedge"/>`;
    for (let i = 0; i < Math.round(r.ratio * 8); i++) s += Ln(cx + rad + 6 + i * 9, road - 8 - i * 3, cx + rad + 18 + i * 12, road - 22 - i * 6, "l3spray");
    s += Ln(60, 40, 220, 40, "l3arrow") + T(60, 30, `${st.kmh} km/h →`);
    const X = (v) => 420 + v / 160 * 190;
    s += R(420, 52, 190, 10, "l3track", 5) + R(420, 52, X(Math.min(r.von, 160)) - 420, 10, "l3okbar", 5);
    s += Ln(X(st.kmh), 44, X(st.kmh), 70, "l3needle") + T(420, 38, t1("aqGauge")) + T(X(Math.min(r.von, 160)), 82, `${Math.round(r.von)}`, "axis", "middle");
    return s;
  },
});

def("tyrepressure", {
  st: { pct: 100, load: "normal" },
  ctl: [["r", "pct", "tpPressure", 60, 140, 5, "%"], ["load", "tpLoad", [["normal", "tpNormal"], ["full", "tpFull"]]]],
  calc(st) {
    const lf = st.load === "full" ? 1.25 : 1, p = st.pct / 100, area = lf / p, rr = (Math.pow(p, -.4) - 1) * 100;
    return { area, p, lf,
      say: st.pct < 85 ? ["tpUnder", {}, "bad"] : st.pct > 115 ? ["tpOver", {}, "warnt"] : ["tpOk", {}, "good"],
      rows: [["tpArea", `×${fx(area, 2)}`], ["tpRR", `${rr >= 0 ? "+" : ""}${Math.round(rr)}%`]],
      tip: st.load === "full" ? "tpLoadTip" : "tpTip" };
  },
  draw(st, r) {
    const bulge = clamp((r.area - 1) * 40, -18, 40), base = 150;
    let s = BG() + T(40, 28, t1("tpSide")) + T(380, 28, t1("tpFoot"));
    s += `<path d="M${140 - bulge * .6} 70 Q${110 - bulge} ${base} ${120 - bulge} ${200} L${260 + bulge} 200 Q${270 + bulge} ${base} ${240 + bulge * .6} 70 Z" class="l3tyre"/>`;
    s += R(150, 60, 80, 34, "l3rim", 6) + `<rect x="0" y="200" width="330" height="60" class="road"/>`;
    const W = 120 * clamp(Math.sqrt(r.area) * (r.p < 1 ? 1.08 : .92), .5, 1.6), H = 150 * clamp(Math.sqrt(r.area), .5, 1.6), x0 = 480 - W / 2, y0 = 135 - H / 2;
    s += R(x0, y0, W, H, "l3patch", 18);
    if (r.p < .95) { s += R(x0 + 4, y0 + 6, W * .2, H - 12, "l3heavy", 10) + R(x0 + W * .8 - 4, y0 + 6, W * .2, H - 12, "l3heavy", 10); }
    else if (r.p > 1.05) { s += R(x0 + W * .3, y0 + 6, W * .4, H - 12, "l3heavy", 10); }
    else s += R(x0 + 6, y0 + 6, W - 12, H - 12, "l3even", 12);
    s += T(480, 245, t1(r.p < .95 ? "tpWearEdges" : r.p > 1.05 ? "tpWearCentre" : "tpWearEven"), "axis", "middle");
    return s;
  },
});

def("slope", {
  st: { kmh: 60, grade: -8, surf: "dry" },
  ctl: [["r", "kmh", "speed", 20, 100, 5, "km/h"], ["r", "grade", "slGrade", -15, 15, 1, "%"], SURF3],
  calc(st) {
    const th = Math.atan(st.grade / 100), mu = MU[st.surf], v = st.kmh / 3.6;
    const a = g * (mu * Math.cos(th) + Math.sin(th)), flat = v * v / (2 * mu * g);
    const dist = a > .3 ? v * v / (2 * a) : Infinity, diff = (dist / flat - 1) * 100;
    return { dist, flat, th,
      say: !isFinite(dist) ? ["slNoStop", {}, "bad"] : st.grade < 0 ? ["slDown", { p: Math.round(diff) }, "warnt"] : st.grade > 0 ? ["slUp", { p: Math.round(-diff) }, "good"] : ["slFlatSay", {}, "good"],
      rows: [["slDist", isFinite(dist) ? `${fx(dist)} m` : "∞"], ["slFlat", `${fx(flat)} m`]], tip: "slTip" };
  },
  draw(st, r) {
    const ang = -Math.atan(st.grade / 100) * 2.2, cx = 150, cy = 140;
    let s = BG() + `<g transform="rotate(${fx(ang * 180 / Math.PI)} ${cx} ${cy})"><rect x="20" y="${cy}" width="260" height="22" class="road"/>${car(cx + 20, cy - 14, "you", 1, 0)}</g>`;
    s += T(cx, 230, `${st.grade > 0 ? "+" : ""}${st.grade}%`, "hlab", "middle");
    const max = Math.max(r.flat, isFinite(r.dist) ? r.dist : r.flat * 2.5) * 1.1;
    s += hbar(330, 80, 280, 16, r.flat, max, "l3okbar", t1("slFlat")) + hbar(330, 150, 280, 16, isFinite(r.dist) ? r.dist : max, max, isFinite(r.dist) ? (r.dist > r.flat ? "l3badbar" : "l3okbar") : "l3badbar", t1("slThis"));
    s += T(612, 113, `${fx(r.flat)} m`, "axis", "end") + T(612, 183, isFinite(r.dist) ? `${fx(r.dist)} m` : "—", "axis", "end");
    return s;
  },
});

def("abs", {
  st: { pedal: 60, abs: "on", surf: "dry" },
  ctl: [["r", "pedal", "abPedal", 0, 100, 5, "%"], ["abs", "abAbs", [["on", "on"], ["off", "off"]]], SURF3],
  calc(st) {
    const mup = MU[st.surf], dem = st.pedal / 100, s = st.abs === "on" ? Math.min(dem, .15) : dem;
    const muS = (x) => Math.sin(1.6 * Math.atan(10 * x));
    const br = mup * muS(s), lat = mup * Math.max(0, 1 - s * 2.6), v = 60 / 3.6;
    const stop = br > .02 ? v * v / (2 * br * g) : Infinity;
    return { s, muS, br, lat, mup, stop,
      say: s >= .9 ? ["abLocked", {}, "bad"] : st.abs === "on" && st.pedal >= 30 ? ["abWorking", {}, "good"] : ["abLight", {}, ""],
      rows: [["abBrake", `${Math.round(br / mup * 100)}%`], ["abSteer", `${Math.round(lat / mup * 100)}%`], ["abStop", isFinite(stop) ? `${fx(stop)} m` : "—"]], tip: "abTip" };
  },
  draw(st, r) {
    const X = (x) => 60 + x * 340, Y = (y) => 210 - y * 150;
    const pts = []; for (let i = 0; i <= 50; i++) { const x = i / 50; pts.push([x, r.muS(x)]); }
    let s = BG() + Ln(60, 210, 410, 210, "gridl") + Ln(60, 50, 60, 210, "gridl") + T(235, 240, t1("abSlip"), "axis", "middle") + T(66, 44, t1("abGripAx"));
    s += plot(pts, X, Y, "l3curve") + `<rect x="${X(.08)}" y="50" width="${X(.2) - X(.08)}" height="160" class="l3zone"/>` + T(X(.14), 66, "ABS", "tiny", "middle");
    s += `<circle cx="${fx(X(r.s))}" cy="${fx(Y(r.muS(r.s)))}" r="8" class="l3dot"/>`;
    // top view of the car: front wheels can steer only with lateral grip left
    const ok = r.lat / r.mup > .3;
    s += `<g transform="translate(520,135)"><rect x="-26" y="-50" width="52" height="100" rx="12" class="bsbody"/>`;
    s += `<rect x="-34" y="-40" width="10" height="22" rx="3" class="l3wheel" transform="rotate(${ok ? -18 : 0} -29 -29)"/><rect x="24" y="-40" width="10" height="22" rx="3" class="l3wheel" transform="rotate(${ok ? -18 : 0} 29 -29)"/>`;
    s += `<rect x="-34" y="22" width="10" height="22" rx="3" class="l3wheel"/><rect x="24" y="22" width="10" height="22" rx="3" class="l3wheel"/>`;
    s += ok ? `<path d="M0 -58 Q-10 -84 -34 -96" class="l3steer"/>` : `<path d="M0 -58 L0 -98" class="l3nosteer"/>` + T(14, -80, "✕", "hlab");
    s += `</g>` + T(520, 250, t1(ok ? "abCanSteer" : "abNoSteer"), ok ? "l3good" : "l3bad", "middle");
    return s;
  },
});

def("weighttransfer", {
  st: { acc: -.7, h: .55, wb: 2.6 },
  ctl: [["r", "acc", "wtAccel", -1, .5, .05, "g", 2], ["r", "h", "wtHeight", .4, .9, .05, "m", 2], ["r", "wb", "wtWheelbase", 2.2, 3.2, .1, "m", 1]],
  calc(st) {
    const front = clamp(.6 - st.acc * st.h / st.wb, 0, 1);
    return { front,
      say: st.acc < -.3 ? ["wtBrake", {}, "warnt"] : st.acc > .2 ? ["wtAccelSay", {}, ""] : ["wtSteady", {}, "good"],
      rows: [["wtFront", `${Math.round(front * 100)}%`], ["wtRear", `${Math.round((1 - front) * 100)}%`]], tip: "wtTip" };
  },
  draw(st, r) {
    const pitch = (r.front - .6) * 22, fx0 = 430, rx0 = 210;
    let s = BG() + `<rect x="0" y="212" width="640" height="48" class="road"/>`;
    s += `<g transform="rotate(${fx(pitch)} 320 150)"><path d="M150 170 L170 120 L260 100 L390 100 L450 128 L500 138 L500 170 Z" class="l3body"/><path d="M265 108 L330 108 L330 128 L250 128 Z" class="win"/><path d="M342 108 L385 108 L425 128 L342 128 Z" class="win"/>`;
    s += `<circle cx="${320 + (st.acc < 0 ? 0 : 0)}" cy="${170 - st.h * 70}" r="7" class="l3cg"/></g>`;
    s += `<circle cx="${rx0}" cy="190" r="24" class="l3wheelc"/><circle cx="${fx0}" cy="190" r="24" class="l3wheelc"/>`;
    s += R(fx0 - 12, 150 - r.front * 120, 24, r.front * 120, "l3okbar", 4) + R(rx0 - 12, 150 - (1 - r.front) * 120, 24, (1 - r.front) * 120, "l3okbar", 4);
    s += T(fx0, 248, `${t1("wtFront")} ${Math.round(r.front * 100)}%`, "axis", "middle") + T(rx0, 248, `${t1("wtRear")} ${Math.round((1 - r.front) * 100)}%`, "axis", "middle");
    s += T(560, 40, st.acc < 0 ? "← " + t1("wtBraking") : st.acc > 0 ? t1("wtAccelerating") + " →" : "", "axis", "middle");
    return s;
  },
});

/* =================== SEEING & BEING SEEN =================== */

def("fog", {
  st: { vis: 60, kmh: 60, rt: 1.5, surf: "wet" },
  ctl: [["r", "vis", "fgVis", 10, 200, 5, "m"], ["r", "kmh", "speed", 20, 100, 5, "km/h"], ["r", "rt", "reactionTime", .5, 2.5, .1, "s", 1], SURF2],
  calc(st) {
    const mu = MU[st.surf], stop = stopD(st.kmh / 3.6, st.rt, mu), vmax = vmaxFor(st.vis, st.rt, mu);
    return { stop, vmax, say: stop <= st.vis ? ["fgOk", { m: fx(st.vis - stop) }, "good"] : ["fgOver", { m: fx(stop - st.vis) }, "bad"],
      rows: [["totalDist", `${fx(stop)} m`], ["fgMax", `${Math.floor(vmax)} km/h`]], tip: "fgTip" };
  },
  draw(st, r, t) {
    const span = Math.max(st.vis, r.stop, 60) * 1.15, X = (m) => 70 + m / span * 540, Y = 140;
    let s = `<defs><linearGradient id="fogG" x1="0" x2="1"><stop offset="0" stop-color="#cbd5e1" stop-opacity="0"/><stop offset="1" stop-color="#cbd5e1" stop-opacity=".95"/></linearGradient></defs>`;
    s += BG() + `<rect x="0" y="100" width="640" height="80" class="road"/>` + Ln(0, 140, 640, 140, "cl");
    s += R(X(st.vis) - 26, 118, 26, 24, "lead", 5) + T(X(st.vis) - 13, 112, t1("fgStopped"), "tiny", "middle");
    s += `<rect x="${fx(X(st.vis * .35))}" y="0" width="${fx(640 - X(st.vis * .35))}" height="260" fill="url(#fogG)"/><rect x="${fx(X(st.vis))}" y="0" width="${fx(640 - X(st.vis))}" height="260" class="l3fogwall"/>`;
    s += Ln(X(st.vis), 92, X(st.vis), 190, "seeline") + T(X(st.vis), 86, `${st.vis} m`, "axis", "middle");
    s += R(X(0), 200, X(r.stop) - X(0), 8, r.stop <= st.vis ? "l3okbar" : "l3badbar", 4) + T(X(0), 228, `${t1("totalDist")} ${fx(r.stop)} m`);
    s += car(X(Math.min(r.stop, st.vis) * t) + 34, Y, "you");
    return s;
  },
  run: "fgDrive", dur: 2.4,
});

def("eyesoff", {
  st: { kmh: 60, secs: 2 },
  ctl: [["r", "kmh", "speed", 20, 120, 5, "km/h"], ["r", "secs", "eoSecs", .5, 5, .5, "s", 1]],
  calc(st) {
    const dist = st.kmh / 3.6 * st.secs;
    return { dist, say: ["eoSay", { m: Math.round(dist) }, "bad"],
      rows: [["eoDist", `${fx(dist)} m`], ["eoPitch", `×${fx(dist / 20.12)}`], ["eoBus", `×${fx(dist / 12)}`]], tip: "eoTip" };
  },
  draw(st, r, t) {
    const span = Math.max(r.dist, 40) * 1.2, X = (m) => 60 + m / span * 560;
    let s = BG() + `<rect x="0" y="110" width="640" height="70" class="road"/>` + Ln(0, 145, 640, 145, "cl");
    s += R(X(0), 104, X(r.dist) - X(0), 82, "l3blind", 6) + T((X(0) + X(r.dist)) / 2, 98, `${t1("eoBlind")} · ${Math.round(r.dist)} m`, "hlab", "middle");
    [12, 27, 45, 70].forEach((m, i) => { if (m < span) s += `<g transform="translate(${fx(X(m))},${i % 2 ? 128 : 162})" class="l3ped"><circle r="5" cy="-8"/><rect x="-4" y="-3" width="8" height="12" rx="3"/></g>`; });
    for (let m = 0; m <= span; m += span > 120 ? 20 : 10) s += T(X(m), 210, `${m}`, "tiny", "middle");
    s += car(X(r.dist * t) + 34, 145, "you");
    return s;
  },
  run: "eoRun", dur: 2.2,
});

const TZ = {
  truck: { L: 10, W: 2.5, zones: [[-1.6, 5, 3.2, 3], [-4.2, -3.5, 2.95, 8], [1.25, -2, 1.6, 4.2], [-1.8, -17, 3.6, 12]] },
  bus: { L: 12, W: 2.6, zones: [[-1.6, 6, 3.2, 2.5], [-4.2, -4.5, 2.9, 9.5], [1.3, -2.5, 1.5, 4.5], [-1.8, -19, 3.6, 13]] },
};
def("truckzones", {
  st: { veh: "truck", x: -2.5, y: 1 },
  ctl: [["veh", "tzVeh", [["truck", "tzTruck"], ["bus", "tzBus"]]], ["r", "x", "tzSide", -6, 6, .5, "m", 1], ["r", "y", "tzAlong", -16, 9, .5, "m", 1]],
  calc(st) {
    const v = TZ[st.veh], hid = v.zones.some(([x, y, w, h]) => st.x >= x && st.x <= x + w && st.y >= y && st.y <= y + h) || (Math.abs(st.x) < v.W / 2 && Math.abs(st.y) < v.L / 2);
    return { hid, say: hid ? ["tzHidden", {}, "bad"] : ["tzSeen", {}, "good"], rows: [], tip: "tzTip" };
  },
  vb: "0 0 640 300",
  draw(st, r) {
    const v = TZ[st.veh], S = 13, OX = 320, OY = 110, P = (x, y) => [OX + x * S, OY - y * S];
    let s = BG(640, 300) + `<rect x="${OX - 6.8 * S}" y="0" width="${13.6 * S}" height="300" class="bsasph"/>`;
    [-3.4, 0, 3.4].forEach((x) => { const [lx] = P(x - 1.7, 0); s += Ln(lx, 0, lx, 300, "bsdash"); });
    v.zones.forEach(([x, y, w, h]) => { const [a, b] = P(x, y + h); s += R(a, b, w * S, h * S, "l3nozone", 4); });
    const [bx, by] = P(-v.W / 2, v.L / 2);
    s += R(bx, by, v.W * S, v.L * S, "l3truck", 5) + R(bx + 2, by + 2, v.W * S - 4, 2.2 * S, "l3cab", 4) + `<circle cx="${P(.7, 0)[0]}" cy="${P(0, v.L / 2 - 1.1)[1]}" r="4" class="bsdriver"/>`;
    const [px, py] = P(st.x, st.y);
    s += `<g transform="translate(${fx(px)},${fx(py)})" class="bsbike ${r.hid ? "hid" : "vis"}">${r.hid ? `<circle r="20" class="bsping"/>` : ""}<rect x="-3.5" y="-14" width="7" height="28" rx="3.5" class="bsbk"/><circle cy="-1" r="5.5" class="bshelm"/></g>`;
    s += T(16, 22, t1("tzTapHint"), "tiny");
    return s;
  },
  place(svg, st, done) {
    svg.addEventListener("click", (ev) => {
      const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      st.x = clamp(Math.round((p.x - 320) / 13 * 2) / 2, -6, 6); st.y = clamp(Math.round((110 - p.y) / 13 * 2) / 2, -16, 9);
      done();
    });
  },
});

/* =================== CRASH SAFETY =================== */

def("seatbelt", {
  st: { kmh: 50, crumple: .5, child: "no" },
  ctl: [["r", "kmh", "speed", 10, 80, 5, "km/h"], ["r", "crumple", "sbCrumple", .2, .9, .05, "m", 2], YESNO("child", "sbChild")],
  calc(st) {
    const v = st.kmh / 3.6, gb = v * v / (2 * (st.crumple + .25) * g), gu = v * v / (2 * .08 * g);
    const rows = [["sbBelted", `${Math.round(gb)} g`], ["sbUnbelted", `${Math.round(gu)} g`]];
    if (st.child === "yes") rows.push(["sbChildKg", `${Math.round(12 * gb)} kg`, "bad"]);
    return { gb, gu, say: ["sbSay", { cm: Math.round((st.crumple + .25) * 100), x: Math.round(gu / gb) }, "warnt"], rows, tip: "sbTip" };
  },
  draw(st, r, t) {
    const max = r.gu * 1.05;
    let s = BG() + T(40, 40, t1("sbBelted"), "hlab") + T(40, 140, t1("sbUnbelted"), "hlab");
    s += hbar(40, 58, 560, 22, r.gb * t, max, "l3okbar") + T(604, 74, `${Math.round(r.gb * t)} g`, "axis", "end");
    s += hbar(40, 158, 560, 22, r.gu * t, max, "l3badbar") + T(604, 174, `${Math.round(r.gu * t)} g`, "axis", "end");
    s += T(40, 105, t1("sbStopsOver", { cm: Math.round((st.crumple + .25) * 100) }), "tiny") + T(40, 205, t1("sbStopsOver", { cm: 8 }), "tiny");
    if (st.child === "yes") s += T(40, 240, t1("sbChildLine", { kg: Math.round(12 * r.gb) }), "l3bad");
    return s;
  },
  run: "sbCrash", dur: 1.2,
});

def("helmet", {
  st: { kmh: 30, helmet: "yes", strap: "tight" },
  ctl: [["r", "kmh", "hmSpeed", 10, 60, 5, "km/h"], YESNO("helmet", "hmHelmet"), ["strap", "hmStrap", [["tight", "hmTight"], ["loose", "hmLoose"]]]],
  calc(st) {
    const on = st.helmet === "yes" && st.strap === "tight", d = on ? .035 : .006, v = st.kmh / 3.6;
    const gg = v * v / (2 * d * g), fall = v * v / (2 * g);
    return { on, gg, d, say: on ? ["hmWith", {}, "good"] : st.helmet === "yes" ? ["hmLooseSay", {}, "bad"] : ["hmWithout", {}, "bad"],
      rows: [["hmG", `${Math.round(gg)} g`], ["hmFall", `${fx(fall)} m`]], tip: "hmTip" };
  },
  draw(st, r) {
    const crush = r.on ? 18 : 0;
    let s = BG() + `<rect x="0" y="214" width="640" height="46" class="road"/>`;
    s += `<g transform="translate(200,${130 + crush * .3})">`;
    if (st.helmet === "yes") s += `<path d="M-86 40 A86 86 0 0 1 86 40 L86 ${70 - crush} L-86 ${70 - crush} Z" class="l3shell"/><path d="M-72 40 A72 72 0 0 1 72 40 L72 ${62 - crush} L-72 ${62 - crush} Z" class="l3eps"/>`;
    s += `<circle r="58" cy="20" class="l3head"/></g>`;
    s += T(200, 246, t1(r.on ? "hmLiner" : "hmNoLiner"), "tiny", "middle");
    const max = 2600;
    s += hbar(360, 90, 240, 18, r.gg, max, r.on ? "l3okbar" : "l3badbar", t1("hmG")) + T(600, 130, `${Math.round(r.gg)} g`, "hlab", "end");
    s += T(360, 170, t1("hmStopIn", { mm: Math.round(r.d * 1000) }), "axis");
    return s;
  },
});

const RV = { hatch: [1.45, .52], suv: [1.58, .70], van: [1.45, .85] };
def("rollover", {
  st: { veh: "suv", roof: "no", gl: .6, surf: "dry" },
  ctl: [["veh", "roVeh", [["hatch", "roHatch"], ["suv", "roSuv"], ["van", "roVan"]]], YESNO("roof", "roRoof"), ["r", "gl", "roLat", 0, 1.2, .05, "g", 2], SURF3],
  calc(st) {
    const [t, h0] = RV[st.veh], h = h0 + (st.roof === "yes" ? .08 : 0), ssf = t / (2 * h), mu = MU[st.surf];
    const say = st.gl >= ssf && ssf <= mu ? ["roTip", {}, "bad"] : st.gl >= mu ? ["roSkid", {}, "warnt"] : ["roOk", {}, "good"];
    return { t, h, ssf, mu, say, rows: [["roSSF", fx(ssf, 2)], ["roTipAt", `${fx(ssf, 2)} g`], ["roGrip", `${fx(mu, 2)} g`]], tip: "roTip2" };
  },
  draw(st, r) {
    const S = 92, base = 214, tilt = clamp(st.gl / r.ssf, 0, 1.2) * (st.gl >= r.ssf && r.ssf <= r.mu ? 24 : 6), w = r.t * S, hh = r.h * 2 * S * .9;
    let s = BG() + `<rect x="0" y="${base}" width="640" height="50" class="road"/>`;
    s += `<g transform="rotate(${fx(-tilt)} ${320 + w / 2} ${base})">`;
    s += R(320 - w / 2, base - 18 - hh, w, hh, "l3body", 14) + R(320 - w / 2 + 10, base - hh + 2 - 18, w - 20, hh * .3, "win", 6);
    if (st.roof === "yes") s += R(320 - w / 2 + 14, base - 18 - hh - 22, w - 28, 22, "l3load", 4);
    s += R(320 - w / 2 - 6, base - 30, 22, 30, "l3wheel", 5) + R(320 + w / 2 - 16, base - 30, 22, 30, "l3wheel", 5);
    const cgY = base - r.h * S;
    s += `<circle cx="320" cy="${fx(cgY)}" r="8" class="l3cg"/>` + Ln(320, cgY, 320 + st.gl * 90, cgY, "l3arrow") + Ln(320, cgY, 320, cgY + 70, "l3arrow");
    s += Ln(320, cgY, 320 + w / 2, base, "l3dash") + `</g>` + T(320 - w / 2, 36, `${t1("roSSF")} ${fx(r.ssf, 2)}`, "hlab");
    return s;
  },
});

/* =================== VEHICLE & ENGINE =================== */

const GR = [3.58, 2.02, 1.35, 1.0, .81], FD = 4.06, CIRC = 1.85;
def("gears", {
  st: { gear: "3", kmh: 50 },
  ctl: [["gear", "grGear", [["1", "=1"], ["2", "=2"], ["3", "=3"], ["4", "=4"], ["5", "=5"]]], ["r", "kmh", "speed", 0, 130, 5, "km/h"]],
  calc(st) {
    const rpmOf = (gi) => st.kmh / 3.6 / CIRC * 60 * GR[gi] * FD;
    const gi = +st.gear - 1, rpm = rpmOf(gi);
    let best = 0;
    for (let i = 0; i < 5; i++) if (rpmOf(i) >= 1700) best = i;
    const say = rpm > 6500 ? ["grOver", {}, "bad"] : rpm < 1200 && st.kmh > 5 ? ["grLug", {}, "warnt"] : rpm > 4500 ? ["grHigh", {}, "warnt"] : ["grOk", {}, "good"];
    return { rpm, say, rows: [["grRpm", `${Math.round(rpm / 10) * 10}`], ["grPull", `×${fx(GR[gi] / GR[4], 1)}`], ["grBest", `${best + 1}`]], tip: "grTip" };
  },
  draw(st, r) {
    const cx = 320, cy = 210, rad = 160, A = (rpm) => Math.PI * (1.1 - clamp(rpm, 0, 7000) / 7000 * 1.2);
    const pt = (rpm, rr) => [cx + Math.cos(A(rpm)) * rr, cy - Math.sin(A(rpm)) * rr];
    const arc = (a, b, cls) => { const [x1, y1] = pt(a, rad), [x2, y2] = pt(b, rad); return `<path d="M${fx(x1)} ${fx(y1)} A${rad} ${rad} 0 0 1 ${fx(x2)} ${fx(y2)}" class="${cls}"/>`; };
    let s = BG() + arc(0, 7000, "l3dial") + arc(0, 1200, "l3dialwarn") + arc(6000, 7000, "l3dialred");
    for (let k = 0; k <= 7; k++) { const [x1, y1] = pt(k * 1000, rad - 12), [x2, y2] = pt(k * 1000, rad + 2), [tx, ty] = pt(k * 1000, rad - 30); s += Ln(x1, y1, x2, y2, "l3tick") + T(tx, ty + 4, k, "axis", "middle"); }
    const [nx, ny] = pt(r.rpm, rad - 18);
    s += Ln(cx, cy, nx, ny, "l3needle") + `<circle cx="${cx}" cy="${cy}" r="9" class="l3cg"/>`;
    s += T(cx, cy - 40, `${Math.round(r.rpm / 10) * 10}`, "l3big", "middle") + T(cx, cy - 20, "rpm × 1000", "tiny", "middle");
    s += R(540, 40, 60, 60, "l3gearbox", 10) + T(570, 84, st.gear, "l3big", "middle");
    return s;
  },
});

const fuelL100 = (kmh, st) => {
  const V = Math.max(kmh, 10) / 3.6, m = 1100 + (st.load === "full" ? 300 : st.load === "roof" ? 380 : 80);
  const CdA = .68 + (st.load === "roof" ? .15 : 0), acc = 1200 + (st.ac === "on" ? 1500 : 0);
  const J = (.5 * 1.2 * CdA * V * V + .011 * m * g) / .25 + acc / .25 / V;
  return J * 1e5 / 34.2e6;
};
def("economy", {
  st: { kmh: 70, ac: "off", load: "one" },
  ctl: [["r", "kmh", "speed", 20, 130, 5, "km/h"], ["ac", "ecAc", [["off", "off"], ["on", "on"]]], ["load", "ecLoad", [["one", "ecOne"], ["full", "ecFull"], ["roof", "ecRoof"]]]],
  calc(st) {
    const cur = fuelL100(st.kmh, st); let best = 20;
    for (let v = 20; v <= 130; v++) if (fuelL100(v, st) < fuelL100(best, st)) best = v;
    const extra = (cur / fuelL100(best, st) - 1) * 100;
    return { cur, best, say: extra > 20 ? ["ecHigh", { p: Math.round(extra) }, "warnt"] : ["ecGood", {}, "good"],
      rows: [["ecL100", `${fx(cur)} L/100 km`], ["ecKmpl", `${fx(100 / cur)} km/L`], ["ecBest", `≈ ${best} km/h`]], tip: "ecTip" };
  },
  draw(st, r) {
    const pts = []; let mx = 0;
    for (let v = 20; v <= 130; v += 2) { const f = fuelL100(v, st); pts.push([v, f]); mx = Math.max(mx, f); }
    const X = (v) => 60 + (v - 20) / 110 * 540, Y = (f) => 220 - f / (mx * 1.1) * 180;
    let s = BG() + Ln(60, 220, 600, 220, "gridl") + Ln(60, 30, 60, 220, "gridl");
    for (let v = 20; v <= 130; v += 20) s += T(X(v), 240, v, "tiny", "middle");
    s += T(66, 26, "L/100 km") + T(600, 256, "km/h", "tiny", "end") + plot(pts, X, Y, "l3curve");
    s += `<circle cx="${fx(X(r.best))}" cy="${fx(Y(fuelL100(r.best, st)))}" r="6" class="l3best"/>` + T(X(r.best), Y(fuelL100(r.best, st)) + 22, t1("ecBestShort"), "tiny", "middle");
    s += `<circle cx="${fx(X(st.kmh))}" cy="${fx(Y(r.cur))}" r="8" class="l3dot"/>`;
    return s;
  },
});

const CDA = { closed: .66, open: .72, roof: .82 };
const powerKw = (kmh, cda) => { const V = kmh / 3.6; return [(.5 * 1.2 * cda * V ** 3) / 1000, (.011 * 1200 * g * V) / 1000]; };
def("drag", {
  st: { kmh: 80, shape: "closed" },
  ctl: [["r", "kmh", "speed", 20, 140, 5, "km/h"], ["shape", "drShape", [["closed", "drClosed"], ["open", "drOpen"], ["roof", "drRoof"]]]],
  calc(st) {
    const [d, rr] = powerKw(st.kmh, CDA[st.shape]), [d2, rr2] = powerKw(st.kmh / 2, CDA[st.shape]);
    return { d, rr, say: ["drCube", {}, ""], rows: [["drPower", `${fx(d + rr)} kW`], ["drShare", `${Math.round(d / (d + rr) * 100)}%`], ["drHalf", `×${fx((d + rr) / (d2 + rr2))}`]], tip: "drTip" };
  },
  draw(st, r) {
    const cda = CDA[st.shape], top = powerKw(140, cda).reduce((a, b) => a + b, 0) * 1.05;
    const X = (v) => 60 + (v - 20) / 120 * 540, Y = (p) => 220 - p / top * 185;
    const rr = [], tot = [];
    for (let v = 20; v <= 140; v += 2) { const [a, b] = powerKw(v, cda); rr.push([v, b]); tot.push([v, a + b]); }
    let s = BG() + Ln(60, 220, 600, 220, "gridl") + Ln(60, 30, 60, 220, "gridl") + T(66, 26, "kW") + T(600, 256, "km/h", "tiny", "end");
    for (let v = 20; v <= 140; v += 20) s += T(X(v), 240, v, "tiny", "middle");
    s += `<path d="M${X(20)} ${Y(0)} ${tot.map(([v, p]) => `L${fx(X(v))} ${fx(Y(p))}`).join(" ")} L${X(140)} ${Y(0)} Z" class="l3fillA"/>`;
    s += `<path d="M${X(20)} ${Y(0)} ${rr.map(([v, p]) => `L${fx(X(v))} ${fx(Y(p))}`).join(" ")} L${X(140)} ${Y(0)} Z" class="l3fillB"/>`;
    s += Ln(X(st.kmh), 30, X(st.kmh), 220, "l3needle") + `<circle cx="${fx(X(st.kmh))}" cy="${fx(Y(r.d + r.rr))}" r="7" class="l3dot"/>`;
    s += R(420, 40, 12, 12, "l3fillA", 2) + T(438, 51, t1("drAir"), "tiny") + R(420, 60, 12, 12, "l3fillB", 2) + T(438, 71, t1("drRolling"), "tiny");
    return s;
  },
});

def("regen", {
  st: { kmh: 60, mass: 1500, eff: 60 },
  ctl: [["r", "kmh", "speed", 20, 120, 5, "km/h"], ["r", "mass", "rgMass", 800, 2500, 100, "kg"], ["r", "eff", "rgEff", 0, 80, 5, "%"]],
  calc(st) {
    const V = st.kmh / 3.6, wh = .5 * st.mass * V * V / 3600, back = wh * st.eff / 100;
    return { wh, back, say: ["rgSay", { p: st.eff }, "good"], rows: [["rgKE", `${Math.round(wh)} Wh`], ["rgBack", `${Math.round(back)} Wh`], ["rgKm", `${fx(back / 150 * 1000)} m`]], tip: "rgTip" };
  },
  draw(st, r) {
    const W = 520;
    let s = BG() + T(60, 60, t1("rgSplit"), "hlab");
    s += R(60, 80, W, 34, "l3track", 8) + R(60, 80, W * st.eff / 100, 34, "l3fillA", 8) + R(60 + W * st.eff / 100, 80, W * (1 - st.eff / 100), 34, "l3heat", 8);
    s += T(66, 102, `${t1("rgToBattery")} ${Math.round(r.back)} Wh`, "l3onbar") + T(574, 102, `${t1("rgToHeat")} ${Math.round(r.wh - r.back)} Wh`, "l3onbar", "end");
    s += R(240, 150, 150, 70, "l3batt", 10) + R(390, 172, 10, 26, "l3batt", 3) + R(246, 156, 138 * Math.min(1, .3 + st.eff / 160), 58, "l3fillA", 6);
    return s;
  },
});

def("ghat", {
  st: { drop: 600, veh: "car", eb: 30 },
  ctl: [["r", "drop", "ghDrop", 100, 1500, 50, "m"], ["veh", "ghVeh", [["car", "ghCar"], ["loaded", "ghLoaded"], ["bus", "ghBus"]]], ["r", "eb", "ghEngine", 0, 70, 5, "%"]],
  calc(st) {
    const m = { car: 1200, loaded: 1700, bus: 12000 }[st.veh], mb = { car: 30, loaded: 30, bus: 320 }[st.veh];
    const E = m * g * st.drop, Eb = E * .8 * (1 - st.eb / 100), dT = Eb / (mb * 460);
    return { E, Eb, dT, say: dT > 500 ? ["ghDanger", {}, "bad"] : dT > 250 ? ["ghHot", {}, "warnt"] : ["ghOk", {}, "good"],
      rows: [["ghEnergy", `${fx(E / 1e6)} MJ`], ["ghBrakes", `${fx(Eb / 1e6)} MJ`], ["ghTemp", `+${Math.round(dT)} °C`]], tip: "ghTip" };
  },
  draw(st, r) {
    let s = BG() + `<path d="M0 60 C120 60 160 110 240 120 S380 190 460 200 S600 230 640 232 L640 260 L0 260 Z" class="l3hill"/>`;
    s += `<path d="M0 60 C120 60 160 110 240 120 S380 190 460 200 S600 230 640 232" class="l3ghat"/>` + car(330, 160, "you", .8, 24);
    const heat = clamp(r.dT / 600, 0, 1), col = `hsl(${fx(40 - heat * 40)},${fx(20 + heat * 75)}%,${fx(40 + heat * 15)}%)`;
    s += `<g transform="translate(540,90)"><circle r="44" fill="${col}" class="l3disc"/><circle r="14" class="l3rim"/>${[0, 1, 2, 3, 4].map((i) => `<circle r="3.5" cx="${fx(Math.cos(i * 1.257) * 25)}" cy="${fx(Math.sin(i * 1.257) * 25)}" class="l3holes"/>`).join("")}</g>`;
    s += T(540, 154, `+${Math.round(r.dT)} °C`, "hlab", "middle") + T(60, 36, `${t1("ghDropShort")} ${st.drop} m`, "axis");
    return s;
  },
});

/* =================== TRAFFIC & PLANNING =================== */

def("overtaking", {
  st: { you: 70, truck: 50, len: 12, onc: 60 },
  ctl: [["r", "you", "ovYou", 40, 110, 5, "km/h"], ["r", "truck", "ovTruck", 20, 80, 5, "km/h"], ["r", "len", "ovLen", 6, 20, 1, "m"], ["r", "onc", "ovOnc", 0, 100, 5, "km/h"]],
  calc(st) {
    const dv = (st.you - st.truck) / 3.6;
    if (dv <= .5) return { never: true, say: ["ovNever", {}, "bad"], rows: [], tip: "ovTip" };
    const gain = 20 + st.len + 4.5 + 20, t = gain / dv, dy = st.you / 3.6 * t, dO = st.onc / 3.6 * t, need = dy + dO;
    return { t, dy, need, say: need > 400 ? ["ovLong", { m: Math.round(need) }, "warnt"] : ["ovOk", { m: Math.round(need) }, ""],
      rows: [["ovTime", `${fx(t)} s`], ["ovDist", `${Math.round(dy)} m`], ["ovNeed", `${Math.round(need)} m`]], tip: "ovTip" };
  },
  draw(st, r) {
    let s = BG() + `<rect x="0" y="90" width="640" height="90" class="road"/>` + Ln(0, 135, 640, 135, "cl");
    s += R(150, 140, st.len * 6, 30, "l3truck", 4) + car(140, 155, "you");
    if (r.never) return s + T(320, 70, t1("ovNever"), "l3bad", "middle");
    const span = Math.max(r.need, 200), X = (m) => 110 + m / span * 500;
    s += car(X(r.need) - 34, 112, "lead", 1, 180) + R(X(0), 200, X(r.need) - X(0), 10, r.need > 400 ? "l3badbar" : "l3okbar", 5) + T(X(0), 230, `${t1("ovNeed")} ${Math.round(r.need)} m`);
    s += R(X(0), 214, X(r.dy) - X(0), 4, "l3fillA", 2);
    return s;
  },
});

def("traveltime", {
  st: { km: 50, slow: 60, fast: 80, town: 40 },
  ctl: [["r", "km", "ttKm", 5, 300, 5, "km"], ["r", "slow", "ttSlow", 30, 100, 5, "km/h"], ["r", "fast", "ttFast", 40, 140, 5, "km/h"], ["r", "town", "ttTown", 0, 80, 5, "%"]],
  calc(st) {
    const tt = (v) => (st.km * (1 - st.town / 100) / v + st.km * st.town / 100 / Math.min(30, v)) * 60;
    const a = tt(st.slow), b = tt(Math.max(st.fast, st.slow)), sa = stopD(st.slow / 3.6, 1.5, .7), sb = stopD(Math.max(st.fast, st.slow) / 3.6, 1.5, .7);
    return { a, b, sa, sb, say: ["ttSay", { m: Math.round(a - b), km: st.km }, ""],
      rows: [["ttSaved", `${Math.round(a - b)} min`], ["ttStops", `${Math.round(sa)} → ${Math.round(sb)} m`], ["ttEnergy", `×${fx((Math.max(st.fast, st.slow) / st.slow) ** 2)}`]], tip: "ttTip" };
  },
  draw(st, r) {
    const max = Math.max(r.a, 1) * 1.05;
    let s = BG() + T(40, 40, t1("ttTimeTitle"), "hlab");
    s += hbar(40, 58, 520, 18, r.a, max, "l3fillB") + T(566, 72, `${Math.round(r.a)} min · ${st.slow}`, "axis") + hbar(40, 92, 520, 18, r.b, max, "l3fillA") + T(566, 106, `${Math.round(r.b)} min · ${st.fast}`, "axis");
    const ms = Math.max(r.sb, 1) * 1.05;
    s += T(40, 150, t1("ttStopTitle"), "hlab") + hbar(40, 168, 520, 18, r.sa, ms, "l3okbar") + T(566, 182, `${Math.round(r.sa)} m`, "axis") + hbar(40, 202, 520, 18, r.sb, ms, "l3badbar") + T(566, 216, `${Math.round(r.sb)} m`, "axis");
    return s;
  },
});

const WB = { car: 2.6, bus: 6.0, truck: 7.5 };
def("offtracking", {
  st: { veh: "bus", r: 12 },
  ctl: [["veh", "otVeh", [["car", "otCar"], ["bus", "otBus"], ["truck", "otTruck"]]], ["r", "r", "otRadius", 6, 25, 1, "m"]],
  calc(st) {
    const L = WB[st.veh], Rf = Math.max(st.r, L + .5), rr = Math.sqrt(Rf * Rf - L * L), cut = Rf - rr;
    return { L, Rf, rr, cut, say: ["otSay", { m: fx(cut) }, cut > 2 ? "bad" : cut > 1 ? "warnt" : "good"], rows: [["otCut", `${fx(cut)} m`]], tip: "otTip" };
  },
  vb: "0 0 640 300",
  draw(st, r) {
    const S = 9, cx = 110, cy = 290, P = (rad, a) => [cx + Math.cos(a) * rad * S, cy - Math.sin(a) * rad * S];
    let s = BG(640, 300) + `<rect x="0" y="0" width="640" height="300" class="road"/>` + R(0, cy - 3 * S, cx + 3 * S, 300, "l3pave", 14);
    const arc = (rad, cls) => { const [x1, y1] = P(rad, 0), [x2, y2] = P(rad, Math.PI / 2); return `<path d="M${fx(x1)} ${fx(y1)} A${fx(rad * S)} ${fx(rad * S)} 0 0 0 ${fx(x2)} ${fx(y2)}" class="${cls}"/>`; };
    s += arc(r.Rf, "l3pathF") + arc(r.rr, "l3pathR");
    // the vehicle mid-turn: front axle on the front path, body trailing back along its heading
    const a = Math.PI / 4, [fx0, fy0] = P(r.Rf, a), head = Math.atan2(-Math.cos(a), -Math.sin(a)) * 180 / Math.PI;
    s += `<g transform="translate(${fx(fx0)},${fx(fy0)}) rotate(${fx(head)})"><rect x="${fx(-r.L * S - 12)}" y="-11" width="${fx(r.L * S + 22)}" height="22" rx="4" class="l3truck"/><rect x="2" y="-10" width="8" height="20" rx="2" class="l3cab"/></g>`;
    const [bx, by] = P(Math.max(r.rr - 1.2, 4.5), Math.PI / 4.6);
    s += `<g transform="translate(${fx(bx)},${fx(by)})" class="bsbike ${r.cut > 1 ? "hid" : "vis"}"><rect x="-3" y="-12" width="6" height="24" rx="3" class="bsbk"/><circle r="5" class="bshelm"/></g>`;
    s += R(430, 30, 14, 4, "l3pathFk", 2) + T(450, 36, t1("otFront"), "tiny") + R(430, 50, 14, 4, "l3pathRk", 2) + T(450, 56, t1("otRear"), "tiny");
    return s;
  },
});

/* traffic waves: Intelligent Driver Model on a ring road */
def("trafficwave", {
  st: { gap: 1.0, n: 22 },
  ctl: [["r", "gap", "twGap", .5, 2.5, .1, "s", 1], ["r", "n", "twCars", 10, 30, 1, ""]],
  run: "twTap",
  vb: "0 0 640 280",
  calc() { return {}; },
  draw() { return ""; },
  live(svg, st, out) {
    const RING = 360, V0 = 20, A = 1.2, B = 1.8, S0 = 2, LEN = 4.5;
    let cars = [], last = performance.now(), acc = 0, raf = 0;
    const reset = () => { cars = []; for (let i = 0; i < st.n; i++) cars.push({ x: i * RING / st.n, v: 10 }); cars.n = st.n; };
    reset();
    this.changed = () => { if (cars.n !== st.n) reset(); };
    this.onRun = () => { if (cars[0]) cars[0].v *= .2; };
    const step = (dt) => {
      const n = cars.length;
      const order = cars.slice().sort((a, b) => a.x - b.x);
      for (let i = 0; i < n; i++) {
        const c = order[i], lead = order[(i + 1) % n];
        let gap = (lead.x - c.x + RING) % RING - LEN; if (gap < .1) gap = .1;
        const ss = S0 + c.v * st.gap + c.v * (c.v - lead.v) / (2 * Math.sqrt(A * B));
        c.a = A * (1 - (c.v / V0) ** 4 - (ss / gap) ** 2) + (Math.random() - .5) * .3;
      }
      cars.forEach((c) => { c.v = clamp(c.v + c.a * dt, 0, V0 * 1.1); c.x = (c.x + c.v * dt) % RING; });
    };
    const paint = () => {
      const cx = 320, cy = 140, rad = 110;
      let s = BG(640, 280) + `<circle cx="${cx}" cy="${cy}" r="${rad}" class="l3ring"/>`;
      cars.forEach((c) => {
        const a = c.x / RING * Math.PI * 2, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad, sp = clamp(c.v / V0, 0, 1);
        s += `<rect x="-7" y="-4" width="14" height="8" rx="2.5" transform="translate(${fx(x)},${fx(y)}) rotate(${fx(a * 180 / Math.PI + 90)})" fill="hsl(${fx(sp * 130)},70%,50%)"/>`;
      });
      const avg = cars.reduce((t, c) => t + c.v, 0) / cars.length * 3.6, stopped = cars.filter((c) => c.v < 1.5).length;
      s += T(cx, cy - 6, `${Math.round(avg)} km/h`, "l3big", "middle") + T(cx, cy + 16, t1("twAvg"), "tiny", "middle");
      svg.innerHTML = s;
      return { avg, stopped };
    };
    let tick = 0;
    const loop = (now) => {
      if (!svg.isConnected) return;
      const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt;
      if (!document.hidden) {
        for (let k = 0; k < 4; k++) step(dt * 1.5 / 4);
        const m = paint();
        if ((tick = (tick + 1) % 15) === 0) out.innerHTML = readout({ say: m.stopped > 0 ? ["twJam", { n: m.stopped }, "warnt"] : ["twFlow", {}, "good"], rows: [["twAvg", `${Math.round(m.avg)} km/h`], ["twStopped", `${m.stopped}`]], tip: "twTip" });
      }
      raf = requestAnimationFrame(loop);
    };
    if (Motion.reduced()) { for (let k = 0; k < 600; k++) step(.05); const m = paint(); out.innerHTML = readout({ rows: [["twAvg", `${Math.round(m.avg)} km/h`]], tip: "twTip" }); return; }
    raf = requestAnimationFrame(loop);
  },
});

/* make `this` inside live() the spec so it can register changed/onRun */
Object.values(D).forEach((sp) => { if (sp.live) sp.live = sp.live.bind(sp); });
})();
