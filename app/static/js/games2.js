/* iDrive games2.js — "decide and watch" games. Each round sets up a real
   situation (speeds, distances, road surface), you choose what to do, and the
   choice plays out live at true scale; then a card shows the working.
   Shared physics (simple, stated in every card):
     reaction time RT = 1.0 s (1.5 s in fog/at night where stated)
     braking: dry 7.0 m/s² (≈0.7 g), wet 4.5 m/s² (≈0.45 g)
     stopping distance = v·RT + v²/(2a);  time = distance ÷ speed
   World: metres, x along the road (+ = your direction), y across it
   (+ = down the screen). Keep left: traffic heading +x uses y < 0. */
(() => {
"use strict";
const Gm = window.Games, { def, D, W, H, rnd, ri, pick, clamp, fx } = Gm;
const u = (k, o) => I18n.u(k, o), e = (s) => I18n.X(s), t1 = (k, o) => I18n.one(u(k, o));
const RT = 1.0, A_DRY = 7.0, A_WET = 4.5, G = 9.81, CL = 4.5, CW = 1.8;
const kmh = (v) => Math.round(v * 3.6), ms = (k) => k / 3.6;
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const stopD = (v, rt, a) => v * rt + v * v / (2 * a);
/* position/speed of a car that reacts after rt then brakes at a (from x0, speed v) */
const braking = (x0, v, rt, a) => {
  const tb = rt + v / a, dist = stopD(v, rt, a);
  return {
    tb, dist,
    x: (t) => (t <= rt ? x0 + v * t : t >= tb ? x0 + dist : x0 + v * rt + v * (t - rt) - a * (t - rt) ** 2 / 2),
    v: (t) => (t <= rt ? v : Math.max(0, v - a * (t - rt))),
  };
};
/* from rest with acceleration a up to vmax */
const accel = (x0, v0, a, vmax) => {
  const ta = Math.max(0, (vmax - v0) / a), xa = v0 * ta + a * ta * ta / 2;
  return { x: (t) => (t < ta ? x0 + v0 * t + a * t * t / 2 : x0 + xa + vmax * (t - ta)), v: (t) => Math.min(vmax, v0 + a * t),
    tAt: (d) => { /* time to cover distance d */ if (d <= xa) return a ? (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a : d / v0; return ta + (d - xa) / vmax; } };
};
const surfK = (wet) => (wet ? "surf_wet" : "surf_dry");

/* ---------------- scene renderer ---------------- */
const COLS = { you: "#2563eb", other: "#f59e0b", grey: "#94a3b8", white: "#e2e8f0", red: "#dc2626" };
function scene(c, sc) {
  const px = sc.px || 11, [cx, cy] = sc.cam, X = (x) => 260 + (x - cx) * px, Y = (y) => 150 + (y - cy) * px;
  const night = !!sc.night;
  c.fillStyle = night ? "#06120a" : "#4d7c34"; c.fillRect(0, 0, W, H);
  const x0 = cx - 260 / px - 5, x1 = cx + (W - 260) / px + 5;
  const road = sc.road || { type: "two" };
  const tar = night ? "#17181b" : "#3b3d40", line = night ? "#9ca3af" : "#f2f2f2";
  const band = (ya, yb) => { c.fillStyle = tar; c.fillRect(0, Y(ya), W, (yb - ya) * px); };
  const dash = (y, solid) => { c.fillStyle = line; if (solid) c.fillRect(0, Y(y) - 1.5, W, 3); else for (let m = Math.floor(x0 / 6) * 6; m < x1; m += 6) c.fillRect(X(m), Y(y) - 1.5, 3 * px / 2, 3); };
  /* side/cross roads under the main road */
  (sc.deco || []).forEach((d) => {
    if (d.k === "cross" || d.k === "side") {
      c.fillStyle = tar; const w = (d.w || 7) * px;
      if (d.k === "cross") c.fillRect(X(d.x), 0, w, H);
      else if (d.dir < 0) c.fillRect(X(d.x), 0, w, Y(-3.5)); else c.fillRect(X(d.x), Y(3.5), w, H - Y(3.5));
    }
    if (d.k === "rail") { c.fillStyle = "#6b5b4b"; c.fillRect(X(d.x) - 1.6 * px, 0, 3.2 * px, H); }
  });
  if (road.type === "two") { band(-3.5, 3.5); dash(-3.4, true); dash(3.4, true); dash(0, road.solid); }
  else if (road.type === "dual") { band(-3.5, 3.5); dash(-3.4, true); dash(3.4, true); dash(0, false); c.fillStyle = "#5f6b52"; c.fillRect(0, Y(3.9), W, 0.8 * px); }
  else if (road.type === "merge") {
    band(-3.5, 3.5); dash(-3.4, false); dash(3.4, true); dash(0, false);
    /* slip lane y −7 … −3.5 that tapers to nothing at road.end */
    c.fillStyle = tar; c.beginPath(); c.moveTo(X(x0), Y(-7)); c.lineTo(X(road.end - 60), Y(-7)); c.lineTo(X(road.end), Y(-3.5)); c.lineTo(X(x0), Y(-3.5)); c.fill();
    c.strokeStyle = line; c.lineWidth = 3; c.beginPath(); c.moveTo(X(x0), Y(-6.9)); c.lineTo(X(road.end - 60), Y(-6.9)); c.lineTo(X(road.end), Y(-3.5)); c.stroke();
  }
  (sc.deco || []).forEach((d) => {
    if (d.k === "rail") { c.fillStyle = "#9ca3af"; [-0.75, 0.75].forEach((o) => c.fillRect(X(d.x + o) - 1, 0, 3, H)); c.fillStyle = "#5b4636"; for (let y = 0; y < H; y += 10) c.fillRect(X(d.x) - 1.3 * px, y, 2.6 * px, 3);
      c.fillStyle = "#fde047"; c.fillRect(X(d.x - 5), Y(-3.5), 3, 7 * px); }
    if (d.k === "stop") { c.fillStyle = line; c.fillRect(X(d.x) - 2, Y(d.y0 ?? -3.5), 4, ((d.y1 ?? 0) - (d.y0 ?? -3.5)) * px); }
    if (d.k === "zebra") for (let y = -3.2; y < 3.2; y += 0.9) { c.fillStyle = line; c.fillRect(X(d.x), Y(y), 3 * px, 0.5 * px); }
    if (d.k === "posts") for (let m = Math.floor(x0 / d.every) * d.every; m < x1; m += d.every) { c.fillStyle = "#e2e8f0"; c.fillRect(X(m), Y(-4.6), 2, 9); }
    if (d.k === "marker") { c.fillStyle = d.col || "#fde047"; c.fillRect(X(d.x) - 1, Y(-4.9), 3, 1.2 * px); D.text(c, d.t, X(d.x), Y(-5.8), 11, d.col || "#fde047"); }
    if (d.k === "signal") { const sx = X(d.x) - 6, sy = Y(-5.2); c.fillStyle = "#111827"; D.rr(c, sx - 8, sy - 24, 16, 40, 4); c.fill();
      [["red", -16], ["amber", -4], ["green", 8]].forEach(([k, o]) => { c.fillStyle = d.state === k ? { red: "#ef4444", amber: "#f59e0b", green: "#22c55e" }[k] : "#1f2937"; c.beginPath(); c.arc(sx, sy + o, 5, 0, 7); c.fill(); }); }
    if (d.k === "parked") d.xs.forEach((x, i) => drawActor(c, X, Y, px, { k: "car", x, y: d.y, a: 0, col: ["#94a3b8", "#64748b", "#cbd5e1", "#a8a29e"][i % 4] }));
    if (d.k === "school") D.text(c, "🏫", X(d.x), Y(-7), 22);
  });
  (sc.actors || []).forEach((a) => { if (a.x > x0 - 30 && a.x < x1 + 30) drawActor(c, X, Y, px, a); });
  if (sc.crest != null) { /* everything past the crest is hidden by the hill */
    const xc = X(sc.crest); if (xc < W) { const gr = c.createLinearGradient(xc, 0, xc + 30, 0); gr.addColorStop(0, "rgba(77,124,52,0)"); gr.addColorStop(1, "rgba(61,99,41,1)"); c.fillStyle = gr; c.fillRect(xc, 0, W - xc, H); D.text(c, "⛰", Math.min(W - 30, xc + 40), Y(-6), 22); } }
  if (sc.fog != null) { /* visibility in metres from your car */
    const fx0 = X(sc.fogFrom), fv = sc.fog * px, gr = c.createLinearGradient(fx0, 0, fx0 + fv, 0); gr.addColorStop(0, "rgba(203,213,225,0.15)"); gr.addColorStop(0.75, "rgba(203,213,225,0.75)"); gr.addColorStop(1, "rgba(203,213,225,0.97)");
    c.fillStyle = gr; c.fillRect(fx0, 0, W, H); c.fillStyle = "rgba(203,213,225,0.97)"; c.fillRect(fx0 + fv, 0, W, H); c.fillStyle = "rgba(203,213,225,0.15)"; c.fillRect(0, 0, fx0, H); }
  if (night) { const bx = X(sc.beamFrom), bl = sc.beam * px, y0 = Y(sc.beamY || -1.75); c.fillStyle = "rgba(2,6,23,0.55)"; c.fillRect(0, 0, W, H);
    const gr = c.createLinearGradient(bx, 0, bx + bl, 0); gr.addColorStop(0, "rgba(255,244,214,.38)"); gr.addColorStop(1, "rgba(255,244,214,0)"); c.fillStyle = gr; c.beginPath(); c.moveTo(bx, y0 - 6); c.lineTo(bx + bl, y0 - 3.2 * px); c.lineTo(bx + bl, y0 + 3.2 * px); c.lineTo(bx, y0 + 6); c.fill(); }
  if (sc.ring) { c.strokeStyle = "#ef4444"; c.lineWidth = 3; c.beginPath(); c.arc(X(sc.ring[0]), Y(sc.ring[1]), 30, 0, 7); c.stroke(); }
  if (sc.label) sc.label.forEach(([x, y, t, col]) => D.text(c, t, X(x), Y(y), 12, col || "#fff", "center", 700));
  return { X, Y };
}
function drawActor(c, X, Y, px, a) {
  const len = a.len || ({ car: CL, lorry: 10, bus: 11, bike: 2, cycle: 1.8, ped: 0.5, cow: 2.2, train: 60, tractor: 4 })[a.k], wid = a.wid || ({ car: CW, lorry: 2.5, bus: 2.5, bike: 0.8, cycle: 0.6, ped: 0.5, cow: 0.8, train: 3, tractor: 2 })[a.k];
  const sx = X(a.x), sy = Y(a.y);
  c.save(); c.translate(sx, sy); c.rotate(a.a || 0);
  if (a.k === "car") { c.rotate(Math.PI / 2); D.carTop(c, 0, 0, wid * px, len * px, a.col || COLS.other, { brake: a.brake, ind: a.ind, on: a.on }); c.restore(); return; }
  c.fillStyle = "rgba(0,0,0,.28)"; c.fillRect(-len * px / 2 + 2, -wid * px / 2 + 2, len * px, wid * px);
  if (a.k === "lorry" || a.k === "bus" || a.k === "tractor" || a.k === "train") {
    const body = { lorry: "#a16207", bus: "#dc2626", tractor: "#16a34a", train: "#1d4ed8" }[a.k];
    c.fillStyle = body; D.rr(c, -len * px / 2, -wid * px / 2, len * px * (a.k === "lorry" ? 0.78 : 1), wid * px, 3); c.fill();
    if (a.k === "lorry") { c.fillStyle = "#e2e8f0"; D.rr(c, len * px * 0.3, -wid * px / 2 + 1, len * px * 0.2, wid * px - 2, 3); c.fill(); }
    if (a.k === "bus" || a.k === "train") { c.fillStyle = "rgba(255,255,255,.55)"; for (let k = -len / 2 + 1; k < len / 2 - 1.5; k += 2.2) c.fillRect(k * px, -wid * px / 2 + 2, 1.4 * px, 2); }
    if (a.brake) { c.fillStyle = "#ff3030"; c.fillRect(-len * px / 2 - 2, -wid * px / 2, 3, wid * px); }
  } else if (a.k === "bike" || a.k === "cycle") {
    c.fillStyle = "#111"; c.fillRect(-len * px / 2, -1.5, len * px, 3); c.fillStyle = a.col || (a.k === "bike" ? "#7c3aed" : "#0ea5e9"); c.beginPath(); c.arc(0, 0, wid * px * 0.65, 0, 7); c.fill();
    c.fillStyle = "#111827"; c.beginPath(); c.arc(1, 0, wid * px * 0.38, 0, 7); c.fill();
  } else if (a.k === "ped") { c.rotate(-(a.a || 0)); D.ped(c, 0, -6, 0.55, a.col || "#f43f5e", { walk: a.walk, dark: a.dark }); }
  else if (a.k === "cow") { c.rotate(-(a.a || 0)); D.cow(c, 0, 0, 0.55, a.face || 1); }
  c.restore();
}
/* the bend renderer: road is a circle of radius R centred at (0, R) — you start at (0,0) heading +x */
function bendScene(c, s) {
  const px = s.px, X = (x) => 320 + (x - s.cam[0]) * px, Y = (y) => 210 + (y - s.cam[1]) * px;
  c.fillStyle = "#4d7c34"; c.fillRect(0, 0, W, H);
  const ox = X(0), oy = Y(s.R);
  c.strokeStyle = "#a8a29e"; c.lineWidth = 8.6 * px; c.beginPath(); c.arc(ox, oy, s.R * px, 0, 7); c.stroke();
  c.strokeStyle = s.wet ? "#2f3237" : "#3b3d40"; c.lineWidth = 7 * px; c.beginPath(); c.arc(ox, oy, s.R * px, 0, 7); c.stroke();
  c.strokeStyle = "#f2f2f2"; c.lineWidth = 2; [-3.4, 3.4].forEach((o) => { c.beginPath(); c.arc(ox, oy, (s.R + o) * px, 0, 7); c.stroke(); });
  c.setLineDash([3 * px, 3 * px]); c.beginPath(); c.arc(ox, oy, s.R * px, 0, 7); c.stroke(); c.setLineDash([]);
  if (s.wet) { c.fillStyle = "rgba(125,211,252,.12)"; c.fillRect(0, 0, W, H); }
  /* faint path the car needed */
  c.save(); c.translate(X(s.car[0]), Y(s.car[1])); c.rotate(s.car[2] + Math.PI / 2); D.carTop(c, 0, 0, CW * px, CL * px, s.off ? COLS.red : COLS.you, { brake: s.brake }); c.restore();
  if (s.ring) { c.strokeStyle = "#ef4444"; c.lineWidth = 3; c.beginPath(); c.arc(X(s.car[0]), Y(s.car[1]), 30, 0, 7); c.stroke(); }
}
/* side view crash bay (seat belt) */
function crashScene(c, s) {
  c.fillStyle = "#0f172a"; c.fillRect(0, 0, W, H); c.fillStyle = "#334155"; c.fillRect(0, 300, W, 100);
  const px = 70, X = (x) => 470 + x * px;   // x in metres, barrier at 0
  c.fillStyle = "#64748b"; c.fillRect(X(0), 120, 40, 180); c.fillStyle = "#fde047"; for (let y = 120; y < 300; y += 30) c.fillRect(X(0), y, 40, 14);
  /* car body: front at s.car (≤0), crushed by s.crush */
  const front = X(s.car), backX = X(s.car - 4.2 + s.crush);
  c.fillStyle = "#2563eb"; D.rr(c, backX, 210, front - backX, 60, 10); c.fill(); D.rr(c, backX + 60, 165, (front - backX) * 0.45, 50, 12); c.fill();
  c.fillStyle = "#111"; [backX + 50, front - 55].forEach((x) => { c.beginPath(); c.arc(x, 275, 22, 0, 7); c.fill(); });
  c.fillStyle = "#1b2733"; D.rr(c, backX + 70, 172, (front - backX) * 0.38, 34, 8); c.fill();
  /* occupant: torso + head; position along x = s.body */
  const bx = X(s.body - 2.1);
  c.fillStyle = "#f59e0b"; D.rr(c, bx - 14, 185, 28, 40, 8); c.fill(); c.fillStyle = "#c68642"; c.beginPath(); c.arc(bx + 4, 172, 11, 0, 7); c.fill();
  if (s.belt) { c.strokeStyle = "#111827"; c.lineWidth = 4; c.beginPath(); c.moveTo(bx - 12, 186); c.lineTo(bx + 12, 222); c.stroke(); }
  if (s.flash) { c.fillStyle = `rgba(239,68,68,${s.flash})`; c.fillRect(0, 0, W, H); }
  D.text(c, `${fx(s.v * 3.6, 0)} km/h`, 120, 120, 26, "#f8fafc", "center", 800);
}

/* ---------------- the engine ---------------- */
const SIM = [];
function defSim(id, spec) {
  SIM.push(id);
  def(id, {
    icon: spec.icon, unit: "", sim: true,
    preview(g) { const cur = spec.gen(); g.draw((c) => spec.draw(c, cur, spec.idle(cur), null)); },
    start(g) {
      const R = spec.rounds || 6; let i = 0, ok = 0, cur = null, anim = null;
      const round = () => {
        if (i >= R) return g.end(ok, e(u("gmOutOf", { n: ok, t: R })));
        i++; cur = spec.gen(); anim = null; g.hud(`${e(u("gmRound"))} <b>${i}/${R}</b>`);
        g.btns(spec.opts(cur), (k) => choose(k), spec.opts(cur).length > 2 ? "row" : "two");
        const [qa, qb] = spec.q(cur); g.lay.insertAdjacentHTML("afterbegin", `<p class="gsimq"><b>${I18n.esc(qa)}</b><br>${I18n.esc(qb)}</p>`);
      };
      const choose = (k) => {
        g.lay.innerHTML = "";
        const run = spec.run(cur, k), good = spec.right(cur, k); if (good) ok++;
        anim = { k, run, t: 0, speed: Math.max(1, run.tEnd / (spec.maxShow || 6)), good, done: false };
      };
      const report = () => {
        const { k, good } = anim, [hk, ho] = spec.head(cur, k);
        const rows = spec.rows(cur, k).map(([lk, lo, v, cls]) => `<tr class="${cls || ""}"><th>${e(u(lk, lo))}</th><td>${v}</td></tr>`).join("");
        g.panel(`<div class="govr ${good ? "good" : "bad"}"><b class="govh">${good ? "✓" : "✗"} ${I18n.esc(u(hk, ho))}</b><table>${rows}</table>${spec.tip ? `<p class="govt">${e(u(spec.tip(cur, k)))}</p>` : ""}<div class="gbtns"><button type="button" class="gbtn" data-n>${t1("gmNext")} ›</button></div></div>`);
        g.lay.querySelector("[data-n]").addEventListener("click", (ev) => { ev.stopPropagation(); round(); });
      };
      g.loop((dt) => {
        if (anim && !anim.done) { anim.t = Math.min(anim.run.tEnd, anim.t + dt * anim.speed); if (anim.t >= anim.run.tEnd) { anim.done = true; g.after(900, report); } }
        const st = anim ? anim.run.at(anim.t) : spec.idle(cur);
        g.draw((c) => {
          spec.draw(c, cur, st, anim);
          /* top strip: the question before choosing, live numbers while it plays */
          c.fillStyle = "rgba(2,6,23,.62)"; D.rr(c, 24, 8, 592, 52, 10); c.fill();
          if (!anim) { const [a, b] = spec.q(cur); D.text(c, a, W / 2, 24, 14, "#fff", "center", 700); D.text(c, b, W / 2, 46, 14, "#fde047", "center", 600); }
          else { D.text(c, `t = ${fx(anim.t)} s${st.live ? " · " + st.live : ""}`, W / 2, 34, 14, "#e2e8f0", "center", 600); if (anim.speed > 1.05) D.text(c, `×${fx(anim.speed)}`, 606, 22, 11, "#94a3b8", "right"); }
        });
      });
      round();
    },
  });
}
const row = (k, v, cls, o) => [k, o, v, cls];
const mRow = (margin, unit = "m") => row(margin >= 0 ? "gmOvSpare" : "gmOvShortBy", `<b>${fx(Math.abs(margin), unit === "s" ? 1 : 0)} ${unit}</b>`, margin >= 0 ? "ok" : "no");
const stopRows = (v, rt, a) => [
  row("sRSpeed", `<b>${kmh(v)} km/h</b> = ${fx(v)} m/s`),
  row("sRReact", `${fx(v)} × ${rt} = <b>${fx(v * rt, 1)} m</b>`, "", { rt }),
  row("sRBrake", `${fx(v)}² ÷ (2 × ${a}) = <b>${fx(v * v / (2 * a), 1)} m</b>`),
  row("sRStop", `<b>${fx(stopD(v, rt, a), 1)} m</b>`),
];
/* straight-road camera that follows x */
const camAt = (x) => [x + 14, 0];

/* 1 ─ amber light: stop or go? */
defSim("amber", {
  icon: "🟡",
  gen() { for (;;) { const v = ms(ri(40, 70)), d = ri(12, 60), wet = Math.random() < 0.3, a = wet ? A_WET : 6, S = stopD(v, RT, a), tc = (d + 14 + CL) / v, canStop = S <= d, canGo = tc <= 3.0;
    if (canStop !== canGo || (canStop && canGo && S < d - 8)) return { v, d, wet, a, S, tc, stop: canStop }; } },
  opts: () => [`🛑 ${t1("sOpStop")}`, `➡ ${t1("sOpGo")}`],
  right: (c, k) => (k === 0) === c.stop,
  q: (c) => [t1("sQAmber1", { v: kmh(c.v), d: c.d }), `${t1(surfK(c.wet))} · ${t1("sQAmber2")}`],
  idle: (c) => ({ you: -c.d, light: "amber", brake: false }),
  run(c, k) {
    const b = braking(-c.d, c.v, RT, c.a), stopT = b.tb, tEnd = k === 0 ? Math.max(stopT, 3.2) + 0.6 : Math.max(c.tc, 3) + 1;
    return { tEnd, at: (t) => { const you = k === 0 ? b.x(t) : -c.d + c.v * t, light = t < 3 ? "amber" : "red";
      const bad = (k === 0 && you > 0.3 && t >= stopT) || (k === 1 && t >= 3 && you - CL < 14 && you > 0);
      return { you, light, brake: k === 0 && t > RT && t < stopT, bad, live: `${kmh(k === 0 ? b.v(t) : c.v)} km/h · ${t1("sLToLine", { m: fx(Math.max(-you, 0), 1) })}` }; } };
  },
  draw(c, cur, s) {
    scene(c, { cam: camAt(s.you), road: { type: "two" }, deco: [{ k: "cross", x: 0, w: 14 }, { k: "stop", x: 0 }, { k: "signal", x: 0, state: s.light }],
      actors: [{ k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you, brake: s.brake }, { k: "car", x: 7, y: -10 + (s.light === "red" ? 0 : 0), a: Math.PI / 2, col: COLS.grey }], ring: s.bad ? [s.you, -1.75] : null });
  },
  head(c, k) { if (k === 0) return c.stop ? ["sHStopped", { m: fx(c.d - c.S, 1) }] : ["sHPastLine", { m: fx(c.S - c.d, 1) }]; return c.tc <= 3 ? ["sHClearedAmber", { s: fx(3 - c.tc, 1) }] : ["sHRedInside", { s: fx(c.tc - 3, 1) }]; },
  rows: (c) => [...stopRows(c.v, RT, c.a), row("sRToLine", `<b>${c.d} m</b>`), mRow(c.d - c.S), row("sRClearAmber", `(${c.d} + 14 + 4.5) ÷ ${fx(c.v)} = <b>${fx(c.tc, 1)} s</b> / 3 s`, c.tc <= 3 ? "ok" : "no")],
  tip: () => "sTAmber",
});

/* 2 ─ following gap when the car ahead brakes hard */
defSim("gapkeep", {
  icon: "📏",
  gen() { for (;;) { const v = ms(ri(50, 90)), gs = pick([0.7, 0.9, 1.1, 1.3, 1.6, 2, 2.5]), wet = Math.random() < 0.35, a = wet ? A_WET : A_DRY, gm = v * gs, fin = gm - v * RT;
    if (Math.abs(fin - 2) > 2.5) return { v, gs, gm, wet, a, safe: fin > 2 }; } },
  opts: () => [`↔ ${t1("sOpKeep")}`, `⬅ ${t1("sOpBack")}`],
  right: (c, k) => (k === 0) === c.safe,
  q: (c) => [t1("sQGap1", { v: kmh(c.v), s: c.gs, m: Math.round(c.gm) }), `${t1(surfK(c.wet))} · ${t1("sQGap2")}`],
  idle: (c) => ({ you: 0, lead: c.gm + CL, yb: false, lb: false }),
  run(c, k) {
    const gap = k === 0 ? c.gm : c.v * 3, t0 = 0.6, lead = braking(gap + CL, c.v, t0, c.a), you = braking(0, c.v, t0 + RT, c.a);
    let hit = null; for (let t = 0; t < you.tb; t += 0.005) if (lead.x(t) - CL - you.x(t) <= 0) { hit = t; break; }
    const tEnd = hit != null ? hit + 0.4 : you.tb + 0.6;
    return { tEnd, hit, gap, at: (t) => { const tt = hit != null ? Math.min(t, hit) : t, yx = you.x(tt), lx = lead.x(tt);
      return { you: yx, lead: lx, yb: tt > t0 + RT, lb: tt > t0, bad: hit != null && t >= hit, live: `${t1("gmGap")} ${fx(Math.max(0, lx - CL - yx), 1)} m · ${kmh(you.v(tt))} km/h` }; } };
  },
  draw(c, cur, s) {
    scene(c, { cam: camAt(s.you + 6), road: { type: "two" }, deco: [{ k: "posts", every: 10 }],
      actors: [{ k: "car", x: s.lead - CL / 2, y: -1.75, col: COLS.white, brake: s.lb }, { k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you, brake: s.yb }], ring: s.bad ? [s.you, -1.75] : null });
  },
  head(c, k) { const gap = k === 0 ? c.gm : c.v * 3, fin = gap - c.v * RT; if (fin > 0) return ["sHStoppedBehind", { m: fx(fin, 1) }]; const vi = Math.sqrt(Math.max(0, 2 * c.a * (-fin))); return ["sHRearEnd", { v: kmh(Math.min(c.v, vi)) }]; },
  rows(c, k) { const gap = k === 0 ? c.gm : c.v * 3, fin = gap - c.v * RT;
    return [row("sRSpeed", `<b>${kmh(c.v)} km/h</b> = ${fx(c.v)} m/s`), row("gmGap", `${fx(gap / c.v, 1)} s × ${fx(c.v)} = <b>${fx(gap, 1)} m</b>`),
      row("sRLostReact", `${fx(c.v)} × ${RT} = <b>${fx(c.v * RT, 1)} m</b>`, "", { rt: RT }), row("sRSameBrake", `${fx(c.v)}² ÷ (2 × ${c.a}) = ${fx(c.v * c.v / 2 / c.a, 1)} m`),
      row("sRFinalGap", `${fx(gap, 1)} − ${fx(c.v * RT, 1)} = <b>${fx(fin, 1)} m</b>`, fin > 0 ? "ok" : "no")]; },
  tip: () => "sTGap",
});

/* 3 ─ speed for a bend */
defSim("bendspeed", {
  icon: "↪️",
  gen() { const R = pick([30, 45, 60, 80, 110, 150]), wet = Math.random() < 0.4, mu = wet ? 0.45 : 0.75, vmax = Math.sqrt(mu * G * R), round5 = (x) => Math.max(15, Math.round(x * 3.6 / 5) * 5);
    const safe = round5(vmax * rnd(0.72, 0.85)); let s2 = round5(vmax * rnd(1.12, 1.25)); if (s2 <= safe) s2 = safe + 10; let s3 = round5(vmax * rnd(1.4, 1.6)); if (s3 <= s2) s3 = s2 + 10;
    const opts = [safe, s2, s3].sort(() => Math.random() - 0.5); return { R, wet, mu, vmax, opts, ans: opts.indexOf(safe) }; },
  opts: (c) => c.opts.map((k) => `${k} km/h`),
  right: (c, k) => k === c.ans,
  q: (c) => [t1("sQBend1", { r: c.R }), `${t1(surfK(c.wet))} · ${t1("sQBend2")}`],
  idle: (c) => ({ car: [0, 0, 0], cam: [0, 0], off: false }),
  run(c, k) {
    const v = ms(c.opts[k]), need = v * v / c.R, have = c.mu * G, slide = need > have;
    /* along the curve the car's distance s; if grip runs out it drifts outward with the surplus acceleration */
    let tOff = null; const drift = (t) => (slide ? 0.5 * (need - have) * t * t : 0);
    if (slide) tOff = Math.sqrt(2 * 3.4 / (need - have));
    const tEnd = slide ? tOff + 0.5 : Math.min(1.4 * Math.PI * c.R / 2 / v, 9);
    return { tEnd, at: (t) => { const s = v * t, th = s / c.R, r = c.R + drift(t);   // outward = away from the centre (centre at (0,R)) → smaller y-distance
      const x = Math.sin(th) * r, y = c.R - Math.cos(th) * r, off = slide && t >= tOff;
      return { car: [x, y, th], cam: [x + Math.cos(th) * 12, y + Math.sin(th) * 12], off, ring: off, live: `${t1("sLLat", { a: fx(Math.min(need, have), 1), h: fx(have, 1) })}` }; } };
  },
  draw(c, cur, s) { const px = clamp(300 / (cur.R * 0.9), 2.5, 8); bendScene(c, { R: cur.R, wet: cur.wet, px, cam: s.cam, car: s.car, off: s.off, ring: s.ring }); },
  head(c, k) { const v = ms(c.opts[k]); return v * v / c.R > c.mu * G ? ["sHSkid", {}] : k === c.ans ? ["sHBendOk", {}] : ["sHBendSlow", {}]; },
  rows(c, k) { const v = ms(c.opts[k]), need = v * v / c.R, have = c.mu * G;
    return [row("sRSpeed", `<b>${c.opts[k]} km/h</b> = ${fx(v)} m/s`), row("sRLatNeed", `${fx(v)}² ÷ ${c.R} = <b>${fx(need, 2)} m/s²</b>`), row("sRLatHave", `${c.mu} × 9.81 = <b>${fx(have, 2)} m/s²</b>`, need <= have ? "ok" : "no"),
      row("sRVmax", `√(${c.mu} × 9.81 × ${c.R}) = <b>${kmh(c.vmax)} km/h</b>`)]; },
  tip: () => "sTBend",
});

/* 4 ─ school zone: pick your speed past parked cars */
const speedPick = (o) => {
  const { vmin, vmax, dmin, dmax, wet, rt } = o;
  for (;;) { const d = ri(dmin, dmax), a = wet ? A_WET : A_DRY, cands = [...new Set([...Array(9).keys()].map((i) => vmin + i * 5).filter((k) => k <= vmax))];
    const safeMax = Math.max(...cands.filter((k) => stopD(ms(k), rt, a) <= d - 1)); if (!isFinite(safeMax)) continue;
    const pool = cands.filter((k) => k !== safeMax), others = pool.sort(() => Math.random() - 0.5).slice(0, 2).sort((x, y) => x - y);
    if (others.length < 2 || !others.some((k) => k > safeMax)) continue;
    const opts = [safeMax, ...others].sort((x, y) => x - y); return { d, a, wet, rt, opts, ans: opts.indexOf(safeMax) };
  }
};
const speedRun = (c, k, extra) => { const v = ms(c.opts[k]), b = braking(-c.d, v, c.rt, c.a), S = b.dist, hit = S > c.d;
  let tHit = null; if (hit) for (let t = 0; t < b.tb; t += 0.005) if (b.x(t) >= 0) { tHit = t; break; }
  const tEnd = hit ? tHit + 0.5 : b.tb + 0.6;
  return { v, S, hit, tEnd, at: (t) => { const tt = hit ? Math.min(t, tHit) : t; return { you: b.x(tt), brake: tt > c.rt, bad: hit && t >= tHit, live: `${kmh(b.v(tt))} km/h · ${t1("sLToHaz", { m: fx(Math.max(0, -b.x(tt)), 1) })}`, ...(extra ? extra(tt) : {}) }; } };
};
const speedHead = (c, k) => { const v = ms(c.opts[k]), S = stopD(v, c.rt, c.a); if (S > c.d) { const vb = v - c.a * 0; const rem = S - c.d, vi = Math.sqrt(Math.max(0, 2 * c.a * rem)); return ["sHHit", { v: kmh(Math.min(v, vi)) }]; }
  return k === c.ans ? ["sHStopped", { m: fx(c.d - S, 1) }] : ["sHTooSlow", { m: fx(c.d - S, 1) }]; };
const speedRows = (c, k) => { const v = ms(c.opts[k]), S = stopD(v, c.rt, c.a); return [...stopRows(v, c.rt, c.a), row("sRSeen", `<b>${c.d} m</b>`), mRow(c.d - S)]; };
defSim("schoolzone", {
  icon: "🏫",
  gen: () => speedPick({ vmin: 20, vmax: 60, dmin: 14, dmax: 30, wet: Math.random() < 0.3, rt: RT }),
  opts: (c) => c.opts.map((k) => `${k} km/h`), right: (c, k) => k === c.ans,
  q: (c) => [t1("sQSchool1"), `${t1(surfK(c.wet))} · ${t1("sQFastest")}`],
  idle: (c) => ({ you: -c.d - 30, kid: false }),
  run: (c, k) => speedRun(c, k, (t) => ({ kid: true })),
  draw(c, cur, s) {
    scene(c, { cam: camAt(s.you), road: { type: "two" }, deco: [{ k: "parked", xs: [-60, -52, -44, -36, -28, -20, -12, -4, 6, 14], y: -4.6 }, { k: "school", x: -10 }],
      actors: [...(s.kid ? [{ k: "ped", x: 0, y: -2.6, col: "#f43f5e", walk: 1 }] : []), { k: "car", x: s.you - CL / 2, y: -1.4, col: s.bad ? COLS.red : COLS.you, brake: s.brake }], ring: s.bad ? [0, -2] : null });
  },
  head: speedHead, rows: speedRows, tip: () => "sTSchool",
});

/* 5 ─ fog: pick your speed for what you can see */
defSim("fogspeed", {
  icon: "🌫️",
  gen: () => speedPick({ vmin: 20, vmax: 80, dmin: 30, dmax: 75, wet: Math.random() < 0.5, rt: 1.5 }),
  opts: (c) => c.opts.map((k) => `${k} km/h`), right: (c, k) => k === c.ans,
  q: (c) => [t1("sQFog1", { m: c.d }), `${t1(surfK(c.wet))} · ${t1("sQFastest")}`],
  idle: (c) => ({ you: -c.d - 4 }),
  run: (c, k) => speedRun(c, k),
  draw(c, cur, s) { scene(c, { cam: camAt(s.you), road: { type: "two" }, deco: [{ k: "posts", every: 10 }], fog: cur.d, fogFrom: s.you,
    actors: [{ k: "lorry", x: 5, y: -1.75, brake: true }, { k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you, brake: s.brake }], ring: s.bad ? [0, -1.75] : null }); },
  head: speedHead, rows: speedRows, tip: () => "sTFog",
});

/* 6 ─ night: dark-clothed pedestrian at the edge of dipped beams */
defSim("nightdip", {
  icon: "🌙",
  gen: () => speedPick({ vmin: 30, vmax: 80, dmin: 28, dmax: 50, wet: Math.random() < 0.3, rt: 1.5 }),
  opts: (c) => c.opts.map((k) => `${k} km/h`), right: (c, k) => k === c.ans,
  q: (c) => [t1("sQNight1", { m: c.d }), `${t1(surfK(c.wet))} · ${t1("sQFastest")}`],
  idle: (c) => ({ you: -c.d - 4 }),
  run: (c, k) => speedRun(c, k),
  draw(c, cur, s) { scene(c, { cam: camAt(s.you), road: { type: "two" }, night: true, beam: cur.d + 6, beamFrom: s.you, beamY: -1.75,
    actors: [{ k: "ped", x: 0.5, y: -2.2, col: "#1f2937", dark: true, walk: 2 }, { k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you, brake: s.brake }], ring: s.bad ? [0, -2] : null }); },
  head: speedHead, rows: speedRows, tip: () => "sTNight",
});

/* 7 ─ level crossing: cross or wait */
defSim("levelx", {
  icon: "🚆",
  gen() { for (;;) { const vt = ms(ri(60, 110)), Dt = ri(120, 900), Ta = Dt / vt, dist = 5 + 3.2 + CL + 1, tc = Math.sqrt(2 * dist / 1.5), margin = Ta - tc;
    if (Math.abs(margin - 15) > 4) return { vt, Dt, Ta, tc, dist, margin, go: margin >= 15 }; } },
  opts: () => [`➡ ${t1("sOpCross")}`, `⏸ ${t1("gmWaitBtn")}`],
  right: (c, k) => k === 1 || c.go,   /* waiting for a train is never wrong */
  q: (c) => [t1("sQRail1", { v: kmh(c.vt), m: c.Dt }), t1("sQRail2")],
  idle: (c) => ({ you: -5, train: c.Dt }),
  run(c, k) { const a = accel(-5, 0, 1.5, ms(25)); const tEnd = k === 0 ? Math.max(c.tc + 1.5, Math.min(c.Ta + 3, c.tc + 6)) : c.Ta + 4;
    return { tEnd, at: (t) => { const you = k === 0 ? a.x(t) : -5, train = c.Dt - c.vt * t;
      return { you, train, live: `${t1("sLTrain", { s: fx(Math.max(0, train / c.vt), 1) })}`, bad: k === 0 && !c.go && Math.abs(train) < 40 && you - CL < 3 && you > -2 }; } }; },
  draw(c, cur, s) {
    scene(c, { cam: [3, 0], road: { type: "two" }, deco: [{ k: "rail", x: 3 }, { k: "stop", x: -2 }],
      actors: [{ k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you }, { k: "train", x: 3, y: -s.train - 34, a: Math.PI / 2 }],
      label: s.train > 8 ? [[3, -8.2, `▲ 🚆 ${Math.round(s.train)} m · ${kmh(cur.vt)} km/h`, "#fde047"]] : null });
  },
  head(c, k) { return k === 0 ? (c.go ? ["sHRailOk", { s: fx(c.margin, 1) }] : ["sHRailClose", { s: fx(c.margin, 1) }]) : (c.go ? ["sHWaitRoom", { s: fx(c.margin, 1) }] : ["sHWaitRight", {}]); },
  rows: (c) => [row("sRTrain", `${fx(c.Dt, 0)} ÷ ${fx(c.vt)} = <b>${fx(c.Ta, 1)} s</b>`, "", {}), row("sRCrossT", `√(2 × ${fx(c.dist, 1)} ÷ 1.5) = <b>${fx(c.tc, 1)} s</b>`), mRow(c.margin, "s"), row("sRRailRule", `<b>15 s</b>`)],
  tip: () => "sTRail",
});

/* 8 ─ turning right across oncoming traffic */
defSim("rightturn", {
  icon: "↱",
  gen() { for (;;) { const v = ms(ri(40, 70)), D0 = ri(40, 140), Ta = D0 / v, path = 14, tc = Math.sqrt(2 * path / 2.5), margin = Ta - tc; if (Math.abs(margin - 2) > 1) return { v, D0, Ta, tc, margin, go: margin >= 2 }; } },
  opts: () => [`↱ ${t1("sOpTurn")}`, `⏸ ${t1("gmWaitBtn")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQRight1", { v: kmh(c.v), m: c.D0 }), t1("sQRight2")],
  idle: (c) => ({ p: 0, onc: c.D0, ob: false }),
  run(c, k) {
    const turn = accel(0, 0, 2.5, ms(25)); const reach = 4; // you occupy the oncoming lane from p≈0.25 to p≈0.85 of the 14 m path
    const enterT = turn.tAt(14 * 0.25), leaveT = turn.tAt(14 * 0.85);
    let oncB = null, need = 0; const oncAt = (t) => c.D0 - c.v * t;
    if (k === 0 && !c.go) { /* oncoming driver reacts 1 s after you start, then brakes to stop short of your path */
      const dist = c.D0 - c.v * RT - reach; need = c.v * c.v / (2 * Math.max(1, dist)); oncB = braking(c.D0, c.v, RT, Math.min(need, 9)); }
    const tEnd = k === 0 ? leaveT + 1.5 : c.Ta + 2;
    return { tEnd, need, at: (t) => { const p = k === 0 ? Math.min(1, turn.x(t) / 14) : 0, onc = oncB ? c.D0 - (oncB.x(t) - c.D0) : oncAt(t);
      return { p, onc, ob: !!oncB && t > RT, bad: !!oncB && need > 7 && t > enterT, live: `${t1("sLOnc", { m: fx(Math.max(0, onc), 0) })}` }; } };
  },
  draw(c, cur, s) {
    /* path: from (−2, −1.0) quarter circle turning right into the side road going down at x = 4 */
    const th = s.p * Math.PI / 2, R0 = 5.5, px0 = -2 + Math.sin(th) * R0, py0 = -1.0 + (1 - Math.cos(th)) * R0 + (s.p > 0.98 ? (s.p - 0.98) * 50 : 0);
    scene(c, { cam: [4, 1], road: { type: "two" }, deco: [{ k: "side", x: 0.5, w: 7, dir: 1 }],
      actors: [{ k: "car", x: s.onc + CL / 2, y: 1.75, a: Math.PI, col: COLS.white, brake: s.ob }, { k: "car", x: px0, y: py0, a: th, col: s.bad ? COLS.red : COLS.you, ind: "r", on: true }], ring: s.bad ? [px0, py0] : null });
  },
  head(c, k) { if (k === 1) return c.go ? ["sHWaitRoom", { s: fx(c.margin, 1) }] : ["sHWaitRight", {}]; if (c.go) return ["sHTurnOk", { s: fx(c.margin, 1) }];
    const need = c.v * c.v / (2 * Math.max(1, c.D0 - c.v * RT - 4)); return (need > 8 ? ["sHCutIn", {}] : ["sHForced", { a: fx(need, 1), g: fx(need / G, 2) }]); },
  rows: (c) => [row("sRArrive", `${c.D0} ÷ ${fx(c.v)} = <b>${fx(c.Ta, 1)} s</b>`), row("sRTurnT", `√(2 × 14 ÷ 2.5) = <b>${fx(c.tc, 1)} s</b>`), mRow(c.margin, "s"), row("sRWant", `<b>2 s</b>`)],
  tip: () => "sTRight",
});

/* 9 ─ pulling out of a side road (left turn) into traffic from the right */
defSim("sideroad", {
  icon: "↰",
  gen() { for (;;) { const v = ms(ri(40, 70)), D0 = ri(35, 160), r = sideCalc(v, D0); if (Math.abs(r.need - 2) > 0.6) return { v, D0, ...r, go: r.need <= 2 }; } },
  opts: () => [`↰ ${t1("sOpPull")}`, `⏸ ${t1("gmWaitBtn")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQSide1", { v: kmh(c.v), m: c.D0 }), t1("sQSide2")],
  idle: (c) => ({ p: 0, yr: -3.25, other: c.D0 - 7.75 }),
  run(c, k) {
    const you = accel(0, 0, 2.5, ms(50)), nd = Math.min(c.need, 9), tEnd = k === 0 ? c.tIn + 4 : (c.D0 - 7.75) / c.v + 2;
    /* the other car's front starts at D0 − 7.75 so that at tIn the gap to your rear is exactly gapIn */
    const sim = []; let ox = c.D0 - 7.75, ov = c.v, yr = -3.25, ob = false;
    for (let t = 0; t <= tEnd + 0.02; t += 0.02) {
      if (k === 0 && t > c.tIn) { const vy = you.v(t); yr -= vy * 0.02; if (ov > vy) { ov = Math.max(vy, ov - nd * 0.02); ob = true; } else ob = false; }
      ox -= ov * 0.02; if (k === 0 && t > c.tIn) ox = Math.max(ox, yr + 0.4);
      sim.push([ox, yr, ob]);
    }
    return { tEnd, at: (t) => { const [o, yr2, b] = sim[Math.min(sim.length - 1, Math.round(t / 0.02))]; const p = k === 0 ? Math.min(1, t / c.tIn) : 0;
      return { p, yr: yr2, other: o, ob: b, bad: k === 0 && c.need > 7 && t > c.tIn, live: `${t1("sLOnc", { m: fx(Math.max(0, o - (k === 0 && t > c.tIn ? yr2 : 0)), 0) })}` }; } };
  },
  draw(c, cur, s) {
    /* from the side road (heading up, x = −1.25) a left turn of radius 4.25 into the near lane heading −x */
    const th = s.p * Math.PI / 2, R = 4.25; let x, y, a;
    if (s.p < 1) { x = -5.5 + R * Math.cos(th); y = 6 - R * Math.sin(th); a = -Math.PI / 2 - th; } else { x = s.yr - CL / 2; y = 1.75; a = -Math.PI; }
    if (s.p === 0) { x = -1.25; y = 6.5; a = -Math.PI / 2; }
    scene(c, { cam: [2, 1], road: { type: "two" }, deco: [{ k: "side", x: -3, w: 7, dir: 1 }, { k: "stop", x: -3, y0: 3.6, y1: 3.75 }],
      actors: [{ k: "car", x: s.other + CL / 2, y: 1.75, a: Math.PI, col: COLS.white, brake: s.ob }, { k: "car", x, y, a, col: s.bad ? COLS.red : COLS.you, ind: "l", on: true }], ring: s.bad ? [x, 1.75] : null });
  },
  head(c, k) { if (k === 1) return c.go ? ["sHWaitRoomM", {}] : ["sHWaitRight", {}]; return c.go ? ["sHPullOk", { a: fx(c.need, 1) }] : (c.need > 8 ? ["sHCutIn", {}] : ["sHForced", { a: fx(c.need, 1), g: fx(c.need / G, 2) }]); },
  rows: (c) => [row("sRInLane", `<b>${fx(c.tIn, 1)} s</b> → ${kmh(c.vIn)} km/h`), row("sRGapThen", `${c.D0} − ${fx(c.v * c.tIn, 1)} = <b>${fx(c.gapIn, 1)} m</b>`),
    row("sRDiff", `${kmh(c.v)} − ${kmh(c.vIn)} = <b>${kmh(c.v - c.vIn)} km/h</b>`), row("sRDecelNeed", c.need > 8 ? `<b>> 8 m/s²</b>` : `(${fx(c.v - c.vIn)})² ÷ (2 × ${fx(Math.max(1, c.gapIn - 2), 1)}) = <b>${fx(c.need, 1)} m/s²</b>`, c.need <= 2 ? "ok" : "no"), row("sRComfort", `<b>2 m/s²</b>`)],
  tip: () => "sTSide",
});
function sideCalc(v, D0) { const tIn = 3.0, vIn = 2.5 * tIn, gapIn = D0 - v * tIn - CL, rel = Math.max(0, v - vIn), need = gapIn <= 2 ? 99 : rel * rel / (2 * (gapIn - 2)); return { tIn, vIn, gapIn, need: Math.min(need, 99) }; }

/* 10 ─ joining a highway: what speed at the end of the slip road */
defSim("merge", {
  icon: "🛣️",
  gen() { const vt = ri(70, 90), D0 = ri(18, 35), opts = [vt - 30, vt - 15, vt].map((k) => Math.max(30, k)); const calc = opts.map((k) => mergeNeed(ms(vt), ms(k), D0));
    return { vt, D0, opts, calc }; },
  opts: (c) => c.opts.map((k) => `${k} km/h`), right: (c, k) => c.calc[k] <= 1.5,
  q: (c) => [t1("sQMerge1", { v: c.vt, m: c.D0 }), t1("sQMerge2")],
  idle: (c) => ({ you: 0, ylat: -5.25, other: -c.D0, ob: false }),
  run(c, k) { const vy = ms(c.opts[k]), vt = ms(c.vt), need = c.calc[k], tM = 2.5;
    const tEnd = 6.5;
    return { tEnd, at: (t) => { const you = vy * t, ylat = -5.25 + 3.5 * sm(t / tM); const tt = Math.max(0, t - tM), dv = Math.max(0, vt - vy), tb = need > 0 ? dv / need : 0;
      const nd = Math.min(need, 9), tb2 = nd > 0 ? dv / nd : 0, lost = t <= tM ? 0 : (tt < tb2 ? nd * tt * tt / 2 : nd * tb2 * tb2 / 2 + dv * (tt - tb2) - dv * (tt - tb2));
      const other = -c.D0 + CL + vt * t - (t > tM && tt >= tb2 ? dv * (tt - tb2) + nd * tb2 * tb2 / 2 : lost);
      const ox = Math.min(other, you - CL - 0.4);
      return { you, ylat, other: ox, ob: t > tM && need > 0.05, bad: need > 7 && t > tM, live: `${t1("sLBehind", { m: fx(Math.max(0, you - CL - ox), 1) })}` }; } }; },
  draw(c, cur, s) { scene(c, { cam: [s.you + 4, -1.6], road: { type: "merge", end: s.you + 200 }, deco: [{ k: "posts", every: 20 }],
    actors: [{ k: "car", x: s.other - CL / 2, y: -1.75, col: COLS.white, brake: s.ob }, { k: "car", x: s.you - CL / 2, y: s.ylat, col: s.bad ? COLS.red : COLS.you, ind: s.ylat < -2 ? "r" : null, on: true }] }); },
  head(c, k) { const n = c.calc[k]; return n <= 0.05 ? ["sHMergeMatch", {}] : n <= 1.5 ? ["sHMergeOk", { a: fx(n, 1) }] : n >= 99 ? ["sHCutIn", {}] : (n > 8 ? ["sHCutIn", {}] : ["sHForced", { a: fx(n, 1), g: fx(n / G, 2) }]); },
  rows: (c, k) => { const vt = ms(c.vt), vy = ms(c.opts[k]), n = c.calc[k];
    return [row("sRTraffic", `<b>${c.vt} km/h</b>`), row("sRYou", `<b>${c.opts[k]} km/h</b>`), row("sRDiff", `<b>${Math.max(0, c.vt - c.opts[k])} km/h</b> (${fx(Math.max(0, vt - vy))} m/s)`),
      row("gmGap", `<b>${c.D0} m</b>`), row("sRGapThen", `${c.D0} − ${fx(Math.max(0, vt - vy))} × 2.5 = <b>${fx(c.D0 - Math.max(0, vt - vy) * 2.5, 1)} m</b>`),
      row("sRDecelNeed", n > 8 ? "<b>> 8 m/s²</b>" : `${fx(Math.max(0, vt - vy))}² ÷ (2 × ${fx(c.D0 - Math.max(0, vt - vy) * 2.5 - 2, 1)}) = <b>${fx(n, 1)} m/s²</b>`, n <= 1.5 ? "ok" : "no"), row("sRComfort", `<b>1.5 m/s²</b>`)]; },
  tip: () => "sTMerge",
});
function mergeNeed(vt, vy, D0) { const dv = Math.max(0, vt - vy), room = D0 - dv * 2.5 - 2; return room <= 0.5 ? 99 : dv * dv / (2 * room); }

/* 11 ─ tailgater behind, queue ahead: brake hard or ease off early */
defSim("tailgater", {
  icon: "🚗",
  gen() { for (;;) { const v = ms(ri(50, 80)), gs = pick([0.5, 0.7, 0.9]), Q = ri(25, 110), room = Q - v * 0.3 - 1, gentle = room > 1 ? v * v / (2 * room) : 99, canGentle = gentle <= 3.5;
    if (Q > v * RT + 5) return { v, gs, Q, canGentle, ans: canGentle ? 1 : 0, gentle }; } },
  opts: () => [`🛑 ${t1("sOpHard")}`, `↘ ${t1("sOpEase")}`], right: (c, k) => k === c.ans,
  q: (c) => [t1("sQTail1", { v: kmh(c.v), m: c.Q }), t1("sQTail2", { s: c.gs })],
  idle: (c) => ({ you: 0, back: -c.v * c.gs - CL, yb: false, bb: false }),
  run(c, k) {
    const aY = k === 0 ? A_DRY : Math.max(2.5, c.gentle * 1.05), you = braking(0, c.v, k === 0 ? RT : 0.3, aY);
    const back = braking(-c.v * c.gs - CL, c.v, (k === 0 ? RT : 0.3) + RT, A_DRY);   // the tailgater reacts 1 s after your brake lights
    let hit = null; for (let t = 0; t < Math.max(you.tb, back.tb); t += 0.005) if (you.x(t) - CL - back.x(t) <= 0) { hit = t; break; }
    let front = null; if (you.dist > c.Q) for (let t = 0; t < you.tb; t += 0.005) if (you.x(t) >= c.Q - 0.2) { front = t; break; }
    const stopAt = [hit, front].filter((x) => x != null); const tEnd = stopAt.length ? Math.min(...stopAt) + 0.5 : Math.max(you.tb, back.tb) + 0.6;
    return { tEnd, hit, front, aY, at: (t) => { const tt = stopAt.length ? Math.min(t, Math.min(...stopAt)) : t;
      return { you: you.x(tt), back: back.x(tt), yb: tt > (k === 0 ? RT : 0.3), bb: tt > (k === 0 ? RT : 0.3) + RT, bad: stopAt.length && t >= Math.min(...stopAt), live: `${t1("sLBehind", { m: fx(Math.max(0, you.x(tt) - CL - back.x(tt)), 1) })} · ${t1("sLToHaz", { m: fx(Math.max(0, c.Q - you.x(tt)), 1) })}` }; } };
  },
  draw(c, cur, s) { scene(c, { cam: camAt(s.you), road: { type: "two" }, deco: [{ k: "posts", every: 10 }],
    actors: [{ k: "car", x: cur.Q + CL / 2, y: -1.75, col: COLS.grey, brake: true }, { k: "car", x: cur.Q + 9, y: -1.75, col: COLS.grey, brake: true },
      { k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you, brake: s.yb }, { k: "car", x: s.back - CL / 2, y: -1.75, col: "#f97316", brake: s.bb }] }); },
  head(c, k) { if (k === 1 && !c.canGentle) return ["sHQueueHit", {}]; if (k === 0 && c.canGentle) return ["sHTailHit", {}]; return k === 0 ? ["sHHardRight", {}] : ["sHEaseOk", {}]; },
  rows: (c, k) => [row("sRSpeed", `<b>${kmh(c.v)} km/h</b> = ${fx(c.v)} m/s`), row("sRTailGap", `${c.gs} s × ${fx(c.v)} = <b>${fx(c.v * c.gs, 1)} m</b>`),
    row("sRQueue", `<b>${c.Q} m</b>`), row("sRGentle", `${fx(c.v)}² ÷ (2 × ${fx(c.Q - c.v * 0.3 - 1, 1)}) = <b>${fx(Math.min(c.gentle, 99), 1)} m/s²</b>`, c.canGentle ? "ok" : "no"),
    row("sRTailNeeds", `${fx(c.v)} × ${RT} = <b>${fx(c.v * RT, 1)} m</b> > ${fx(c.v * c.gs, 1)} m`, "no")],
  tip: () => "sTTail",
});

/* 12 ─ seat belt: a 0.8 m stop or a 0.1 m stop */
defSim("seatbelt", {
  icon: "🔒",
  gen() { const v = ms(pick([30, 40, 50, 60])); return { v, belt: Math.random() < 0.5 ? "front" : "rear" }; },
  opts: () => [`🔒 ${t1("sOpBelt")}`, `🚫 ${t1("sOpNoBelt")}`], right: (c, k) => k === 0,
  q: (c) => [t1(c.belt === "front" ? "sQBeltF" : "sQBeltR"), t1("sQBelt2", { v: kmh(c.v) })],
  idle: (c) => ({ car: -6, crush: 0, body: -6, v: c.v, belt: true }),
  run(c, k) {
    const crush = 0.6, aCar = c.v * c.v / (2 * crush), tCar = c.v / aCar, t0 = 6 / c.v, sB = k === 0 ? 0.8 : 0.25;
    return { tEnd: t0 + 0.7, at: (t) => {
      if (t < t0) return { car: -6 + c.v * t, crush: 0, body: -6 + c.v * t, v: c.v, belt: k === 0, live: `${kmh(c.v)} km/h` };
      const tt = t - t0, d = tt < tCar ? c.v * tt - aCar * tt * tt / 2 : crush, vcar = Math.max(0, c.v - aCar * tt);
      let body;
      if (k === 0) { const aB = c.v * c.v / (2 * 0.8), tb = c.v / aB; body = tt < tb ? c.v * tt - aB * tt * tt / 2 : 0.8; }
      else body = Math.min(c.v * tt, crush + 0.35);   // keeps going at full speed until it hits the dash, then stops within 0.1 m
      const a = (k === 0 ? c.v * c.v / 1.6 : c.v * c.v / (2 * sB));
      return { car: 0, crush: d, body, v: vcar, belt: k === 0, flash: k === 1 && body >= crush + 0.3 && tt < tCar + 0.25 ? 0.35 : 0, live: `${t1("sLDecel", { g: fx(a / G, 0) })}` };
    } };
  },
  draw(c, cur, s) { crashScene(c, s); },
  head(c, k) { const s = k === 0 ? 0.8 : 0.25, a = c.v * c.v / (2 * s); return k === 0 ? ["sHBelt", { g: fx(a / G, 0) }] : ["sHNoBelt", { g: fx(a / G, 0) }]; },
  rows(c, k) { const s = k === 0 ? 0.8 : 0.25, a = c.v * c.v / (2 * s), F = 70 * a;
    return [row("sRSpeed", `<b>${kmh(c.v)} km/h</b> = ${fx(c.v)} m/s`), row("sRStopOver", `<b>${s} m</b>${k === 0 ? "" : " (dash / seat back)"}`), row("sRDecel", `${fx(c.v)}² ÷ (2 × ${s}) = <b>${fx(a, 0)} m/s²</b> ≈ <b>${fx(a / G, 0)} g</b>`, k === 0 ? "ok" : "no"),
      row("sRForce", `70 × ${fx(a, 0)} ≈ <b>${fx(F / 1000, 1)} kN</b> (≈ ${fx(F / G / 1000, 1)} t)`, k === 0 ? "ok" : "no")]; },
  tip: () => "sTBelt", maxShow: 3,
});

/* 13 ─ animal on the road: brake in lane or swerve */
defSim("cowswerve", {
  icon: "🐄",
  gen() { for (;;) { const v = ms(ri(50, 80)), d = ri(30, 75), onc = Math.random() < 0.55, S = stopD(v, RT, A_DRY), swD = v * (RT + Math.sqrt(2 * 3.5 / (0.6 * G)));
    const brakeOk = S <= d, swerveOk = !onc && swD <= d - 2; if (brakeOk || swerveOk || onc) return { v, d, onc, S, swD, brakeOk, swerveOk, ans: brakeOk ? 0 : swerveOk ? 1 : 0 }; } },
  opts: () => [`🛑 ${t1("sOpBrakeLane")}`, `↗ ${t1("sOpSwerve")}`], right: (c, k) => k === c.ans,
  q: (c) => [t1("sQCow1", { v: kmh(c.v), m: c.d }), t1(c.onc ? "sQCowOnc" : "sQCowClear")],
  idle: (c) => ({ you: -c.d, lat: -1.75, onc: 60 }),
  run(c, k) {
    if (k === 0) { const b = braking(-c.d, c.v, RT, A_DRY); let tHit = null; if (!c.brakeOk) for (let t = 0; t < b.tb; t += 0.005) if (b.x(t) >= -1.2) { tHit = t; break; }
      const tEnd = tHit != null ? tHit + 0.5 : b.tb + 0.6; return { tEnd, at: (t) => { const tt = tHit != null ? Math.min(t, tHit) : t; return { you: b.x(tt), lat: -1.75, onc: 60 - (c.onc ? ms(60) * t : 0), brake: tt > RT, bad: tHit != null && t >= tHit, live: `${kmh(b.v(tt))} km/h` }; } }; }
    const tl = Math.sqrt(2 * 3.5 / (0.6 * G)), vo = ms(60);
    let hit = null; if (c.onc) for (let t = 0; t < 4; t += 0.005) { const lat = -1.75 + 3.5 * sm((t - RT) / tl); if (lat > -0.2 && (60 - vo * t) - (-c.d + c.v * t) < CL + 0.5) { hit = t; break; } }
    const tEnd = hit != null ? hit + 0.4 : (c.d + 25) / c.v;
    return { tEnd, at: (t) => { const tt = hit != null ? Math.min(t, hit) : t; return { you: -c.d + c.v * tt, lat: -1.75 + 3.5 * sm((tt - RT) / tl), onc: 60 - (c.onc ? vo * tt : 999), bad: hit != null && t >= hit, live: `${kmh(c.v)} km/h` }; } };
  },
  draw(c, cur, s) { scene(c, { cam: camAt(s.you), road: { type: "two" }, actors: [{ k: "cow", x: 0, y: -1.6, face: -1 }, ...(cur.onc ? [{ k: "car", x: s.onc + CL / 2, y: 1.75, a: Math.PI, col: COLS.white }] : []),
    { k: "car", x: s.you - CL / 2, y: s.lat, a: (s.lat > -1.7 && s.lat < 1.7) ? 0.18 : 0, col: s.bad ? COLS.red : COLS.you, brake: s.brake }], ring: s.bad ? [s.you, s.lat] : null }); },
  head(c, k) { if (k === 0) { if (c.brakeOk) return ["sHStopped", { m: fx(c.d - c.S, 1) }]; const vi = Math.sqrt(2 * A_DRY * (c.S - c.d)); return ["sHHitSlower", { v: kmh(Math.min(c.v, vi)), w: kmh(c.v) }]; }
    return c.onc ? ["sHHeadOn", {}] : c.swerveOk ? ["sHSwerveOk", {}] : ["sHSwerveLate", {}]; },
  rows: (c) => [...stopRows(c.v, RT, A_DRY), row("sRSeen", `<b>${c.d} m</b>`), row("sRSwerveD", `${fx(c.v)} × (1.0 + ${fx(Math.sqrt(2 * 3.5 / (0.6 * G)), 2)}) = <b>${fx(c.swD, 1)} m</b>`), row("sROnc", c.onc ? "<b>✗</b>" : "<b>✓</b>", c.onc ? "no" : "ok")],
  tip: () => "sTCow",
});

/* 14 ─ lane change with a motorbike in the blind spot */
defSim("blindbike", {
  icon: "🏍️",
  gen() { for (;;) { const v = ms(ri(50, 80)), dv = ms(ri(5, 25)), bx = -ri(1, 18), r = bikeCalc(bx, dv); if (r.go ? r.slack > 0.3 : r.slack < -0.3) return { v, dv, bx, ...r }; } },
  opts: () => [`↘ ${t1("sOpChange")}`, `⏸ ${t1("gmWaitBtn")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQBike1", { v: kmh(c.v) }), t1("sQBike2")],
  idle: (c) => ({ lat: -1.75, bike: c.bx }),
  run(c, k) {
    /* bike rear at bx (relative to your front at 0), length 2 m; after you start moving over, a bike still behind brakes at the rate it needs (max 7) */
    const tl = 3, tE = 1.2, nd = Math.min(c.need, 7), tEnd = 5.5;
    let hit = null;
    const at0 = (t) => { const lat = k === 0 ? -1.75 + 3.5 * sm(t / tl) : -1.75; let bike = c.bx + c.dv * t;
      if (k === 0 && !c.ahead && t > tE) { const tt = t - tE, tb = c.dv / Math.max(0.1, nd); bike = c.bx + c.dv * tE + (tt < tb ? c.dv * tt - nd * tt * tt / 2 : c.dv * tb / 2); }
      return { lat, bike }; };
    if (k === 0 && !c.go) for (let t = 0; t < tEnd; t += 0.01) { const s0 = at0(t); if (s0.lat > -0.6 && s0.bike + 2 > -CL - 0.2 && s0.bike < 0.5) { hit = t; break; } }
    return { tEnd: hit != null ? hit + 0.4 : tEnd, at: (t) => { const s0 = at0(hit != null ? Math.min(t, hit) : t), rel = s0.bike + 2 + CL;
      return { ...s0, bb: k === 0 && !c.ahead && t > tE && c.need > 0.05, bad: hit != null && t >= hit, live: rel < 0 ? t1("sLBikeBehind", { m: fx(-rel, 1) }) : s0.bike > 0 ? t1("sLBikeAhead", { m: fx(s0.bike, 1) }) : t1("sLBikeBeside") }; } };
  },
  draw(c, cur, s) { scene(c, { cam: [6, 0], road: { type: "dual" }, actors: [{ k: "car", x: -CL / 2, y: s.lat, col: s.bad ? COLS.red : COLS.you, ind: "r", on: true }, { k: "bike", x: s.bike + 1, y: 1.75, brake: s.bb }], ring: s.bad ? [-CL / 2, 0.5] : null,
    label: [[Math.min(s.bike + 1, 16), 3.2, `🏍 +${kmh(cur.dv)} km/h`, "#fde047"]] }); },
  head(c, k) { if (k === 1) return c.go ? ["sHWaitRoomM", {}] : ["sHWaitRight", {}]; if (c.go) return c.ahead ? ["sHBikeOk", {}] : ["sHMergeOk", { a: fx(c.need, 1) }]; return ["sHBikeHit", {}]; },
  rows: (c) => [row("sRBikePos", `<b>${Math.abs(c.bx)} m</b>`), row("sRDiff", `<b>${kmh(c.dv)} km/h</b> (${fx(c.dv)} m/s)`),
    row("sRBikePass", `(${Math.abs(c.bx)} + 1) ÷ ${fx(c.dv)} = <b>${fx(c.tClear, 1)} s</b>`, c.ahead ? "ok" : ""), row("sRCrossLine", `<b>1.2 s</b>`),
    ...(c.gapBehind > 0 ? [row("sRDecelNeed", c.need > 8 ? "<b>> 8 m/s²</b>" : `${fx(c.dv)}² ÷ (2 × ${fx(c.gapBehind - 1, 1)}) = <b>${fx(c.need, 1)} m/s²</b>`, c.need <= 1.5 ? "ok" : "no"), row("sRComfort", "<b>1.5 m/s²</b>")] : [])],
  tip: () => "sTBike",
});
function bikeCalc(bx, dv) {
  const tE = 1.2, tClear = (Math.abs(bx) + 1) / dv, ahead = tClear <= tE - 0.3;
  const gapBehind = -CL - (bx + 2 + dv * tE), need = gapBehind > 1.2 ? dv * dv / (2 * (gapBehind - 1)) : 99;
  const go = ahead || need <= 1.5, slack = ahead ? (tE - 0.3 - tClear) : gapBehind > 0 ? 1.5 - need : -(tClear - (tE - 0.3));
  return { tClear, ahead, gapBehind, need, go, slack };
}

/* 15 ─ moving into the fast lane with a car coming up behind */
defSim("laneright", {
  icon: "⏩",
  gen() { for (;;) { const vy = ms(ri(60, 80)), vb = vy + ms(ri(10, 40)), D0 = ri(15, 90), r = laneCalc(vy, vb, D0); if (Math.abs(r.need - 1.5) > 0.4) return { vy, vb, D0, ...r, go: r.need <= 1.5 }; } },
  opts: () => [`↘ ${t1("sOpChange")}`, `⏸ ${t1("gmWaitBtn")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQLane1", { v: kmh(c.vy), w: kmh(c.vb), m: c.D0 }), t1("sQLane2")],
  idle: (c) => ({ you: 0, lat: -1.75, back: -c.D0, bb: false }),
  run(c, k) { const tl = 2.5, tEnd = 6.5;
    return { tEnd, at: (t) => { const you = c.vy * t, lat = k === 0 ? -1.75 + 3.5 * sm(t / tl) : -1.75, dvb = c.vb - c.vy;
      let back; if (k === 0 && t > tl * 0.6) { const tt = t - tl * 0.6, tb = c.need > 0 ? dvb / c.need : 0; back = -c.D0 + c.vb * tl * 0.6 + (tt < tb ? c.vb * tt - c.need * tt * tt / 2 : c.vb * tb - c.need * tb * tb / 2 + c.vy * (tt - tb)); }
      else back = -c.D0 + c.vb * t;
      if (k === 0) back = Math.min(back, you - CL - 0.4);
      return { you, lat, back, bb: k === 0 && t > tl * 0.6 && c.need > 0.05, bad: k === 0 && c.need > 7 && t > tl, live: `${t1("sLBehind", { m: fx(Math.max(0, you - CL - back), 1) })}` }; } }; },
  draw(c, cur, s) { scene(c, { cam: camAt(s.you - 6), road: { type: "dual" }, deco: [{ k: "posts", every: 20 }], actors: [{ k: "car", x: s.back - CL / 2, y: 1.75, col: "#f97316", brake: s.bb }, { k: "car", x: s.you - CL / 2, y: s.lat, col: s.bad ? COLS.red : COLS.you, ind: "r", on: true }] }); },
  head(c, k) { if (k === 1) return c.go ? ["sHWaitRoomM", {}] : ["sHWaitRight", {}]; return c.go ? ["sHMergeOk", { a: fx(c.need, 1) }] : (c.need > 8 ? ["sHCutIn", {}] : ["sHForced", { a: fx(c.need, 1), g: fx(c.need / G, 2) }]); },
  rows: (c) => [row("sRYou", `<b>${kmh(c.vy)} km/h</b>`), row("sRBehindCar", `<b>${kmh(c.vb)} km/h</b>, ${c.D0} m`), row("sRGapThen", `${c.D0} − ${fx((c.vb - c.vy) * 1.5, 1)} = <b>${fx(c.gapIn, 1)} m</b>`),
    row("sRDecelNeed", c.need > 8 ? "<b>> 8 m/s²</b>" : `${fx(c.vb - c.vy)}² ÷ (2 × ${fx(Math.max(1, c.gapIn - CL - 2), 1)}) = <b>${fx(c.need, 1)} m/s²</b>`, c.need <= 1.5 ? "ok" : "no"), row("sRComfort", `<b>1.5 m/s²</b>`)],
  tip: () => "sTLane",
});
function laneCalc(vy, vb, D0) { const dv = vb - vy, gapIn = D0 - dv * 1.5, room = gapIn - CL - 2, need = room <= 0.5 ? 99 : dv * dv / (2 * room); return { gapIn, need: Math.min(need, 99) }; }

/* 16 ─ overtaking a tractor before a crest */
defSim("crest", {
  icon: "⛰️",
  gen() { for (;;) { const vy = ms(ri(55, 80)), vt = ms(ri(20, 30)), C = ri(80, 420), vo = ms(70), tp = (20 + 4 + CL + 20) / (vy - vt), need = (vy + vo) * tp; if (Math.abs(C - need) / need > 0.18) return { vy, vt, C, vo, tp, need, go: C > need }; } },
  opts: () => [`↗ ${t1("gmOvertakeBtn")}`, `⏸ ${t1("gmWaitBtn")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQCrest1", { v: kmh(c.vy), w: kmh(c.vt) }), t1("sQCrest2", { m: c.C })],
  idle: (c) => ({ you: -20, lane: 0, tr: 0, onc: 999 }),
  run(c, k) {
    const tEnd0 = k === 0 ? c.tp + 1 : 7;
    let tHit = null; if (k === 0 && !c.go) for (let t = 0; t < c.tp; t += 0.01) { const s = crestState(c, t, 0); if (s.lane > 0.3 && s.onc - s.you < 8) { tHit = t; break; } }
    const tEnd = tHit != null ? tHit + 0.3 : tEnd0;
    return { tEnd, at: (t) => { const s = crestState(c, tHit != null ? Math.min(t, tHit) : t, k); return { ...s, bad: tHit != null && t >= tHit, live: `${t1("sLOnc", { m: s.onc < c.C - 20 + 5 ? fx(Math.max(0, s.onc - s.you), 0) : "?" })}` }; } };
  },
  draw(c, cur, s) { const crestX = cur.C - 20; scene(c, { cam: [Math.max(s.you, s.tr) + 8, 0], road: { type: "two" }, crest: crestX,
    actors: [{ k: "tractor", x: s.tr + 2, y: -1.75 }, ...(s.onc < crestX + 4 ? [{ k: "car", x: s.onc + CL / 2, y: 1.75, a: Math.PI, col: COLS.white }] : []), { k: "car", x: s.you - CL / 2, y: -1.75 + 3.5 * s.lane, col: s.bad ? COLS.red : COLS.you, ind: s.lane > 0.02 && s.lane < 0.98 ? (s.you < s.tr + 4 ? "r" : "l") : null, on: true }], ring: s.bad ? [s.you, 0] : null }); },
  head(c, k) { return k === 0 ? (c.go ? ["sHOvOk", { m: fx(c.C - c.need, 0) }] : ["sHCrestBad", {}]) : (c.go ? ["sHWaitRoomM", {}] : ["sHWaitRight", {}]); },
  rows: (c) => [row("gmOvRel", `${kmh(c.vy)} − ${kmh(c.vt)} = <b>${kmh(c.vy - c.vt)} km/h</b> (${fx(c.vy - c.vt)} m/s)`), row("gmOvTime", `(20 + 4 + 4.5 + 20) ÷ ${fx(c.vy - c.vt)} = <b>${fx(c.tp, 1)} s</b>`),
    row("sRWorst", `(${fx(c.vy)} + ${fx(c.vo)}) × ${fx(c.tp, 1)} = <b>${fx(c.need, 0)} m</b>`), row("sRSight", `<b>${c.C} m</b>`), mRow(c.C - c.need)],
  tip: () => "sTCrest",
});
function crestState(c, t, k) { const tr = c.vt * t; let you, lane = 0;
  if (k === 0) { you = -20 + c.vy * t; const rel = you - tr; lane = Math.min(sm((rel + 20) / 12), 1 - sm((rel - CL - 4 - 8) / 12)); } else you = -20 + c.vt * t;
  return { you, lane, tr, onc: c.C - 20 + 1 - c.vo * t }; }

/* 17 ─ passing a cyclist on a narrow road */
defSim("cyclist", {
  icon: "🚲",
  gen() { for (;;) { const vy = ms(ri(40, 60)), vc = ms(ri(12, 20)), vo = ms(ri(40, 60)), D0 = ri(60, 260), tp = (10 + 1.8 + CL + 10) / (vy - vc), need = (vy + vo) * tp; if (Math.abs(D0 - need) / need > 0.18) return { vy, vc, vo, D0, tp, need, go: D0 > need }; } },
  opts: () => [`↗ ${t1("sOpPass")}`, `⏸ ${t1("sOpBehind")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQCyc1", { v: kmh(c.vy), w: kmh(c.vc) }), t1("sQCyc2", { v: kmh(c.vo), m: c.D0 })],
  idle: (c) => ({ you: -10, lat: -1.75, cyc: 0, onc: c.D0 }),
  run(c, k) {
    const st = (t) => { const cyc = c.vc * t; if (k === 1) return { you: -10 + c.vc * t, lat: -1.75, cyc, onc: c.D0 - 10 + 1 - c.vo * t };
      const you = -10 + c.vy * t, rel = you - cyc; const want = Math.min(sm((rel + 10) / 7), 1 - sm((rel - CL - 1.8 - 5) / 7));
      const onc = c.D0 - 10 + 1 - c.vo * t, squeeze = onc - you < 40; const lat = -1.75 + (squeeze ? 0.9 : 2.6) * want; return { you, lat, cyc, onc, squeeze: squeeze && want > 0.5 }; };
    let tSq = null; if (k === 0 && !c.go) for (let t = 0; t < c.tp; t += 0.01) { const s = st(t); if (s.squeeze && Math.abs(s.you - CL / 2 - s.cyc) < 3) { tSq = t; break; } }
    const tEnd = k === 0 ? (tSq != null ? tSq + 0.4 : c.tp + 1) : Math.max(4, (c.D0 - 10) / (c.vo + c.vc) + 1.5);
    return { tEnd, at: (t) => { const s = st(tSq != null ? Math.min(t, tSq) : t); const clr = Math.max(0, s.lat - CW / 2 - (-2.75 + 0.3)); return { ...s, bad: tSq != null && t >= tSq, live: `${t1("sLClear", { m: fx(clr, 1) })}` }; } };
  },
  draw(c, cur, s) { scene(c, { cam: [(s.you + s.cyc) / 2 + 12, 0], road: { type: "two" }, actors: [{ k: "cycle", x: s.cyc + 0.9, y: -2.75 }, { k: "car", x: s.onc + CL / 2, y: 1.75, a: Math.PI, col: COLS.white }, { k: "car", x: s.you - CL / 2, y: s.lat, col: s.bad ? COLS.red : COLS.you }], ring: s.bad ? [s.cyc, -2.4] : null }); },
  head(c, k) { return k === 0 ? (c.go ? ["sHCycOk", {}] : ["sHCycSqueeze", {}]) : (c.go ? ["sHWaitRoomM", {}] : ["sHWaitRight", {}]); },
  rows: (c) => [row("gmOvRel", `${kmh(c.vy)} − ${kmh(c.vc)} = <b>${kmh(c.vy - c.vc)} km/h</b>`), row("gmOvTime", `(10 + 1.8 + 4.5 + 10) ÷ ${fx(c.vy - c.vc)} = <b>${fx(c.tp, 1)} s</b>`),
    row("gmOvNeedRow", `(${fx(c.vy)} + ${fx(c.vo)}) × ${fx(c.tp, 1)} = <b>${fx(c.need, 0)} m</b>`), row("gmOvHave", `<b>${c.D0} m</b>`), mRow(c.D0 - c.need), row("sRCycGap", `<b>1.5 m</b>`)],
  tip: () => "sTCyc",
});

/* 18 ─ when to start braking for a red light */
defSim("brakepoint", {
  icon: "🚥",
  gen() { const v = ms(ri(40, 70)), wet = Math.random() < 0.4, a = wet ? 3.0 : 4.5, need = v * v / (2 * a) + v * 0.5;   // firm (not emergency) braking + ½ s to move the foot
    const marks = [Math.round(need * 0.7), Math.round(need + rnd(3, 10)), Math.round(need * 1.9)].sort(() => Math.random() - 0.5); const best = marks.filter((m) => m >= need).sort((x, y) => x - y)[0];
    return { v, wet, a, need, marks, ans: marks.indexOf(best) }; },
  opts: (c) => c.marks.map((m) => t1("sOpAt", { m })), right: (c, k) => k === c.ans,
  q: (c) => [t1("sQBp1", { v: kmh(c.v) }), `${t1(surfK(c.wet))} · ${t1("sQBp2", { a: c.a })}`],
  idle: (c) => ({ you: -Math.max(...c.marks) - 25 }),
  run(c, k) { const m = c.marks[k], x0 = -Math.max(...c.marks) - 25, tB = (x0 + m) / -c.v * -1 >= 0 ? (-m - x0) / c.v : 0, b = braking(-m, c.v, 0.5, c.a);
    let tHit = null; const stopX = -m + c.need;
    const tEnd = tB + b.tb + 0.6;
    return { tEnd, at: (t) => { const you = t < tB ? x0 + c.v * t : b.x(t - tB), vv = t < tB ? c.v : b.v(t - tB);
      return { you, brake: t > tB + 0.5, bad: stopX > 0.3 && t >= tB + b.tb, early: stopX < -15, live: `${kmh(vv)} km/h · ${t1("sLToLine", { m: fx(Math.max(0, -you), 1) })}` }; } }; },
  draw(c, cur, s) { scene(c, { cam: camAt(s.you), road: { type: "two" }, deco: [{ k: "cross", x: 0, w: 12 }, { k: "stop", x: 0 }, { k: "signal", x: 0, state: "red" }, ...cur.marks.map((m) => ({ k: "marker", x: -m, t: `${m} m` }))],
    actors: [{ k: "car", x: s.you - CL / 2, y: -1.75, col: s.bad ? COLS.red : COLS.you, brake: s.brake }], ring: s.bad ? [s.you, -1.75] : null }); },
  head(c, k) { const m = c.marks[k], end = m - c.need; return end < 0 ? ["sHPastLine", { m: fx(-end, 1) }] : end > 15 ? ["sHEarly", { m: fx(end, 0) }] : ["sHStopped", { m: fx(end, 1) }]; },
  rows: (c, k) => [row("sRSpeed", `<b>${kmh(c.v)} km/h</b> = ${fx(c.v)} m/s`), row("sRFoot", `${fx(c.v)} × 0.5 = <b>${fx(c.v * 0.5, 1)} m</b>`), row("sRFirm", `${fx(c.v)}² ÷ (2 × ${c.a}) = <b>${fx(c.v * c.v / 2 / c.a, 1)} m</b>`),
    row("sRStop", `<b>${fx(c.need, 1)} m</b>`), row("sRBrakeFrom", `<b>${c.marks[k]} m</b>`), mRow(c.marks[k] - c.need)],
  tip: () => "sTBp",
});

/* 19 ─ emergency stop with or without ABS */
defSim("abs", {
  icon: "🅰️",
  gen() { const v = ms(ri(50, 80)), absOn = Math.random() < 0.5, wet = Math.random() < 0.6; return { v, absOn, wet, peak: wet ? 0.55 : 0.85, slide: wet ? 0.4 : 0.7 }; },
  opts: () => [`⏬ ${t1("sOpHold")}`, `〰 ${t1("sOpThresh")}`], right: (c, k) => (c.absOn ? k === 0 : k === 1),
  q: (c) => [t1(c.absOn ? "sQAbsOn" : "sQAbsOff", { v: kmh(c.v) }), `${t1(surfK(c.wet))} · ${t1("sQAbs2")}`],
  idle: () => ({ you: 0, lat: -1.75, lock: false }),
  run(c, k) { const mu = absMu(c, k), a = mu * G, b = braking(0, c.v, RT, a), steer = !(k === 0 && !c.absOn);
    return { tEnd: b.tb + 0.6, mu, at: (t) => { const x = b.x(t), dodge = steer ? 1.3 * sm((x - 10) / 18) : 0;
      return { you: x, lat: -1.75 + dodge, lock: !steer && t > RT && t < b.tb, brake: t > RT, live: `${kmh(b.v(t))} km/h · μ ${mu}` }; } }; },
  draw(c, cur, s) { scene(c, { cam: camAt(s.you), road: { type: "two" }, deco: [{ k: "posts", every: 10 }],
    actors: [{ k: "car", x: s.you - CL / 2, y: s.lat, col: s.lock ? "#f97316" : COLS.you, brake: s.brake }], label: s.lock ? [[s.you - 6, -4.3, t1("sLLocked"), "#fca5a5"]] : null }); },
  head(c, k) { const mu = absMu(c, k), S = stopD(c.v, RT, mu * G); return [k === 0 && !c.absOn ? "sHLocked" : c.absOn && k === 1 ? "sHAbsSoft" : "sHAbsOk", { m: fx(S, 1) }]; },
  rows(c, k) { const rows = [0, 1].map((j) => { const mu = absMu(c, j), S = stopD(c.v, RT, mu * G); return row(j === 0 ? "sROptHold" : "sROptThresh", `μ ${mu} → <b>${fx(S, 1)} m</b>${j === 0 && !c.absOn ? ` · ${t1("sLNoSteer")}` : ""}`, j === k ? (this.right(c, k) ? "ok" : "no") : ""); });
    return [row("sRSpeed", `<b>${kmh(c.v)} km/h</b>`), row("sRAbs", `<b>${c.absOn ? "✓" : "✗"}</b>`), row("sRGrip", `${c.peak} / ${c.slide}`), ...rows]; },
  tip: () => "sTAbs",
});
function absMu(c, k) { if (c.absOn) return k === 0 ? +(c.peak * 0.92).toFixed(2) : +(c.peak * 0.8).toFixed(2); return k === 0 ? c.slide : +(c.peak * 0.85).toFixed(2); }

/* 20 ─ turning left across a cyclist (left hook) */
defSim("lefthook", {
  icon: "↰",
  gen() { for (;;) { const v = ms(ri(15, 25)), vc = ms(ri(14, 24)), cb = ri(2, 30), r = hookCalc(v, vc, cb); if (Math.abs(r.margin) > 0.5) return { v, vc, cb, ...r, go: r.margin > 0 }; } },
  opts: () => [`↰ ${t1("sOpTurn")}`, `⏸ ${t1("sOpLetGo")}`], right: (c, k) => (k === 0) === c.go,
  q: (c) => [t1("sQHook1", { v: kmh(c.v) }), t1("sQHook2", { v: kmh(c.vc), m: c.cb })],
  idle: (c) => ({ fx: -12, p: 0, cyc: -12 - c.cb }),
  run(c, k) {
    /* your front reaches the corner (x = −2) at tTurn0 and the turn across the cyclist's line takes 1.6 s;
       the cyclist (front cb m behind yours) rides on at its speed */
    const passT = (c.cb + 10 + 3) / c.vc, start = k === 0 ? c.tTurn0 : Math.max(c.tTurn0, passT);
    let hit = null;
    if (k === 0 && !c.go) for (let t = start; t < start + 1.6; t += 0.01) { const cyc = -12 - c.cb + c.vc * t; if (cyc > -3.5 && cyc < 1) { hit = t; break; } }
    const tEnd = hit != null ? hit + 0.4 : start + 2.6;
    return { tEnd, at: (t) => { const tt = hit != null ? Math.min(t, hit) : t; const cyc = -12 - c.cb + c.vc * tt;
      return { fx: Math.min(-12 + c.v * tt, -2), p: clamp((tt - start) / 1.6, 0, 1), cyc, bad: hit != null && t >= hit, live: cyc < -2 ? t1("sLCycBack", { m: fx(-2 - cyc, 1) }) : t1("sLCycPast") }; } };
  },
  draw(c, cur, s) {
    const R = 5, th = s.p * Math.PI / 2, x = s.fx + Math.sin(th) * R, y = -1.75 - (1 - Math.cos(th)) * R;
    scene(c, { cam: [-2, -1], road: { type: "two" }, deco: [{ k: "side", x: -0.5, w: 7, dir: -1 }],
      actors: [{ k: "cycle", x: s.cyc - 0.9, y: -3.0 }, { k: "car", x: x - CL / 2 * Math.cos(th), y: y + CL / 2 * Math.sin(th), a: -th, col: s.bad ? COLS.red : COLS.you, ind: "l", on: true }], ring: s.bad ? [-1.5, -3] : null });
  },
  head(c, k) { return k === 0 ? (c.go ? ["sHHookOk", {}] : ["sHHookBad", {}]) : (c.go ? ["sHWaitRoomM", {}] : ["sHWaitRight", {}]); },
  rows: (c) => [row("sRCycBehind", `<b>${c.cb} m</b>, ${kmh(c.vc)} km/h`), row("sRYou", `<b>${kmh(c.v)} km/h</b>`),
    row("sRTurnBlock", `10 ÷ ${fx(c.v)} = <b>${fx(c.tTurn0, 1)} s</b> → ${fx(c.tTurn0 + 1.6, 1)} s`), row("sRCycArrive", `(${c.cb} + 10) ÷ ${fx(c.vc)} = <b>${fx(c.tCyc, 1)} s</b>`), mRow(c.margin, "s")],
  tip: () => "sTHook",
});
function hookCalc(v, vc, cb) {
  const tTurn0 = 10 / v, t1_ = tTurn0 + 1.6, tCyc = (cb + 10) / vc;   // cyclist's front reaches the corner
  /* safe if the cyclist arrives after you've finished (+0.5 s) or has already gone by before you start (−1 s) */
  const margin = tCyc >= t1_ ? tCyc - t1_ - 0.5 : tCyc <= tTurn0 - 1 ? (tTurn0 - 1) - tCyc : -Math.min(tCyc - (tTurn0 - 1), t1_ + 0.5 - tCyc);
  return { tTurn0, tCyc, margin };
}

Gm.GROUPS.splice(1, 0, ["gmSim", ["amber", "gapkeep", "bendspeed", "schoolzone", "fogspeed", "nightdip", "levelx", "rightturn", "sideroad", "merge", "tailgater", "seatbelt", "cowswerve", "blindbike", "laneright", "crest", "cyclist", "brakepoint", "abs", "lefthook"]]);
Gm.reindex();
Gm.SIM = SIM;
})();
