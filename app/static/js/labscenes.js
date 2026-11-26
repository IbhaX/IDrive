/* iDrive labscenes.js - a 3D scene for every driving-science lab (lab3d.js).
   Scenes only draw: the physics stays in each lab's calc(); `ctx` carries
   the lab state (st), its result (r), the run clock (t 0..1, idle) and time.
   Roads run along −Z (forward); our lane is x = −1.8 (India drives on the left). */
(() => {
"use strict";
if (!window.Lab3D) return;
const L = Lab3D, { M, B, K, lin } = L.helpers, def = L.def;
const u = (k, o) => I18n.u(k, o), tt = (k, o) => I18n.esc(I18n.one(u(k, o)));
const fx = (n, d = 1) => (+n).toFixed(d);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const GOOD = "#22c55e", BAD = "#ef4444", WARN = "#f59e0b", REACT = "#f97316", BRAKE = "#38bdf8", YOU = "#2563eb", LEAD = "#e5e7eb";
const LL = -1.8, LR = 1.8;
const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const P0 = (c) => (c.idle ? 0 : c.t);   // idle: the starting pose
const P1 = (c) => (c.idle ? 1 : c.t);   // idle: the settled result
const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 2);
const lvl = (s) => (s === "bad" ? BAD : s === "warnt" ? WARN : GOOD);
const sayCls = (r) => (r && r.say ? (r.say[2] === "bad" ? "bad" : r.say[2] === "warnt" ? "warn" : r.say[2] === "good" ? "good" : "") : "");
/* camera along a stretch of road, from the side and behind */
const along = (S, zNear, zFar, side = 1, h = 1) => {
  const len = Math.max(8, zNear - zFar);
  S.cam([side * (5.5 + len * 0.04), (6 + len * 0.07) * h, zNear + 7 + len * 0.05], [-0.6, 0, zNear - len * 0.42], 44);
};
/* metres → world z with a squash so long distances fit */
const scaler = (span, fit = 60) => { const k = Math.min(1, fit / span); return { k, z: (m) => 8 - m * k }; };
/* a coloured distance strip beside a lane, with an end post */
const distStrip = (S, x, z0, z1, color, w = 0.32) => S.strip(x - w, Math.min(z0, z1), x + w, Math.max(z0, z1), color, 0.9);
const post = (S, x, z, color, h = 1.6) => { S.cyl(x, 0, z, 0.05, h, color); S.sph(x, h, z, 0.12, color); };
const inBase = (S, base, x0, y0, z0, x1, y1, z1, color, a = 1) => S.prim("cube", M.mul(base, M.mul(M.t((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), M.s(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)))), color, a);
const at = (base, p) => { const v = M.apply(base, [p[0], p[1], p[2], 1]); return [v[0], v[1], v[2]]; };
const heat = (x) => { x = clamp(x, 0, 1); return [0.25 + x * 0.75, 0.22 + 0.25 * Math.sin(x * 3), 0.2 * (1 - x)]; };

/* 3D gauge dial in the Y–Z plane, facing +X (read by a camera on the +X side) */
const dialMesh = (max, step, red, warn) => {
  const b = new B(), dark = lin("#0f172a");
  b.cyl(0, 0, 0, 1, 0.08, "x", 56, dark, 0, 0.5);
  b.cyl(-0.03, 0, 0, 1.07, 0.08, "x", 56, lin("#94a3b8"), 0, 0.8);
  const P = (v, r) => { const a = (-120 + 240 * v / max) * Math.PI / 180; return [Math.cos(a) * r, -Math.sin(a) * r]; };
  const seg = (v0, v1, c) => { for (let v = v0; v < v1; v += max / 120) { const [y0, z0] = P(v, 0.84), [y1, z1] = P(Math.min(v1, v + max / 120), 0.84), [y2, z2] = P(Math.min(v1, v + max / 120), 0.95), [y3, z3] = P(v, 0.95); b.quad([0.05, y0, z0], [0.05, y1, z1], [0.05, y2, z2], [0.05, y3, z3], c, 0.25, 0.3, [1, 0, 0]); } };
  if (warn) seg(0, warn, lin("#f59e0b"));
  if (red) seg(red, max, lin("#ef4444"));
  for (let v = 0; v <= max + 1e-6; v += step) {
    const [y0, z0] = P(v, 0.72), [y1, z1] = P(v, 0.95), n = Math.hypot(y1 - y0, z1 - z0);
    const py = -(z1 - z0) / n * 0.018, pz = (y1 - y0) / n * 0.018;
    b.quad([0.06, y0 + py, z0 + pz], [0.06, y1 + py, z1 + pz], [0.06, y1 - py, z1 - pz], [0.06, y0 - py, z0 - pz], lin("#f8fafc"), 0.25, 0.3, [1, 0, 0]);
  }
  return b;
};
const dialPos = (max, v, r) => { const a = (-120 + 240 * clamp(v, 0, max) / max) * Math.PI / 180; return [Math.cos(a) * r, -Math.sin(a) * r]; };
const needle = (S, c, v, max, len, color, w = 0.035) => {
  const a = (-120 + 240 * clamp(v, 0, max) / max) * Math.PI / 180;
  S.prim("cube", M.mul(M.t(c[0] + 0.09, c[1], c[2]), M.mul(M.rx(-a), M.mul(M.t(0, len / 2, 0), M.s(0.02, len, w)))), color);
  S.cyl(c[0] + 0.1, c[1] - 0.05, c[2], 0.07, 0.1, "#e2e8f0");
};
const dial = (S, key, c, scale, max, step, red, warn, labels) => {
  S.dyn("dial" + key, `${max}|${step}|${red}|${warn}`, () => dialMesh(max, step, red, warn), M.mul(M.t(c[0], c[1], c[2]), M.s(scale, scale, scale)));
  if (labels) for (let v = 0; v <= max + 1e-6; v += step * (labels === 2 ? 2 : 1)) { const [y, z] = dialPos(max, v, 0.58 * scale); S.label(key + "n" + v, [c[0] + 0.1, c[1] + y, c[2] + z], `${labels === "k" ? v / 1000 : v}`, "tiny"); }
};
/* tyre with tread grooves, along the X axis */
const tyreMesh = (R, w, depth, grooves = 36) => {
  const b = new B(), rub = lin("#1a1a1a");
  b.cyl(0, 0, 0, R, w, "x", 48, rub, 0, 0.15);
  b.cyl(w / 2 + 0.002, 0, 0, R * 0.6, 0.01, "x", 32, lin("#b8bec7"), 0, 0.8);
  b.cyl(-w / 2 - 0.002, 0, 0, R * 0.6, 0.01, "x", 32, lin("#b8bec7"), 0, 0.8);
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; b.cyl(w / 2 + 0.006, Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38, R * 0.07, 0.01, "x", 10, lin("#6b7280"), 0, 0.6); }
  for (let i = 0; i < grooves; i++) {
    const a = i / grooves * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    [-w * 0.25, w * 0.25].forEach((x) => b.with(M.mul(M.t(x, c * (R - depth / 2), s * (R - depth / 2)), M.rx(a)), (q) => q.box(-0.012, -depth / 2 - 0.002, -0.006, 0.012, depth / 2 + 0.002, 0.006, lin("#050505"))));
  }
  return b;
};

/* =================== STOPPING & GRIP =================== */

def("stopping", {
  env: { kind: "road", length: 120 },
  scene(S, c) {
    const st = c.st, lanes = [["dry", 0.7], [st.surf, { wet: 0.4, gravel: 0.35, worn: 0.25 }[st.surf]]];
    const calcs = lanes.map((l) => Labs.calc(st.kmh, st.rt, l[1]));
    const span = Math.max(60, ...calcs.map((x) => x.total), st.hz) * 1.08, sc = scaler(span, 75);
    const tMax = Math.max(...calcs.map((x) => x.tStop)), p = c.idle ? 0 : c.t;
    if (st.surf !== "dry") S.strip(0.05, sc.z(span), 3.5, 20, st.surf === "wet" ? "#7dd3fc" : st.surf === "gravel" ? "#a8a29e" : "#78716c", st.surf === "wet" ? 0.28 : 0.35, 0.015);
    lanes.forEach((l, i) => {
      const x = i ? LR : LL, cc = calcs[i], tau = p * tMax, a = l[1] * 9.81;
      const imp0 = Labs.impact(st.kmh, st.rt, l[1], st.hz);
      let m = tau < st.rt ? cc.v * tau : Math.min(cc.total, cc.react + cc.v * (tau - st.rt) - a * (tau - st.rt) ** 2 / 2);
      if (imp0 > 0) m = Math.min(m, st.hz - 0.3 / sc.k);          // contact with the child, not through her
      distStrip(S, x + 1.15, sc.z(0), sc.z(cc.react), REACT); distStrip(S, x + 1.15, sc.z(cc.react), sc.z(cc.total), BRAKE);
      S.strip(x - 1.5, sc.z(cc.total) - 0.12, x + 1.5, sc.z(cc.total) + 0.12, "#f8fafc", 0.95);
      S.car(x, sc.z(m) + 2.1, { color: i ? "#0ea5e9" : YOU, brake: tau >= st.rt && p > 0 });
      S.label("t" + i, [x + 1.2, 0.4, sc.z(cc.total)], `${tt("surf_" + l[0])} · <b>${fx(cc.total)} m</b>`, "tag");
      const imp = Labs.impact(st.kmh, st.rt, l[1], st.hz);
      if (p >= 1 && imp > 0) S.glow([x, 0.8, sc.z(st.hz)], 2.2, [1, 0.15, 0.1]);
    });
    S.person(0, sc.z(st.hz), { id: "kid1", yaw: Math.PI / 2 });
    S.ring(0, sc.z(st.hz), 1.4, BAD, 0.85);
    S.label("hz", [0, 1.6, sc.z(st.hz)], `⚠ ${st.hz} m`, "bad");
    along(S, 12, sc.z(span));
  },
});

def("reaction", {
  env: { kind: "road", length: 200 }, noplay: true,
  scene(S, c) {
    const s = c.state, go = s === "go" || s === "done";
    S.car(LL, -22, { color: "#dc2626", brake: go });
    if (s === "go") { S.glow([LL - 0.64, 0.8, -19.8], 1.6, [1, 0.1, 0.05]); S.glow([LL + 0.64, 0.8, -19.8], 1.6, [1, 0.1, 0.05]); }
    S.car(LL, 4, { color: YOU });
    S.label("st", [LL, 2.3, -22], s === "wait" ? `${tt("rtWait")}` : s === "go" ? `<b>${tt("rtGo")}</b>` : "", s === "go" ? "bad big" : "tag");
    S.cam([LL + 1.2, 3.1, 11.5], [LL, 1, -30], 38);
  },

});

def("following", {
  env: { kind: "road", length: 200 },
  scene(S, c) {
    const r = Labs.folSim(c.st), last = r.frames[r.frames.length - 1];
    const span = Math.max(r.d + 15, last.xl + 12, 40), sc = scaler(span, 75);
    const f = c.idle ? r.frames[0] : r.frames[Math.round(c.t * (r.frames.length - 1))];
    const gapM = f.xl - f.xy;
    S.strip(LL - 0.25, sc.z(f.xl), LL + 0.25, sc.z(f.xy), gapM < r.v * 1 ? BAD : GOOD, 0.75);
    S.car(LL, sc.z(f.xl) - 2.2, { color: "#dc2626", brake: !c.idle });
    S.car(LL, sc.z(f.xy) + 2.15, { color: YOU, brake: !c.idle && f.t >= c.st.rt });
    distStrip(S, LL + 1.2, sc.z(0) + 2.15, sc.z(r.react) + 2.15, REACT);
    S.label("gap", [LL, 1.9, (sc.z(f.xl) + sc.z(f.xy)) / 2], `${fx(Math.max(0, gapM))} m`, gapM < 1 ? "bad big" : "tag");
    if (!c.idle && c.t >= 1 && r.hit) { S.glow([LL, 0.9, sc.z(last.xl)], 2.6, [1, 0.25, 0.1]); S.label("hit", [LL, 2.6, sc.z(last.xl)], `💥 ${Math.round(r.impact)} km/h`, "bad big"); }
    along(S, 12, sc.z(span));
  },
});

def("cornering", {
  env: { kind: "open" },
  scene(S, c) {
    const st = c.st, cc = Labs.coCalc(st), R = clamp(st.r * 0.25, 12, 60), use = cc.use;
    S.dyn("road", "r" + R, () => {
      const b = new B(), w = 3.8, P = (a, rr) => [-R + rr * Math.cos(a), -rr * Math.sin(a)];
      b.flat(-w, 0, w, 40, 0, K.C.tarmac, -3, 0.12);
      for (let i = 0; i < 40; i++) { const a0 = i / 40 * Math.PI / 2, a1 = (i + 1) / 40 * Math.PI / 2;
        const [x0, z0] = P(a0, R - w), [x1, z1] = P(a0, R + w), [x2, z2] = P(a1, R + w), [x3, z3] = P(a1, R - w);
        b.quad([x0, 0, z0], [x1, 0, z1], [x2, 0, z2], [x3, 0, z3], K.C.tarmac, -3, 0.12, [0, 1, 0]);
        const [a, bb] = P(a0, R + w - 0.25), [cx, cz] = P(a1, R + w - 0.25), [d, e] = P(a1, R + w - 0.1), [f, g] = P(a0, R + w - 0.1);
        b.quad([a, 0.012, bb], [f, 0.012, g], [d, 0.012, e], [cx, 0.012, cz], K.C.white, 0, 0.2, [0, 1, 0]);
        if (i % 2 === 0) { const [h1, h2] = P(a0, R), [h3, h4] = P(a1, R), [h5, h6] = P(a1, R + 0.12), [h7, h8] = P(a0, R + 0.12); b.quad([h1, 0.012, h2], [h7, 0.012, h8], [h5, 0.012, h6], [h3, 0.012, h4], K.C.white, 0, 0.2, [0, 1, 0]); }
      }
      b.flat(-R - 40, -R - w, -R, -R + w, 0, K.C.tarmac, -3, 0.12);
      return b;
    }, M.t(0, 0, 0));
    /* path: straight in, round the bend (left), or slide wide over the limit */
    const slipA = use > 1 ? Math.PI / 2 * (0.6 / use) : -1;
    const L1 = 25, L2 = R * Math.PI / 2, tot = L1 + L2 + 20, endP = slipA >= 0 ? 0.8 : 1, p = (c.idle ? 0 : c.t) * endP;
    let d = p * tot, x = 0, z = 25, yaw = 0, sliding = false;
    if (d <= L1) z = 25 - d;
    else {
      d -= L1;
      let a = d / R;
      if (slipA >= 0 && a > slipA) { const ex = (a - slipA) * R; sliding = true;
        x = -R + R * Math.cos(slipA) - Math.sin(slipA) * ex; z = -R * Math.sin(slipA) - Math.cos(slipA) * ex; yaw = -slipA + (a - slipA) * 1.2; }
      else if (a <= Math.PI / 2) { x = -R + R * Math.cos(a); z = -R * Math.sin(a); yaw = -a; }
      else { const ex = (a - Math.PI / 2) * R; x = -R - ex; z = -R; yaw = -Math.PI / 2; }
    }
    S.car(x, z, { color: YOU, yaw, brake: st.brake > 0 && p > 0 });
    const col = use > 1 ? BAD : use > 0.7 ? WARN : GOOD;
    S.ring(x, z, 2.6 * clamp(use, 0.15, 1.4), col, 0.9);
    const lat = clamp(cc.lat / cc.lim, 0, 1.4) * 3, lon = clamp(cc.lon / cc.lim, 0, 1.4) * 3, cy = 1.7;
    S.arrow([x, cy, z], [x - Math.cos(yaw) * lat, cy, z - Math.sin(yaw) * lat], "#a78bfa", 0.08);   // towards the inside of the bend
    if (lon > 0.05) S.arrow([x, cy, z], [x - Math.sin(yaw) * lon, cy, z + Math.cos(yaw) * lon], BRAKE, 0.08);
    S.label("use", [x, 2.6, z], `${tt("coUsed", { p: Math.round(use * 100) })}`, use > 1 ? "bad big" : use > 0.7 ? "warn" : "good");
    S.label("r", [-R + R * 0.7, 0.3, -R * 0.7], `r = ${st.r} m`, "tag");
    if (sliding) S.label("slide", [x, 1, z - 2], `${tt("coSlide")}`, "bad");
    S.cam([R * 0.5 + 9, R * 0.55 + 10, R * 0.2 + 20], [-R * 0.3, 0, -R * 0.3], 42);
  },
});

def("slope", {
  env: { kind: "open" }, dur: 3,
  scene(S, c) {
    const st = c.st, r = c.r, th = Math.atan(st.grade / 100) * 1.6, base = M.mul(M.t(0, 7, 6), M.rx(th));
    const span = Math.max(r.flat, isFinite(r.dist) ? r.dist : r.flat * 2.5) * 1.1, k = Math.min(1, 55 / span), p = P0(c);
    inBase(S, base, -4, -0.5, 14, 4, 0, -70, "#3b3d40");
    inBase(S, base, -0.07, 0, 0, 0.07, 0.015, -70, "#f2f2f2");
    inBase(S, base, -4.2, -0.5, 14, -4, 0.35, -70, "#d6d3d1"); inBase(S, base, 4, -0.5, 14, 4.2, 0.35, -70, "#d6d3d1");
    for (let zz = 10; zz > -70; zz -= 16) { const q = at(base, [0, -0.5, zz]); if (q[1] > 0.2) S.box(-0.4, 0, q[2] - 0.4, 0.4, q[1], q[2] + 0.4, "#9ca3af"); }
    const dz = isFinite(r.dist) ? r.dist * k : span * k, fz = r.flat * k, dec = 1 - (1 - p) ** 2;
    inBase(S, base, LL - 0.4, 0.01, 0, LL + 0.4, 0.04, -dz, isFinite(r.dist) ? (r.dist > r.flat ? BAD : GOOD) : BAD, 0.9);
    inBase(S, base, LR - 0.4, 0.01, 0, LR + 0.4, 0.04, -fz, "#94a3b8", 0.55);
    S.car(LL, 2.1 - (isFinite(r.dist) ? dz * dec : dz * p), { color: YOU, base, brake: p > 0 });
    S.car(LR, 2.1 - fz * dec, { color: "#94a3b8", base, alpha: 0.4, brake: p > 0 });
    S.label("d", at(base, [LL, 0.4, -dz]), `<b>${isFinite(r.dist) ? fx(r.dist) + " m" : "∞"}</b>`, sayCls(r));
    S.label("f", at(base, [LR + 1.5, -0.2, -fz]), `${tt("slFlat")} ${fx(r.flat)} m`, "tag");
    S.label("g", at(base, [0, 2.4, 6]), `${st.grade > 0 ? "+" : ""}${st.grade}%`, "big");
    S.cam([20, 12, 20], [-1, 6, -6], 44);
  },
});

def("abs", {
  env: { kind: "road", length: 120 }, dur: 3.2,
  scene(S, c) {
    const st = c.st, r = c.r, ok = r.lat / r.mup > 0.3, locked = r.s >= 0.9, p = P0(c);
    S.cone(LL, 0, -16, 0.35, 0.8, "#f97316"); S.cyl(LL, 0.35, -16, 0.28, 0.12, "#f8fafc");
    const path = (q) => { const z = 6 - q * 30, x = ok ? LL + Math.sin(clamp((q - 0.25) / 0.5, 0, 1) * Math.PI / 2) * 3.4 * (q > 0.25 ? 1 : 0) : LL; return [x, z]; };
    for (let i = 0; i <= 30; i += 2) { const [x, z] = path(i / 30); S.cyl(x, 0.01, z, 0.12, 0.02, ok ? GOOD : BAD, 0.6); }
    const qEnd = ok ? 0.9 : 0.648, q = qEnd * (1 - (1 - p) ** 2), [cx, cz] = path(q), [nx, nz] = path(Math.min(1, q + 0.02));
    if (st.pedal > 0) {
      if (locked) [-0.8, 0.8].forEach((dx) => S.strip(LL + dx - 0.12, cz + 1.3, LL + dx + 0.12, 4.5, "#111111", 0.6, 0.014));
      else if (st.abs === "on" && st.pedal >= 30) for (let z = 4; z > cz + 1.3; z -= 1.4) [-0.8, 0.8].forEach((dx) => S.strip(LL + dx - 0.12, z - 0.6, LL + dx + 0.12, z, "#111111", 0.35, 0.014));
    }
    S.car(cx, cz, { color: YOU, yaw: Math.atan2(nx - cx, -(nz - cz)), brake: st.pedal > 0 && p > 0 });
    if (!ok && p >= 1 && !c.idle) S.glow([LL, 0.6, -15], 2.2, [1, 0.3, 0.1]);
    S.label("s", [cx, 2.2, cz], `${tt(ok ? "abCanSteer" : "abNoSteer")}`, ok ? "good" : "bad");
    S.label("c", [LL, 1.3, -16], "⚠", "bad");
    S.label("d", [cx + 1.5, 0.4, cz - 4], `${tt("abStop")}: <b>${isFinite(r.stop) ? fx(r.stop) + " m" : "-"}</b>`, "tag");
    S.cam([13, 11, 14], [0.5, 0, -8], 42);
  },
});

def("aquaplaning", {
  env: { kind: "road", length: 60, scenery: false, mood: "rain" }, dur: 3.2,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, R = 0.33, w = 0.22, p = P1(c), sp = sm(clamp(p / 0.85, 0, 1));
    const contact = 1 - (1 - r.contact) * sp, ratio = r.ratio * sp, water = st.water * 0.006 + 0.004, lift = (1 - contact) * 0.02;
    const spin = c.time * (st.kmh * sp) / 3.6 / R * 0.25;
    S.dyn("tyre", "t" + st.tread, () => tyreMesh(R, w, 0.002 + st.tread * 0.0022), M.mul(M.t(0, R + lift, 0), M.rx(-spin)));
    S.box(-0.2, 0, -3, 0.25, water, 3, "#60a5fa", 0.35);
    const wedge = (1 - contact) * 0.5;
    if (wedge > 0.01) S.prim("cube", M.mul(M.t(0.02, water + wedge * 0.06, -R * 0.55 - wedge * 0.2), M.mul(M.rx(-0.35), M.s(w + 0.02, wedge * 0.16, wedge * 0.7))), "#93c5fd", 0.55);
    S.strip(-w / 2, -0.09 * contact, w / 2, 0.09 * contact, "#020617", 0.8, water + 0.002);
    const n = Math.round(ratio * 30);
    for (let i = 0; i < n; i++) { const ph = (c.time * 1.6 + i * 0.137) % 1, a = (i * 2.399) % 1; S.sph(-0.15 + a * 0.3 + (a - 0.5) * ph * 0.6, 0.02 + ph * 0.35 * (1 - ph) * 2, 0.25 + ph * 0.9, 0.012 + ph * 0.01, "#dbeafe", 0.6); }
    S.label("c", [0, 0.02, -0.45], `${tt("aqContact")} <b>${Math.round(contact * 100)}%</b>`, contact < 0.05 ? "bad" : contact < 0.4 ? "warn" : "good");
    S.label("v", [0, 0.82, 0], `<b>${Math.round(st.kmh * sp)} km/h</b> · ${tt("aqOnset")} ${Math.round(r.von)}`, "big");
    S.cam([1.25, 0.42, -1.05], [0, 0.2, 0], 40);
  },
});

def("tyrepressure", {
  env: { kind: "studio" }, dur: 2.6,
  scene(S, c) {
    const st = c.st, r = c.r, R = 0.33, p = P1(c), k = sm(p), area = 1 + (r.area - 1) * k, pNow = 1 + (r.p - 1) * k;
    const defl = clamp((area - 1) * 0.08 + 0.015, 0.004, 0.08), sy = 1 - defl / (2 * R), sx = 1 + defl * 1.4;
    S.dyn("tyre", "t", () => tyreMesh(R, 0.21, 0.007), M.mul(M.t(0, R * sy, 0), M.s(sx, sy, 1)));
    const W = 0.2 * clamp(Math.sqrt(area) * (pNow < 1 ? 1.08 : 0.92), 0.5, 1.6), H = 0.16 * clamp(Math.sqrt(area), 0.5, 1.6);
    S.strip(-W / 2, -H / 2, W / 2, H / 2, "#0f172a", 0.85, 0.004);
    if (pNow < 0.95) { S.strip(-W / 2, -H / 2, -W / 2 + W * 0.22, H / 2, BAD, 0.8, 0.006); S.strip(W / 2 - W * 0.22, -H / 2, W / 2, H / 2, BAD, 0.8, 0.006); }
    else if (pNow > 1.05) S.strip(-W * 0.18, -H / 2, W * 0.18, H / 2, WARN, 0.85, 0.006);
    else S.strip(-W / 2 + 0.01, -H / 2 + 0.01, W / 2 - 0.01, H / 2 - 0.01, GOOD, 0.55, 0.006);
    if (st.load === "full") for (let i = 0; i < 3; i++) { const y = 0.7 + i * 0.12 + (1 - sm(clamp(p * 2 - i * 0.3, 0, 1))) * 1.2; S.box(-0.12, y, -0.15, 0.12, y + 0.11, 0.15, "#d6b25e"); }
    S.label("p", [0, 0.86, 0], `<b>${Math.round(100 + (st.pct - 100) * k)}%</b> · ${tt("tpArea")} ×${fx(area, 2)}`, "big");
    S.label("w", [0, 0.01, H / 2 + 0.12], tt(pNow < 0.95 ? "tpWearEdges" : pNow > 1.05 ? "tpWearCentre" : "tpWearEven"), "tag");
    S.cam([0.95, 0.75, 1.15], [0, 0.18, 0], 38);
  },
});

def("weighttransfer", {
  env: { kind: "studio" }, dur: 2.6,
  scene(S, c) {
    const st = c.st, r = c.r, p = P1(c), k = sm(clamp(p / 0.6, 0, 1)), front = 0.6 + (r.front - 0.6) * k, pitch = -(front - 0.6) * 0.32;
    const z = c.idle ? 0 : (st.acc < 0 ? 3 - 3 * (1 - (1 - p) ** 2) : 3 - 3 * p * p);
    S.car(0, z, { color: YOU, pitch, pivot: [0, 0.6, 0], brake: st.acc < -0.05 && !c.idle });
    const col = (zz, share, key) => { const h = share * 2.6; S.cyl(1.55, 0, zz + z, 0.2, h, share > 0.65 ? WARN : GOOD, 0.9); S.label(key, [1.55, h + 0.2, zz + z], `${tt(key === "f" ? "wtFront" : "wtRear")} <b>${Math.round(share * 100)}%</b>`, "good"); };
    col(-1.33, front, "f"); col(1.32, 1 - front, "r");
    if (Math.abs(st.acc) > 0.05) S.arrow([0, st.h + 0.1, z], [0, st.h + 0.1, z + (st.acc < 0 ? -1.6 * Math.min(1, -st.acc) : 1.6 * st.acc) * k], "#a78bfa", 0.05);
    S.cam([7.2, 2.4, -0.6], [0, 0.7, 0], 38);
  },
});

/* =================== SEEING & BEING SEEN =================== */

def("headlights", {
  env: { kind: "road", length: 180, mood: "labnight" },
  scene(S, c) {
    S.mood("labnight");
    const st = c.st, cc = Labs.hlCalc(st), span = Math.max(cc.D, cc.stop, 60) * 1.12, sc = scaler(span, 80);
    const end = Math.min(cc.stop, cc.D - 0.35 / Math.min(1, 80 / span)), p = c.idle ? 0 : c.t;
    const m = p < 0.42 ? cc.react * (p / 0.42) : cc.react + (end - cc.react) * ease((p - 0.42) / 0.58);
    const z = sc.z(m) + 2.1, reach = cc.D * sc.k;
    S.car(LL, z, { color: YOU, brake: p > 0.42 });
    [-0.6, 0.6].forEach((dx) => { S.light([LL + dx, 0.7, z - 2.2], reach * 1.3 + 8, "#fff3d6", 7, [0, -0.05, -1], cc.beam === "high" ? 16 : 22); S.glow([LL + dx, 0.7, z - 2.25], 0.7, [1, 0.95, 0.8]); });
    S.prim("cone", M.mul(M.t(LL, 0.7, z - 2.2 - reach), M.mul(M.rx(-Math.PI / 2), M.s(2.6 * (reach / 40 + 0.6), reach, 0.9))), "#fff6c8", 0.06);
    const pc = { dark: "#1f2937", light: "#e5e7eb", reflective: "#f97316" }[st.clothes];
    S.person(LL + 0.6, sc.z(cc.D), { id: "hlped", color: pc, yaw: Math.PI / 2 });
    if (st.clothes === "reflective") S.glow([LL + 0.6, 1.1, sc.z(cc.D)], 0.5, [0.6, 0.6, 0.45]);
    if (st.glare === "yes") { S.car(LR, sc.z(span * 0.8), { yaw: Math.PI, color: "#475569" }); [-0.6, 0.6].forEach((dx) => S.glow([LR + dx, 0.7, sc.z(span * 0.8) + 2.2], 3.2, [1, 0.95, 0.8])); }
    distStrip(S, LL + 1.2, sc.z(0), sc.z(cc.react), REACT); distStrip(S, LL + 1.2, sc.z(cc.react), sc.z(cc.stop), BRAKE);
    S.strip(LL - 1.6, sc.z(cc.D) - 0.1, LL + 1.6, sc.z(cc.D) + 0.1, "#fde68a", 0.8);
    S.label("see", [LL - 1.6, 0.4, sc.z(cc.D)], tt("hlSee", { m: Math.round(cc.D) }), "tag");
    S.label("stop", [LL + 1.4, 0.4, sc.z(cc.stop)], `${tt("totalDist")} <b>${fx(cc.stop)} m</b>`, cc.ok ? "good" : "bad");
    along(S, 12, sc.z(span), 1, 0.8);
  },
});

def("fog", {
  env: { kind: "road", length: 260 },
  scene(S, c) {
    const st = c.st, r = c.r, p = c.idle ? 0 : c.t;
    S.fog(st.vis * 0.75);
    const lz = 4 - st.vis - 2.2;
    S.car(LL, lz, { color: "#94a3b8" });
    const blink = Math.sin(c.time * 7) > 0; S.live();
    if (blink) [-0.64, 0.64].forEach((dx) => S.glow([LL + dx, 0.8, lz + 2.2], 0.9, [1, 0.55, 0.05]));
    const z = 4 + 2.2 - Math.min(r.stop, st.vis - 0.3) * p;
    if (p >= 1 && r.stop > st.vis && !c.idle) S.glow([LL, 0.8, 4 - st.vis], 2.4, [1, 0.25, 0.1]);
    S.car(LL, z, { color: YOU, brake: p > 0.3 });
    distStrip(S, LL + 1.25, 4, 4 - r.stop, r.stop <= st.vis ? GOOD : BAD);
    S.label("vis", [LL, 2.4, lz], `${tt("fgStopped")} · ${st.vis} m`, "tag");
    S.label("stop", [LL + 1.3, 0.3, 4 - r.stop], `${tt("totalDist")} <b>${fx(r.stop)} m</b>`, r.stop <= st.vis ? "good" : "bad");
    S.cam([LL + 3.5, 3.4, z + 11], [LL, 1, z - 30], 40);
  },
});

def("eyesoff", {
  env: { kind: "road", length: 200 },
  scene(S, c) {
    const st = c.st, r = c.r, span = Math.max(r.dist, 40) * 1.2, sc = scaler(span, 75), p = c.idle ? 0 : c.t;
    S.box(-3.6, 0, sc.z(r.dist), 3.6, 2.4, sc.z(0), "#020617", 0.28);
    [12, 27, 45, 70].forEach((m, i) => { if (m < span) S.person(i % 2 ? -4.2 : 4.2, sc.z(m), { id: "eo" + i, yaw: i % 2 ? Math.PI / 2 : -Math.PI / 2 }); });
    S.car(LL, sc.z(r.dist * p) + 2.1, { color: YOU });
    S.label("b", [0, 2.8, sc.z(r.dist / 2)], `📱 ${tt("eoBlind")} · <b>${Math.round(r.dist)} m</b>`, "bad");
    along(S, 12, sc.z(span));
  },
});

const TZ = {
  truck: { L: 10, W: 2.5, zones: [[-1.6, 5, 3.2, 3], [-4.2, -3.5, 2.95, 8], [1.25, -2, 1.6, 4.2], [-1.8, -17, 3.6, 12]] },
  bus: { L: 12, W: 2.6, zones: [[-1.6, 6, 3.2, 2.5], [-4.2, -4.5, 2.9, 9.5], [1.3, -2.5, 1.5, 4.5], [-1.8, -19, 3.6, 13]] },
};
def("truckzones", {
  env: { kind: "road", length: 80, lanes: 4, width: 3.4 }, dur: 3.5,
  hint: "lab3TapPlace",
  scene(S, c) {
    const st = c.st, v = TZ[st.veh], p = P1(c), running = !c.idle && p < 1;
    S.car(0, 0, { kind: st.veh === "bus" ? "bus" : "truck", color: st.veh === "bus" ? "#b91c1c" : "#0f766e", id: "tz" });
    v.zones.forEach(([x, y, w, h], i) => { const pulse = running ? Math.max(0, 1 - Math.abs(p * 4.5 - i - 0.5)) : 0; S.box(x, 0, -(y + h), x + w, 1.3, -y, BAD, 0.14 + pulse * 0.3); S.strip(x, -(y + h), x + w, -y, BAD, 0.25 + pulse * 0.4); });
    const by = st.y - 12 * (1 - sm(p));
    const hid = v.zones.some(([x, y, w, h]) => st.x >= x && st.x <= x + w && by >= y && by <= y + h) || (Math.abs(st.x) < v.W / 2 && Math.abs(by) < v.L / 2);
    S.car(st.x, -by, { kind: "bike", color: "#16a34a", id: "tzb", tint: hid ? 0.25 : 0, tintC: [1, 0.1, 0.1] });
    S.ring(st.x, -by, 1.1, hid ? BAD : GOOD, 0.95);
    S.label("b", [st.x, 2, -by], tt(hid ? "tzHidden" : "tzSeen"), hid ? "bad" : "good");
    S.cam([9, 24, 16], [0, 0, -3], 44);
  },
  click(q, c) {
    const v = TZ[c.st.veh];
    let x = clamp(Math.round(q[0] * 2) / 2, -6, 6); const y = clamp(Math.round(-q[1] * 2) / 2, -16, 9);
    if (Math.abs(x) < v.W / 2 + 0.6 && Math.abs(y) < v.L / 2 + 1) x = (x < 0 ? -1 : 1) * (v.W / 2 + 1);   // a rider can't be inside the lorry
    c.set({ x, y });
  },
});

def("blindspot", {
  env: { kind: "road", length: 80, lanes: 3, width: 3.5 }, dur: 4,
  hint: "lab3TapPlace",
  scene(S, c) {
    const BS = c.st, sees = Labs.bsSees, G = Labs.BSG, p = P1(c);
    S.car(0, 0, { color: YOU });
    const wedge = (key, at0, centre, fov, len, color) => {
      S.dyn("w" + key, `${centre}|${fov}`, () => { const b = new B(), n = 14, cc = lin(color);
        for (let i = 0; i < n; i++) { const a0 = (centre - fov / 2 + fov * i / n) * Math.PI / 180, a1 = (centre - fov / 2 + fov * (i + 1) / n) * Math.PI / 180;
          b.tri([0, 0, 0], [Math.sin(a0) * len, 0, -Math.cos(a0) * len], [Math.sin(a1) * len, 0, -Math.cos(a1) * len], cc, 0.25, 0.1, [0, 1, 0], [0, 1, 0], [0, 1, 0]); }
        return b; }, M.t(at0[0], 0.035, -at0[1]), { alpha: 0.2 });
    };
    wedge("i", G.iM.at, 180, G.iM.fov, 22, "#a78bfa");
    wedge("r", G.rM.at, 180 - (G.rM.base + 2 * BS.rAdj), G.rM.fov, 22, "#38bdf8");
    wedge("l", G.lM.at, -180 + (G.lM.base + 2 * BS.lAdj), G.lM.fov, 22, "#2dd4bf");
    if (BS.look !== "none") wedge("k", G.eye, BS.look === "right" ? 112 : -112, 105, 9, "#fbbf24");
    S.dyn("blind", `${BS.rAdj}|${BS.lAdj}|${BS.look}`, () => {
      const b = new B(), cc = lin("#ef4444");
      for (let x = -5.25 + 0.25; x < 5.25; x += 0.5) for (let y = -13.75; y <= 3; y += 0.5) {
        if (Math.abs(x) < 1.2 && y > -2.6 && y < 2.6) continue;
        if (!sees(x, y).length) b.flat(x - 0.25, -y - 0.25, x + 0.25, -y + 0.25, 0, cc, 0.25, 0.05);
      }
      return b;
    }, M.t(0, 0.04, 0), { alpha: 0.45 });
    const bx = BS.lane === "right" ? 3.5 : -3.5, dist = -16 + (BS.dist + 16) * sm(p);
    const seen = new Set([[bx, dist + 1], [bx, dist], [bx, dist - 1]].flatMap(([x, y]) => sees(x, y))), hid = !seen.size;
    S.car(bx, -dist, { kind: "bike", color: "#7c3aed", id: "bsb", tint: hid ? 0.2 : 0, tintC: [1, 0.1, 0.1] });
    S.ring(bx, -dist, 1.2, hid ? BAD : GOOD, 0.95);
    S.label("b", [bx, 2.1, -dist], hid ? `⚠ ${tt("bsHidden")}` : `✓ ${tt("bsVisible")}`, hid ? "bad" : "good");
    S.cam([7, 21, 15], [0, 0, 3.5], 44);
  },
  click(q, c) { c.set(q[0], -q[1]); },
});

def("microsleep", { env: { kind: "road", length: 200 }, dur: 2.6, scene(S, c) { blindRun(S, c, c.r.d, "😴", tt("msDist"), "#0b1020"); } });
def("glare", {
  env: { kind: "road", length: 200, mood: "labnight" }, dur: 2.6,
  scene(S, c) {
    S.mood("labnight");
    const span = Math.max(c.r.d, c.r.stop, 40) * 1.12, sc = scaler(span, 75), p = P0(c), zc = sc.z(span * 0.85) + p * 10;
    S.car(LR, zc, { yaw: Math.PI, color: "#334155" });
    [-0.6, 0.6].forEach((dx) => { S.glow([LR + dx, 0.7, zc + 2.2], 4 + p * 2, [1, 0.95, 0.8]); S.light([LR + dx, 0.7, zc + 2.3], 40, "#fff3d6", 3, [0, -0.05, 1], 25); });
    blindRun(S, c, c.r.d, "😵", tt("glDist"), "#fffbe6", sc);
  },
});
function blindRun(S, c, dist, icon, label, color, sc0) {
  const r = c.r, span = Math.max(dist, r.stop, 40) * 1.12, sc = sc0 || scaler(span, 75), p = c.idle ? 0 : c.t;
  S.box(-3.6, 0, sc.z(dist), 0, 2.4, sc.z(0), color, color === "#fffbe6" ? 0.2 : 0.3);
  S.car(LL, sc.z(dist) - 4, { color: "#dc2626", brake: true });
  S.car(LL, sc.z(dist * p) + 2.1, { color: YOU });
  distStrip(S, LL + 1.25, sc.z(0), sc.z(r.stop), BRAKE);
  S.label("b", [LL, 2.8, sc.z(dist / 2)], `${icon} ${label} <b>${Math.round(dist)} m</b>`, "bad");
  S.label("s", [LL + 1.3, 0.3, sc.z(r.stop)], `${tt("msStop")} ${Math.round(r.stop)} m`, "tag");
  if (S.mood && color === "#fffbe6") S.light([LL, 0.7, sc.z(dist * p) - 0.1], 30, "#fff3d6", 3, [0, -0.06, -1], 22);
  along(S, 12, sc.z(span));
}

def("reversezone", {
  env: { kind: "road", length: 60, scenery: true }, dur: 3.4,
  scene(S, c) {
    const st = c.st, r = c.r, V = r.V, sy = V[0] / 1.15, p = P1(c);
    const cz = -3.5 * (1 - sm(p)), rear = 2.15 + cz, eyeZ = rear - V[2];
    S.car(LL, cz, { color: YOU, brake: false });
    if (sy > 1.05) S.box(LL - 0.85, 1.3, cz - 0.4, LL + 0.85, 1.3 + (sy - 1) * 1.4, cz + 1.1, YOU);
    if (!c.idle && p < 1) { S.glow([LL - 0.64, 0.79, rear + 0.05], 0.5, [1, 1, 1]); S.glow([LL + 0.64, 0.79, rear + 0.05], 0.5, [1, 1, 1]); }
    const slope = (V[0] - V[1]) / V[2], gz = rear + V[1] / slope;
    S.sph(LL + 0.35, V[0], eyeZ, 0.07, "#facc15");
    S.rod([LL + 0.35, V[0], eyeZ], [LL + 0.35, 0.02, Math.min(gz, rear + 25)], 0.02, "#facc15");
    if (r.blind > 0.05) S.dyn("bz", `${fx(r.blind, 2)}|${st.h}|${V}`, () => new B().ext([[0, 0.01], [0, V[1] - 0.4 / V[2] * (V[0] - V[1])], [r.blind, st.h], [r.blind, 0.01]], -1, 1, lin("#ef4444"), 0.25, 0.1), M.t(LL, 0, rear), { alpha: 0.35 });
    const kz = 2.15 + Math.min(r.blind, 6) * 0.6 + 0.5, kx = LL + 3.2 * (1 - sm(clamp(p * 1.4, 0, 1)));
    S.person(kx, kz, { id: "kidrz", scale: st.h / 1.1, yaw: kx > LL + 0.1 ? -Math.PI / 2 : Math.PI, walk: kx > LL + 0.1 ? c.time * 8 : 0 });
    S.label("b", [LL, 1.8, rear + 1], r.blind > 0.05 ? `⚠ ${tt("rzBlind")} <b>${fx(r.blind, 1)} m</b>` : `✓ ${tt("rzSeen")}`, r.blind > 0.05 ? "bad" : "good");
    S.cam([9, 3.2, 3.5], [LL, 0.8, 2.6], 38);
  },
});

/* =================== ROADS, BENDS & JUNCTIONS =================== */

def("speedbump", {
  env: { kind: "road", length: 120 }, dur: 3,
  scene(S, c) {
    const st = c.st, r = c.r, hm = st.h / 100, Lh = st.L;
    S.dyn("hump", `${st.h}|${Lh}`, () => {
      const b = new B(), n = 24, y = (z) => hm * (1 - Math.cos(2 * Math.PI * (z / Lh + 0.5))) / 2;
      for (let i = 0; i < n; i++) { const z0 = -Lh / 2 + Lh * i / n, z1 = z0 + Lh / n;
        for (let s = 0; s < 10; s++) { const x0 = -3.6 + s * 0.72, x1 = x0 + 0.72; b.quad([x0, y(z0 + Lh / 2), z0], [x1, y(z0 + Lh / 2), z0], [x1, y(z1 + Lh / 2), z1], [x0, y(z1 + Lh / 2), z1], s % 2 ? lin("#facc15") : lin("#111827"), 0, 0.2); } }
      return b;
    }, M.t(0, 0.002, 0));
    const ph = c.idle ? 0.5 : c.t, z = 14 - ph * 28, prof = (zz) => (Math.abs(zz) < Lh / 2 ? hm * (1 - Math.cos(2 * Math.PI * (zz / Lh + 0.5))) / 2 : 0);
    const lift = clamp(r.gs - 1, 0, 1) * 0.35 * Math.max(0, Math.sin(clamp((-z + Lh / 2) / (Lh + 3), 0, 1) * Math.PI));
    const yF = prof(z - 1.33), yR = prof(z + 1.32), pitch = Math.atan2(yF - yR, 2.65) + lift * 0.1;
    const shake = !c.idle && Math.abs(z) < Lh ? Math.min(0.06, r.gs * 0.03) * Math.sin(c.time * 30) : 0;
    if (shake) S.live();
    S.car(LL, z, { color: YOU, y: (yF + yR) / 2 + lift + shake, pitch, pivot: [0, 0.4, 0] });
    S.label("g", [LL, 2.3, z], `${tt("sbJolt")} <b>${fx(r.gs, 2)} g</b>`, sayCls(r));
    S.cam([9.5, 2.6, 4], [0, 0.5, 0], 40);
  },
});

def("hillstart", {
  env: { kind: "open" }, dur: 3,
  scene(S, c) {
    const st = c.st, r = c.r, th = r.th * 1.4, base = M.mul(M.t(0, 3, 6), M.rx(th)), p = P1(c);
    inBase(S, base, -3.8, -0.4, 18, 3.8, 0, -40, "#3b3d40");
    inBase(S, base, -0.07, 0, 18, 0.07, 0.015, -40, "#f2f2f2");
    for (let zz = 14; zz > -40; zz -= 14) { const q = at(base, [0, -0.4, zz]); if (q[1] > 0.2) S.box(-0.4, 0, q[2] - 0.4, 0.4, q[1], q[2] + 0.4, "#9ca3af"); }
    const k = clamp((p - 0.15) / 0.75, 0, 1), back = Math.min(r.roll, 3) * k * k;
    S.car(LL, -6, { color: "#dc2626", base, brake: true });
    S.car(LL, 0.4, { color: YOU, base, alpha: 0.28 });
    S.car(LL, 0.4 + back, { color: YOU, base, brake: p < 0.15 && !c.idle });
    if (back > 0.05) S.prim("cube", M.mul(base, M.mul(M.t(LL + 1.2, 0.05, 0.4 + back / 2 - 2.1), M.s(0.35, 0.02, back))), BAD, 0.9);
    S.label("b", at(base, [LL, 2.2, 0.4 + back]), back > 0.05 ? `↓ <b>${Math.round(r.roll * 100 * k * k)} cm</b>` : `✓`, sayCls(r));
    S.label("g", at(base, [0, 3, -10]), `${st.grade}%`, "big");
    S.cam([16, 7, 6], [0, 3, -2], 40);
  },
});

def("banking", {
  env: { kind: "open" }, dur: 3,
  scene(S, c) {
    const st = c.st, r = c.r, roll = st.bank * Math.PI / 180, base = M.mul(M.t(0, 1.2, 0), M.rz(roll));
    inBase(S, base, -4.5, -0.6, 30, 4.5, 0, -30, "#3b3d40");
    inBase(S, base, -0.07, 0, 30, 0.07, 0.015, -30, "#f2f2f2");
    S.box(-4.6, 0, -30, 4.6, 1.2 - Math.abs(Math.sin(roll)) * 4.5, 30, "#7c6f5c");
    const z = c.idle ? 0 : 22 - 44 * c.t;
    S.car(LL + 1.2, z, { color: YOU, base });
    const q = at(base, [LL + 1.2, 0.6, z]);
    S.arrow(q, [q[0] - 2.2, q[1], q[2]], "#a78bfa", 0.07);
    const col = (x, v, key, cl) => { const h = v / 25; S.cyl(x, 0, 9, 0.35, h, cl, 0.9); S.label(key, [x, h + 0.4, 9], `${tt(key === "f" ? "bkFlat" : "bkMax")} <b>${Math.round(v)} km/h</b>`, key === "f" ? "tag" : "good"); };
    col(-8, r.f, "f", "#94a3b8"); col(8, r.v, "v", r.v < r.f ? BAD : GOOD);
    S.label("a", [0, 3.4, 0], `${st.bank}°`, "big");
    S.cam([0, 4.5, -16], [0, 1.6, 0], 42);
  },
});

def("bendsight", {
  env: { kind: "open" }, dur: 3.6,
  scene(S, c) {
    const st = c.st, r = c.r, R = st.r, phi = Math.asin(clamp(r.S / (2 * R), 0, 1));
    const P = (a, rr) => [-R + rr * Math.cos(a), -rr * Math.sin(a)];
    S.dyn("road", `${R}|${st.m}`, () => {
      const b = new B(), n = 60;
      for (let i = 0; i < n; i++) { const a0 = -1.2 + 2.4 * i / n, a1 = -1.2 + 2.4 * (i + 1) / n;
        const q = (r0, r1, y, col, pat) => { const [x0, z0] = P(a0, r0), [x1, z1] = P(a0, r1), [x2, z2] = P(a1, r1), [x3, z3] = P(a1, r0); b.quad([x0, y, z0], [x1, y, z1], [x2, y, z2], [x3, y, z3], col, pat, 0.1, [0, 1, 0]); };
        q(R - 1.9, R + 5.5, 0, K.C.tarmac, -3); if (i % 2) q(R + 1.75, R + 1.88, 0.012, K.C.white, 0);
        const [h0, hz0] = P(a0, R - st.m), [h1, hz1] = P(a1, R - st.m);
        b.with(M.t((h0 + h1) / 2, 0, (hz0 + hz1) / 2), (w) => w.sph(0, 0.8, 0, 0.9, 1.1, 0.9, i % 2 ? lin("#2f5d1f") : lin("#3b6e25"), 6, true));
      }
      return b;
    }, M.t(0, 0, 0));
    const a = c.idle ? -phi : -1.1 + (1.1 - 2 * phi + 0.9) * c.t * 0.75, [ax, az] = P(a, R), [bx, bz] = P(a + 2 * phi, R);
    S.car(ax, az, { color: YOU, yaw: -a });
    S.rod([ax, 1.2, az], [bx, 1.2, bz], 0.05, "#facc15");
    S.sph(bx, 1.2, bz, 0.25, "#facc15");
    S.label("s", [bx, 2, bz], `👁 <b>${Math.round(r.S)} m</b> · ${Math.round(r.v)} km/h`, "good");
    const mid = P(0, R);
    S.cam([mid[0] + 18 + R * 0.25, 22 + R * 0.35, mid[1] + 24 + R * 0.3], [mid[0], 0, mid[1]], 44);
  },
});

def("gap", {
  env: { kind: "open" }, dur: 4,
  scene(S, c) {
    const st = c.st, r = c.r, w = st.width;
    S.dyn("j", "w" + w, () => { const b = new B(); b.flat(-220, -w, 120, 0, 0, K.C.tarmac, -3, 0.12); b.flat(-3.6, 0, 3.6, 60, 0.001, K.C.tarmac, -3, 0.12);
      for (let x = -220; x < 120; x += 9) b.flat(x, -w / 2 - 0.07, x + 4.5, -w / 2 + 0.07, 0.012, K.C.white, 0, 0.2);
      for (let x = -3.4; x < 3.4; x += 0.9) b.flat(x, 0.2, x + 0.5, 0.35, 0.013, K.C.white, 0, 0.2);
      return b; }, M.t(0, 0, 0));
    const T = Math.max(r.tta, r.need) + 1.5, v = st.dist / r.tta;
    const at = (tau) => { const ox = -st.dist + v * tau, cz = 3 - (w + 6) * sm(clamp(tau / r.need, 0, 1)); return [ox, cz]; };
    const touching = ([ox, cz]) => Math.abs(cz - (-w * 0.72)) < 0.95 + 2.25 && Math.abs(ox - LL) < 2.25 + 0.95;
    let tc = Infinity; for (let k = 0; k <= 400; k++) { const tk = T * k / 400; if (touching(at(tk))) { tc = tk; break; } }
    const tau = Math.min(P0(c) * T, tc), [ox, cz] = at(tau);
    const crash = !c.idle && tau >= tc;
    S.car(LL, cz, { color: YOU });
    S.car(ox, -w * 0.72, { yaw: Math.PI / 2, color: "#dc2626", brake: crash });
    if (crash) S.glow([LL, 0.8, -w * 0.72], 2.6, [1, 0.25, 0.1]);
    S.strip(-st.dist, -w - 0.6, 0, -w - 0.3, r.tta - r.need < 2 ? BAD : GOOD, 0.9);
    S.label("d", [-st.dist / 2, 0.4, -w - 0.5], `${st.dist} m · <b>${fx(r.tta, 1)} s</b>`, r.tta - r.need < 1 ? "bad" : r.tta - r.need < 2 ? "warn" : "good");
    S.label("n", [LL, 2.3, cz], `${tt("gpNeed")} ${fx(r.need, 1)} s`, "tag");
    S.cam([10, 9, 22], [-st.dist * 0.35, 0, -w], 44);
  },
});

def("signal", {
  env: { kind: "road", length: 200 }, dur: 3.6,
  scene(S, c) {
    const st = c.st, r = c.r, sc = scaler(160, 80), zt = sc.z(150), p = P0(c);
    S.strip(-60, zt - 3.6, -3.6, zt + 3.6, "#3b3d40", 1, 0.004);
    const start = sc.z(150 - st.m) + 2.1, n = Math.max(1, Math.round(r.w * 1.5)), drive = clamp(p / 0.75, 0, 1);
    let x = LL, z = start + (zt + 1 - start) * drive, yaw = 0;
    if (p > 0.75) { const a = (p - 0.75) / 0.25 * Math.PI / 2; x = LL - 4 + 4 * Math.cos(a); z = zt + 1 - 4 * Math.sin(a); yaw = -a; }
    const blinking = c.idle || p < 0.95;
    if (blinking) S.live();
    S.car(x, z, { color: YOU, yaw });
    if (blinking && Math.sin(c.time * 9.4) > 0) { const s = Math.sin(yaw), co = Math.cos(yaw); [[-0.85, -2.05], [-0.85, 2.1]].forEach(([lx, lz]) => S.glow([x + lx * co - lz * s, 0.78, z + lx * s + lz * co], 0.9, [1, 0.55, 0.05])); }
    for (let i = 0; i < n; i++) { const m = (150 - st.m) + st.m * (n === 1 ? 0 : i / (n - 1)) * 0.92; S.cyl(LL - 1.2, 0.01, sc.z(m), 0.22, 0.03, WARN, 0.9); }
    S.label("w", [x, 2.3, z], `↰ <b>${fx(r.w, 1)} s</b> · ${st.m} m`, sayCls(r));
    along(S, 12, sc.z(160));
  },
});

def("crosswind", {
  env: { kind: "road", length: 120 }, dur: 3.2,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, kind = st.veh === "bike" ? "bike" : st.veh, p = P1(c), off = clamp(r.share, 0, 1) * 1.6 * sm(p), z = c.idle ? 0 : 12 - 12 * p;
    S.car(LL + off, z, { kind, color: kind === "bus" ? "#b45309" : kind === "truck" ? "#16a34a" : YOU, id: "cw", roll: kind === "bike" ? -off * 0.15 : 0 });
    if (!c.idle) S.strip(LL - 0.05, z, LL + 0.05, 12, "#f8fafc", 0.5);
    const n = Math.round(st.wind / 6) + 3, sp = st.wind / 10;
    for (let i = 0; i < n; i++) { const zz = -14 + (i * 7.3) % 28, x = -16 + ((c.time * sp + i * 3.7) % 13), y = 0.6 + (i % 4) * 0.7; S.line([x, y, zz], [x + 1.4 + st.wind / 40, y, zz], "#e0f2fe", 0.7); }
    S.arrow([LL - 3, 1.3, z], [LL - 3 + 0.6 + r.share * 3, 1.3, z], lvl(r.say[2]), 0.09);
    S.label("s", [LL + off, 2.8 + (kind === "bus" || kind === "truck" ? 1.6 : 0), z], `💨 ${st.wind} km/h · <b>${Math.round(r.share * 100)}%</b>`, sayCls(r));
    S.cam([6, 13, 15], [0, 0, -2], 42);
  },
});

/* =================== TWO-WHEELERS =================== */

def("lean", {
  env: { kind: "road", length: 80 }, dur: 2.8,
  scene(S, c) {
    const st = c.st, r = c.r, p = P1(c), dTarget = Math.min(r.deg, 75) * Math.PI / 180, lim = r.lim * Math.PI / 180;
    let d = dTarget * sm(clamp(p / 0.7, 0, 1)), x = LL;
    const slide = r.deg > r.lim && p > 0.7;
    if (slide) { const k = (p - 0.7) / 0.3; d = dTarget + (1.35 - dTarget) * k; x = LL + 1.2 * k; }
    S.car(x, 0, { kind: "bike", color: "#dc2626", id: "ln", roll: d });
    S.car(LL, 0, { kind: "bike", color: "#94a3b8", id: "ln2", roll: lim, alpha: 0.22, shadow: false });
    if (slide) S.glow([x, 0.2, 0], 1.6, [1, 0.3, 0.1]);
    S.label("a", [LL - 1.2, 1.6, 0], `<b>${Math.round(d * 180 / Math.PI)}°</b> / ${tt("lnLimit")} ${Math.round(r.lim)}°`, sayCls(r));
    S.cam([LL, 1.3, -5.6], [LL - 0.4, 0.8, 0], 40);
  },
});

def("bikebrake", {
  env: { kind: "road", length: 160, lanes: 3, width: 3.2 }, dur: 3,
  scene(S, c) {
    const st = c.st, r = c.r, ks = ["rear", "front", "both"], span = r.dist("rear") * 1.1, sc = scaler(span, 70), p = P0(c);
    ks.forEach((k, i) => {
      const x = -3.2 + i * 3.2, on = k === st.mode, dd = r.dist(k), m = dd * (1 - (1 - p) ** 2);
      S.car(x, sc.z(m) + 1, { kind: "bike", color: on ? "#dc2626" : "#64748b", id: "bb" + i, brake: p > 0, pitch: k === "front" && p > 0 && p < 1 ? -0.06 : 0, pivot: [0, 0.3, -0.7], alpha: on ? 1 : 0.55 });
      distStrip(S, x + 0.9, sc.z(0), sc.z(dd), on ? (k === "rear" ? BAD : GOOD) : "#94a3b8", 0.2);
      if (k === "rear" && p > 0) S.strip(x - 0.04, sc.z(m) + 1.6, x + 0.04, sc.z(dd * 0.3), "#111", 0.6, 0.014);
      S.label("k" + i, [x, 1.9, sc.z(dd) + 1], `${tt({ rear: "bbRear", front: "bbFront", both: "bbBoth" }[k])} · <b>${Math.round(dd)} m</b>`, on ? "big" : "tag");
    });
    along(S, 12, sc.z(span));
  },
});

def("doorzone", {
  env: { kind: "road", length: 80 }, dur: 3.4,
  scene(S, c) {
    const st = c.st, x0 = -3.6 + 1.05, p = c.idle ? 0.55 : c.t, cls = c.r.say[2];
    const open = sm(clamp((p - 0.3) / 0.2, 0, 1)) * 1.2;
    S.car(x0, 0, { color: "#f8fafc" });
    S.prim("cube", M.mul(M.t(x0 + 0.88, 0.85, -0.85), M.mul(M.trs(0, 0, 0, open), M.mul(M.t(0.03, 0, 0.5), M.s(0.06, 0.7, 1)))), "#f8fafc");
    if (open > 0.3) S.box(x0 + 0.9, 0, -1.6, x0 + 1.9, 1.2, 0.4, BAD, 0.18);
    const bx = x0 + 0.9 + st.gap + 0.3, hit = st.gap < 0.6 && open > 0.6;
    let bz = 9 - 18 * p;
    if (hit && bz < 1.05) bz = 1.05;
    S.car(bx, bz, { kind: "cycle", id: "dzc", roll: hit && bz <= 1.05 ? 0.5 : 0, solid: false });
    if (hit && bz <= 1.05 && !c.idle) S.glow([bx, 1, 0.3], 2, [1, 0.25, 0.1]);
    S.ring(bx, bz, 1, lvl(cls), 0.95);
    S.rod([x0 + 0.9, 0.05, -4], [bx, 0.05, -4], 0.03, "#facc15");
    S.label("g", [(x0 + 0.9 + bx) / 2, 0.5, -4], `<b>${fx(st.gap, 1)} m</b>`, sayCls(c.r));
    S.label("z", [x0 + 1.4, 1.5, -0.6], "🚪 ≈ 1 m", "tag");
    S.cam([6, 5.5, 6], [x0 + 1, 0.6, -2], 42);
  },
});

/* =================== CRASHES & PROTECTION =================== */

def("energy", {
  env: { kind: "open" },
  scene(S, c) {
    const st = c.st, v = st.kmh / 3.6, h = v * v / (2 * 9.81), hc = Math.min(h, 60), p = c.idle ? 0 : c.t;
    const floors = 20;
    S.box(3, 0, -4, 12, floors * 3, 5, "#d6d3d1");
    for (let f = 0; f < floors; f++) for (let k = 0; k < 4; k++) S.box(2.95, f * 3 + 0.9, -3.2 + k * 2.1, 3.0, f * 3 + 2.3, -2.0 + k * 2.1, "#1e3a5f");
    const kind = st.veh === "scooter" ? "bike" : "car", y = p >= 1 ? 0 : hc * (1 - p * p);
    S.car(-1, 0, { kind, color: YOU, y, shadow: true, id: "en", scale: st.veh === "suv" ? 1.1 : 1, roll: p >= 1 ? 0.06 : 0 });
    S.strip(-4, -0.06, 3, 0.06, "#facc15", 0.9, hc + 0.02);
    S.box(-4, hc, -0.04, 3, hc + 0.04, 0.04, "#facc15", 0.9);
    if (p >= 1 && !c.idle) S.glow([-1, 0.6, 0], 4, [1, 0.45, 0.1]);
    S.label("h", [-4, hc + 0.6, 0], `<b>${fx(h)} m</b> · ${tt("enLike", { h: fx(h), f: fx(h / 3) })}`, "big");
    S.cam([-26, Math.max(10, hc * 0.6), 30], [0, hc * 0.45, 0], 42);
  },
});

def("seatbelt", {
  env: { kind: "studio" },
  scene(S, c) {
    const st = c.st, r = c.r, p = c.idle ? 1 : c.t, hit = clamp(p / 0.55, 0, 1), after = clamp((p - 0.55) / 0.45, 0, 1);
    S.box(-4, 0, -6.2, 4, 1.6, -5.4, "#9ca3af");
    [[-1.4, true], [1.4, false]].forEach(([x, belted], i) => {
      const crush = (st.crumple + 0.25) * 0.6 * after, z = 2 - 5.25 * hit + 3.8 - crush / 2;
      S.car(x, z - 3.8, { color: belted ? "#0ea5e9" : "#f97316", alpha: 0.38, id: "sb" + i, shadow: true, post: M.s(1, 1, 1 - crush / 4.4) });
      const dz = belted ? -0.18 * after : -1.1 * after, dy = belted ? 0 : 0.25 * after;
      S.person(x + 0.36, z - 3.8 + 0.25 + dz, { id: "dummy" + i, color: "#fde047", sit: true, y: -0.45 + dy, lean: belted ? -0.25 * after : -0.7 * after });
      if (belted) S.rod([x + 0.62, 1.38, z - 3.8 + 0.35 + dz], [x + 0.12, 0.65, z - 3.8 + 0.15 + dz], 0.03, "#f97316");
      if (!belted && after > 0.6) S.glow([x + 0.36, 1.3, z - 3.8 - 0.9], 1.6, [1, 0.2, 0.1]);
      const gv = (belted ? r.gb : r.gu) * p, hgt = gv / r.gu * 3;
      S.cyl(x + (belted ? -2.4 : 2.4), 0, -2, 0.3, Math.max(0.02, hgt), belted ? GOOD : BAD, 0.9);
      S.label("g" + i, [x + (belted ? -2.4 : 2.4), hgt + 0.4, -2], `${tt(belted ? "sbBelted" : "sbUnbelted")} <b>${Math.round(gv)} g</b>`, belted ? "good" : "bad");
    });
    if (st.child === "yes") S.label("ch", [-1.4, 2.4, -3], tt("sbChildLine", { kg: Math.round(12 * r.gb) }), "bad");
    S.cam([10, 5.5, 3], [0, 0.8, -2.5], 42);
  },
});

def("helmet", {
  env: { kind: "studio" }, dur: 2.2,
  scene(S, c) {
    const st = c.st, r = c.r, ph = P1(c), fall = ph < 0.6 ? 1 - (ph / 0.6) ** 2 : 0, squash = ph >= 0.6 && ph < 0.8 ? Math.sin((ph - 0.6) / 0.2 * Math.PI) : 0;
    const rest = st.helmet === "yes" ? 0.275 : 0.2, y = rest + fall * 1.4, hr = 0.2, crush = r.on ? 0.12 * squash : 0.02 * squash;
    S.sph(0, y - crush * 0.5, 0, hr, "#c68642");
    if (st.helmet === "yes") {
      const tilt = st.strap === "loose" ? 0.5 * squash + 0.2 : 0;
      S.prim("sph", M.mul(M.t(st.strap === "loose" ? 0.08 : 0, y + 0.02 - crush * 0.5, 0), M.mul(M.rz(tilt), M.s(0.27, 0.27 * (1 - crush), 0.29))), "#dc2626", 0.75);
      S.prim("sph", M.mul(M.t(st.strap === "loose" ? 0.08 : 0, y + 0.01 - crush * 0.5, 0), M.mul(M.rz(tilt), M.s(0.235, 0.235 * (1 - crush * 1.5), 0.25))), "#f8fafc", 0.5);
    }
    if (squash > 0) S.ring(0, 0, 0.45 + squash * 0.3, r.on ? GOOD : BAD, 0.9);
    const hg = clamp(r.gg / 2600, 0, 1) * 1.8 * (ph >= 0.6 ? 1 : 0.02);
    S.cyl(1.2, 0, 0, 0.14, Math.max(0.02, hg), r.on ? GOOD : BAD, 0.9);
    if (ph >= 0.6) S.label("g", [1.2, hg + 0.25, 0], `<b>${Math.round(r.gg)} g</b> · ${tt("hmStopIn", { mm: Math.round(r.d * 1000) })}`, sayCls(r));
    S.cam([1.9, 1.3, 2.6], [0.45, 0.6, 0], 40);
  },
});

def("rollover", {
  env: { kind: "studio" }, dur: 3.2,
  scene(S, c) {
    const st = c.st, r = c.r, tip = st.gl >= r.ssf && r.ssf <= r.mu, p = P1(c), k = sm(clamp(p / 0.7, 0, 1)), gl = st.gl * k;
    let tilt = clamp(gl / r.ssf, 0, 1.2) * (tip && gl >= r.ssf ? 0.42 : 0.09);
    if (tip && p > 0.7) tilt += (p - 0.7) / 0.3 * 1.1;
    const sy = { hatch: 1, suv: 1.28, van: 1.55 }[st.veh], half = r.t / 2;
    const base = M.mul(M.t(half, 0, 0), M.mul(M.rz(-tilt), M.t(-half, 0, 0)));
    S.car(0, 0, { color: YOU, base: M.mul(base, M.s(r.t / 1.76, sy, 1)), shadow: false });
    S.shadow(0, 0, 1.4, 2.8);
    if (st.roof === "yes") S.prim("cube", M.mul(base, M.mul(M.t(0, 1.46 * sy + 0.22, 0.2), M.s(1.3, 0.42, 1.8))), "#a16207");
    const cg = at(base, [0, r.h, 0]);
    S.sph(cg[0], cg[1], -2.4, 0.09, "#facc15");
    S.arrow([cg[0], cg[1], -2.4], [cg[0] + gl * 1.8, cg[1], -2.4], "#a78bfa", 0.06);
    S.arrow([cg[0], cg[1], -2.4], [cg[0], cg[1] - 1.2, -2.4], "#94a3b8", 0.06);
    S.rod([cg[0], cg[1], -2.4], [half, 0.02, -2.4], 0.015, "#f8fafc", 0.8);
    S.label("s", [0, 2.9 * sy, 0], `${tt("roSSF")} <b>${fx(r.ssf, 2)}</b> · ${fx(gl, 2)} g`, sayCls(r));
    S.cam([0.6, 2.2, -8.5], [0, 1, 0], 38);
  },
});

def("childseat", {
  env: { kind: "studio" }, dur: 2.6,
  scene(S, c) {
    const st = c.st, r = c.r, p = P1(c);
    S.box(-2.6, 0, -0.5, -1.4, 0.12, 0.5, "#334155");
    S.label("kg0", [-2, 0.2, 0.55], `${st.kg} kg`, "tag");
    S.box(-2.35, 0.12, -0.35, -1.65, 0.55, 0.35, "#0ea5e9"); S.box(-2.35, 0.55, 0.2, -1.65, 1.2, 0.35, "#0ea5e9");
    S.person(-2, 0, { id: "kidcs", sit: true, y: 0.12, scale: clamp(st.kg / 15, 0.7, 1.3) });
    const n = Math.min(24, Math.max(1, Math.round(r.w / 50)));
    for (let i = 0; i < n; i++) {
      const drop = clamp(p * n * 1.1 - i, 0, 1); if (drop <= 0) continue;
      const col = i % 4, row = Math.floor(i / 4) % 3, lay = Math.floor(i / 12), y = lay * 0.33 + (1 - sm(drop)) * 2.5;
      S.box(0.6 + col * 0.62, y, -0.9 + row * 0.62, 1.15 + col * 0.62, y + 0.33, -0.4 + row * 0.62, "#f1efe6");
    }
    S.label("w", [1.8, 1.2, -0.3], `= <b>${Math.round(r.w * p)} kg</b>`, "bad big");
    S.label("d", [-2, 1.7, 0], `${st.kmh} km/h · ${Math.round(r.gs)} g`, "tag");
    S.cam([0, 3.4, 5.6], [0, 0.6, 0], 42);
  },
});

def("airbag", {
  env: { kind: "studio" }, dur: 1.8,
  scene(S, c) {
    const st = c.st, gap = st.cm / 100, wz = -0.6, p = P1(c), inf = sm(clamp((p - 0.1) / 0.3, 0, 1)), lunge = sm(clamp((p - 0.2) / 0.5, 0, 1)) * (st.belt === "yes" ? 0.06 : 0.22);
    S.box(-0.7, 0, -1.3, 0.7, 1.05, -0.75, "#475569");
    S.prim("ring", M.mul(M.t(0, 1.05, wz), M.mul(M.rx(Math.PI / 2 - 0.35), M.s(0.19, 1, 0.19))), "#111827");
    S.rod([0, 0.95, wz - 0.25], [0, 1.03, wz], 0.03, "#111827");
    if (inf > 0.02) S.prim("sph", M.mul(M.t(0, 1.08, wz + 0.25 * inf), M.s(0.32 * inf, 0.3 * inf, 0.28 * inf)), "#f8fafc", 0.85);
    S.box(-0.4, 0.75, wz, 0.4, 1.4, wz + 0.25, BAD, 0.16);
    const sz = wz + 0.1 + gap;
    S.box(-0.3, 0, sz + 0.25, 0.3, 0.45, sz + 0.75, "#94a3b8"); S.box(-0.3, 0.45, sz + 0.64, 0.3, 1.35, sz + 0.75, "#94a3b8");
    S.person(0, sz + 0.45 - lunge, { id: "abd", sit: true, y: -0.47, color: "#64748b", lean: -lunge * 2 });
    if (st.belt === "yes") S.rod([0.22, 1.4, sz + 0.5 - lunge], [-0.2, 0.62, sz + 0.35], 0.025, "#f97316");
    if (inf > 0.5 && st.cm < 25) S.glow([0, 1.25, wz + 0.4], 0.9, [1, 0.3, 0.1]);
    S.rod([0.55, 0.3, wz], [0.55, 0.3, sz], 0.012, "#facc15");
    S.label("g", [0.55, 0.42, (wz + sz) / 2], `<b>${st.cm} cm</b>`, sayCls(c.r));
    S.label("z", [0, 1.55, wz + 0.12], `${tt("abgZone")} 25 cm`, "bad");
    S.cam([3.1, 1.9, 1.9], [0, 0.85, -0.1], 40);
  },
});

def("hotcar", {
  env: { kind: "open" }, dur: 4,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, p = P1(c), mins = st.min * p, tNow = r.T0(mins);
    S.car(0, 0, { color: "#64748b", yaw: 0.3 });
    if (st.shade === "yes") { S.mesh("tree", () => K.broadTree(11), M.trs(-3.5, 0, -1, 0, 1.3)); S.shadow(-1.2, -0.5, 4, 4, 0, 0.45); }
    else S.glow([-30, 40, -80], 14, [1, 0.85, 0.45]);
    for (let i = 0; i < 6; i++) { const ph = (c.time * 0.5 + i / 6) % 1; S.box(-1 + i * 0.35, 1.5 + ph * 1.2, -1.6, -0.9 + i * 0.35, 1.52 + ph * 1.2, 1.6, "#fde68a", 0.08 * (1 - ph) * (tNow / 50)); }
    const Y = (tc) => 0.3 + (tc - 15) / 55 * 3.2, x = 3.2;
    S.cyl(x, 0.3, 0, 0.16, 3.3, "#e2e8f0", 0.35);
    S.sph(x, 0.25, 0, 0.26, BAD);
    S.cyl(x, 0.3, 0, 0.09, Y(tNow) - 0.3, tNow >= 45 ? BAD : tNow >= 38 ? "#f97316" : WARN);
    S.cyl(x, Y(45), 0, 0.2, Y(70) - Y(45), BAD, 0.15);
    S.cyl(x, Y(st.amb), 0, 0.2, 0.03, "#38bdf8");
    S.label("in", [x + 0.5, Y(tNow), 0], `🌡 <b>${Math.round(tNow)} °C</b>`, tNow >= 45 ? "bad" : tNow >= 38 ? "warn" : "good");
    S.label("min", [0, 2.2, 0], `⏱ ${Math.round(mins)} min`, "big");
    S.cam([8.5, 3.8, 7], [1.2, 1.3, 0], 40);
  },
});

/* =================== VEHICLE & ENGINE =================== */

def("engine", {
  env: { kind: "studio" },
  playing: () => !!(Labs.eng && Labs.eng.tl),
  scene(S, c) {
    const theta = c.theta, a = (theta % 360) * Math.PI / 180, K1 = 0.01;
    const crankR = 44 * K1, rodL = 150 * K1, cy = 0.4;
    const px = Math.sin(a) * crankR, py = cy + Math.cos(a) * crankR;
    const pinY = py + Math.sqrt(rodL * rodL - px * px), top = cy + (290 - 48) * K1;
    const t = ((theta % 720) + 720) % 720, stroke = Math.floor(t / 180);
    const inOpen = stroke === 0 ? Math.sin((t / 180) * Math.PI) * 0.1 : 0, exOpen = stroke === 3 ? Math.sin(((t - 540) / 180) * Math.PI) * 0.1 : 0;
    const gasC = ["#38bdf8", "#f59e0b", t < 400 ? "#ef4444" : "#fb923c", "#9ca3af"][stroke];
    S.cyl(0, pinY + 0.17, 0, 0.52, top - pinY - 0.17, gasC, 0.35);
    S.cyl(0, pinY - 0.17, 0, 0.53, 0.34, "#cbd5e1");
    [0.06, 0.12, 0.18].forEach((d) => S.cyl(0, pinY + 0.17 - d, 0, 0.535, 0.015, "#475569"));
    S.rod([0, pinY, 0], [0, py, px], 0.06, "#94a3b8");
    S.prim("cyl", M.mul(M.t(-0.12, cy, 0), M.mul(M.rz(Math.PI / 2), M.s(0.5, 0.24, 0.5))), "#64748b");
    S.prim("cyl", M.mul(M.t(-0.3, cy, 0), M.mul(M.rz(Math.PI / 2), M.s(0.09, 0.8, 0.09))), "#475569");
    S.sph(0, py, px, 0.07, "#e2e8f0");
    S.cyl(0, 0.3, 0, 0.62, top - 0.3, "#64748b", 0.18);
    S.box(-0.7, top, -0.7, 0.7, top + 0.35, 0.7, "#475569", 0.55);
    [[-0.22, inOpen, "#38bdf8"], [0.22, exOpen, "#9ca3af"]].forEach(([z, o, cc]) => { S.cyl(0, top - 0.04 - o, z, 0.15, 0.04, "#e2e8f0"); S.cyl(0, top - o, z, 0.025, 0.5, "#e2e8f0"); S.prim("cyl", M.mul(M.t(0, top + 0.15, z), M.mul(M.rx(z < 0 ? 0.9 : -0.9), M.s(0.12, 0.7, 0.12))), cc, 0.5); });
    S.cyl(0, top, 0, 0.03, 0.4, "#f8fafc");
    if (stroke === 2 && t < 380) S.glow([0, top - 0.05, 0], 0.8, [1, 0.9, 0.5]);
    S.label("s", [0, top + 0.7, 0], `${stroke + 1}. <b>${tt("st_" + ["intake", "compression", "power", "exhaust"][stroke])}</b>`, "big");
    S.cam([3.6, 2.6, 3.2], [0, 1.35, 0], 40);
  },
});

def("gears", {
  env: { kind: "road", length: 160 }, dur: 3.2,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, p = P1(c), k = sm(p), v = st.kmh * k, sp = v / 3.6, rpm = r.rpm * k;
    const z = c.idle ? 0 : 10 - 30 * p * p;
    S.car(LL, z, { color: YOU });
    for (let i = 0; i < 10; i++) { const zz = 8 - ((c.time * sp + i * 7) % 70); if (sp > 0.5) S.line([LL - 1.3, 0.3 + (i % 3) * 0.35, zz], [LL - 1.3, 0.3 + (i % 3) * 0.35, zz + 1 + sp * 0.05], "#e2e8f0", 0.6); }
    if (rpm > 4500 && Math.sin(c.time * 40) > 0) S.sph(LL + 0.5, 0.3, z + 2.4, 0.12, "#cbd5e1", 0.4);
    const dc = [LL + 0.2, 3.4, z];
    dial(S, "t", dc, 1.3, 7000, 1000, 6000, 1200, "k");
    needle(S, dc, rpm, 7000, 1.05, "#ef4444");
    S.label("rpm", [dc[0] + 0.1, dc[1] - 0.55, dc[2]], `<b>${Math.round(rpm / 10) * 10}</b> rpm`, sayCls(r));
    S.label("gear", [dc[0], dc[1] + 1.65, dc[2]], `${tt("grGear")} <b>${st.gear}</b> · ${Math.round(v)} km/h`, "big");
    S.cam([11, 3.6, z + 1.5], [LL, 2, z], 42);
  },
});

def("economy", {
  env: { kind: "road", length: 200 }, dur: 3.2,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, p = P1(c), k = sm(p), sp = st.kmh / 3.6 * k;
    S.car(LL, 0, { color: YOU });
    if (st.load === "roof") S.box(LL - 0.6, 1.47, -0.6, LL + 0.6, 1.85, 0.9, "#111827");
    if (st.load === "full") [[-0.35, -0.3], [0.35, -0.3], [-0.35, 0.65], [0.35, 0.65]].forEach(([x, z]) => S.sph(LL + x, 1.2, z, 0.12, "#7c5a3a"));
    if (st.ac === "on") S.glow([LL, 1.1, -1.9], 1, [0.3, 0.6, 1]);
    for (let i = 0; i < 14; i++) { const z = -6 + ((c.time * sp * 0.4 + i * 1.3) % 12), y = 0.9 + (i % 4) * 0.25 + (Math.abs(z) < 2 ? 0.55 : 0); if (sp > 0.5) S.line([LL - 0.6 + (i % 5) * 0.3, y, z], [LL - 0.6 + (i % 5) * 0.3, y, z + 0.6], "#bae6fd", 0.55); }
    for (let i = 0; i < 10; i++) { const zz = 8 - ((c.time * sp + i * 7) % 70); if (sp > 0.5) S.line([LL - 1.3, 0.3 + (i % 3) * 0.35, zz], [LL - 1.3, 0.3 + (i % 3) * 0.35, zz + 1], "#e2e8f0", 0.5); }
    const ratio = r.cur / (fuelL100(r.best, st) || r.cur), h = clamp(ratio, 0.5, 2.5) * 1.4 * k;
    S.cyl(2.6, 0, 0, 0.32, Math.max(0.02, h), ratio > 1.2 ? WARN : GOOD, 0.9);
    S.label("f", [2.6, h + 0.4, 0], `⛽ <b>${fx(r.cur)} L/100 km</b> · ${Math.round(st.kmh * k)} km/h`, sayCls(r));
    S.label("b", [2.6, 0.3, 1.2], `${tt("ecBest")} ≈ ${r.best} km/h`, "tag");
    S.cam([9, 4.2, 7], [0.4, 1, 0], 40);
  },
});
const fuelL100 = (kmh, st) => {
  const V = Math.max(kmh, 10) / 3.6, m = 1100 + (st.load === "full" ? 300 : st.load === "roof" ? 380 : 80);
  const CdA = 0.68 + (st.load === "roof" ? 0.15 : 0), acc = 1200 + (st.ac === "on" ? 1500 : 0);
  return ((0.5 * 1.2 * CdA * V * V + 0.011 * m * 9.81) / 0.25 + acc / 0.25 / V) * 1e5 / 34.2e6;
};

def("drag", {
  env: { kind: "studio" }, dur: 3.2,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, p = P1(c), k = sm(p), sp = st.kmh / 30 * k;
    S.car(0, 0, { color: "#e5e7eb" });
    if (st.shape === "roof") S.box(-0.6, 1.47, -0.6, 0.6, 1.85, 0.9, "#111827");
    if (st.shape === "open") [-0.9, 0.9].forEach((x) => S.box(x - 0.02, 1.0, -0.6, x + 0.02, 1.32, 0.9, "#0b0b0c"));
    const rough = st.shape === "closed" ? 0.15 : st.shape === "open" ? 0.45 : 0.8;
    for (let i = 0; i < 22; i++) {
      const lane = (i % 11) - 5, y0 = 0.25 + Math.floor(i / 11) * 0.9 + Math.abs(lane) * 0.02, x = lane * 0.32;
      const ph = (c.time * sp * 0.35 + i * 0.173) % 1, z = -6 + ph * 12;
      const prof = (zz) => (Math.abs(zz) < 2.3 && Math.abs(x) < 1 ? 1.5 - y0 * 0.2 + 0.2 : 0);
      const y = y0 + (y0 < 1.5 ? prof(z) * (1 - Math.abs(x) * 0.5) * 0.8 : 0) + (z > 2.2 ? Math.sin(z * 6 + i) * rough * 0.25 : 0);
      if (sp > 0.05) S.line([x, y, z], [x, y, z + 0.5 + sp * 0.12], z > 2.2 ? "#fca5a5" : "#7dd3fc", 0.8);
    }
    const tot = r.d + r.rr, hA = r.d / 30 * k ** 3, hB = r.rr / 30 * k;
    S.cyl(2.6, 0, 0, 0.3, Math.max(0.02, hB), WARN, 0.9); S.cyl(2.6, hB, 0, 0.3, Math.max(0.02, hA), "#38bdf8", 0.9);
    S.label("p", [2.6, hA + hB + 0.35, 0], `<b>${fx(tot * (k ** 3 * r.d + k * r.rr) / tot)} kW</b> · ${tt("drAir")} ${Math.round(r.d / tot * 100)}%`, "good");
    S.label("v", [0, 2.4, 0], `${Math.round(st.kmh * k)} km/h`, "big");
    S.cam([6.5, 3.2, 6.5], [0.6, 0.8, 0], 40);
  },
});

def("regen", {
  env: { kind: "road", length: 120 }, dur: 3.4,
  scene(S, c) {
    S.live();
    const st = c.st, r = c.r, eff = st.eff / 100, p = P1(c), braking = !c.idle && p < 1, z = c.idle ? 0 : 14 - 14 * (1 - (1 - p) ** 2);
    S.car(LL, z, { color: "#0f766e", brake: braking });
    S.box(LL - 0.7, 0.32, z - 1, LL + 0.7, 0.48, z + 1, "#0b1220", 0.6);
    const fill = 0.3 + (clamp(0.3 + eff * 0.6, 0, 1) - 0.3) * p;
    S.box(LL - 0.65, 0.33, z - 0.95, LL - 0.65 + 1.3 * fill, 0.47, z + 0.95, GOOD, 0.85);
    if (braking || c.idle) [[-0.8, -1.33], [0.8, -1.33], [-0.8, 1.32], [0.8, 1.32]].forEach(([x, zz], i) => {
      S.glow([LL + x * 1.15, 0.33, z + zz], 0.35 + (1 - eff) * 0.9, [1 * (1 - eff) + 0.1, 0.35 * (1 - eff), 0.05]);
      for (let k = 0; k < 3; k++) { const ph = (c.time * 1.2 + k / 3 + i * 0.21) % 1; S.sph(LL + x * (1 - ph), 0.4, z + zz * (1 - ph), 0.04, GOOD, eff * (1 - ph)); }
    });
    S.label("b", [LL, 2.2, z], `🔋 <b>${Math.round(r.back * p)} Wh</b> · 🔥 ${Math.round((r.wh - r.back) * p)} Wh`, "good");
    S.cam([6, 3.2, 5.5], [LL, 0.6, 0], 40);
  },
});

def("ghat", {
  env: { kind: "open" }, dur: 4.5,
  scene(S, c) {
    const st = c.st, r = c.r, base = M.mul(M.t(0, 0, -10), M.rx(-0.32)), p = P1(c);
    S.prim("cube", M.mul(base, M.mul(M.t(0, -1, 0), M.s(70, 2, 76))), "#5b8c3a");
    const pts = [[-24, 30], [22, 22], [-22, 8], [22, -6], [-22, -20], [20, -32]];
    const segs = []; let total = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, -(z1 - z0));
      S.prim("cube", M.mul(base, M.mul(M.trs((x0 + x1) / 2, 0.03, (z0 + z1) / 2, yaw), M.s(6, 0.06, len + 6))), "#3b3d40");
      segs.push({ x0, z0, x1, z1, len, yaw, from: total }); total += len;
    }
    const d = (c.idle ? 0.5 : p) * total, sg = segs.find((s) => d <= s.from + s.len) || segs[segs.length - 1], q = clamp((d - sg.from) / sg.len, 0, 1);
    const cx = sg.x0 + (sg.x1 - sg.x0) * q, cz = sg.z0 + (sg.z1 - sg.z0) * q;
    S.car(cx, cz, { kind: st.veh === "bus" ? "bus" : "car", color: st.veh === "bus" ? "#b91c1c" : YOU, yaw: sg.yaw, base: M.mul(base, M.t(0, 0.06, 0)), brake: true, id: "gh" });
    if (st.veh === "loaded") S.prim("cube", M.mul(base, M.mul(M.trs(cx, 1.7, cz, sg.yaw), M.s(1.2, 0.4, 1.6))), "#a16207");
    const dT = r.dT * p, hh = clamp(dT / 600, 0, 1), dc = [26, 9, 14];
    S.prim("cyl", M.mul(M.t(dc[0], dc[1], dc[2]), M.mul(M.rz(Math.PI / 2), M.s(2.6, 0.3, 2.6))), "#9ca3af", 1, { tint: hh * 1.2, tintC: heat(hh) });
    S.prim("cyl", M.mul(M.t(dc[0] + 0.05, dc[1], dc[2]), M.mul(M.rz(Math.PI / 2), M.s(0.9, 0.42, 0.9))), "#475569");
    if (hh > 0.3) S.glow([dc[0] + 0.4, dc[1], dc[2]], 3 + hh * 3, [hh, hh * 0.35, 0.05]);
    S.label("t", [dc[0], dc[1] + 3.4, dc[2]], `<b>+${Math.round(dT)} °C</b>`, dT > 500 ? "bad" : dT > 250 ? "warn" : "good");
    S.label("d", [-24, 14, 18], `⛰ ${tt("ghDropShort")} ${Math.round(st.drop * p)} m`, "tag");
    S.cam([44, 26, 40], [8, 3, -2], 44);
  },
});

def("evrange", {
  env: { kind: "road", length: 200 }, dur: 4,
  scene(S, c) {
    const st = c.st, r = c.r, sc = scaler(Math.max(r.range, 100) * 1.1, 80), p = P0(c), km = r.range * p;
    const z = sc.z(km) + 6 - 8;
    S.car(LL, z, { color: "#14b8a6" });
    const lvlB = clamp(st.kwh / 80, 0.1, 1) * (1 - p);
    S.box(LL - 0.7, 2, z - 1, LL + 0.7, 2.6, z + 1, "#0b1220", 0.55);
    if (lvlB > 0.01) S.box(LL - 0.66, 2.04, z - 0.95, LL - 0.66 + 1.32 * lvlB, 2.56, z + 0.95, lvlB < 0.1 ? BAD : GOOD, 0.9);
    for (let k = 25; k < r.range; k += 25) { post(S, -4.4, sc.z(k), "#f8fafc", 1.2); S.label("k" + k, [-4.4, 1.6, sc.z(k)], `${k}`, "tiny"); }
    S.strip(LL - 0.3, sc.z(r.range), LL + 0.3, sc.z(0), "#14b8a6", 0.85);
    S.cyl(-4.4, 0, sc.z(r.range), 0.35, 2.2, "#f8fafc"); S.glow([-4.4, 2.3, sc.z(r.range)], 1.2, [0.1, 0.8, 0.6]);
    S.label("r", [-4.4, 3, sc.z(r.range)], `⚡ <b>${Math.round(r.range)} km</b>`, "big");
    S.label("u", [LL, 3, z], `${Math.round(km)} km · ${Math.round(r.wh)} Wh/km${st.ac === "yes" ? " · ❄" : ""}`, "good");
    along(S, 14, sc.z(r.range));
  },
});

def("idling", {
  env: { kind: "road", length: 80 }, dur: 4,
  scene(S, c) {
    S.live();
    const r = c.r, p = P1(c), L = r.L * p;
    S.car(LL, 0, { color: "#64748b" });
    for (let i = 0; i < 6; i++) { const ph = (c.time * 0.6 + i / 6) % 1; S.sph(LL + 0.5 + ph * 0.3, 0.3 + ph * 1.2, 2.3 + ph * 0.8, 0.08 + ph * 0.25, "#cbd5e1", 0.35 * (1 - ph)); }
    const full = Math.floor(L / 20), part = L / 20 - full, n = Math.min(full + (part > 0.02 ? 1 : 0), 40);
    for (let i = 0; i < n; i++) {
      const col = i % 8, row = Math.floor(i / 8), x = 2.2 + col * 0.42, z = -2 + row * 0.55, f = i < full ? 1 : part;
      S.box(x, 0, z, x + 0.34, 0.5, z + 0.18, "#334155", 0.35); S.box(x + 0.01, 0, z + 0.01, x + 0.33, 0.49 * f, z + 0.17, "#dc2626");
      S.box(x + 0.12, 0.5, z + 0.05, x + 0.22, 0.56, z + 0.13, "#1f2937");
    }
    S.label("l", [3.8, 1.3, -1], `⛽ <b>${Math.round(L)} L</b> · ${Math.round(L * 2.3)} kg CO₂`, sayCls(r));
    S.cam([7.5, 4.4, 7], [1.6, 0.4, -0.5], 40);
  },
});

def("coasting", {
  env: { kind: "road", length: 200 }, dur: 5,
  scene(S, c) {
    const r = c.r, pts = r.pts;
    if (!pts || !pts.length) return;
    const span = Math.max(r.x, 50) * 1.05, sc = scaler(span, 75), T = pts.length - 1, ph = P0(c);
    const fi = clamp(ph, 0, 1) * T, i0 = clamp(Math.floor(fi), 0, T), i1 = Math.min(T, i0 + 1), w = fi - i0;
    const m = pts[i0][0] * (1 - w) + pts[i1][0] * w, v = pts[i0][1] * (1 - w) + pts[i1][1] * w;
    const stepM = span > 260 ? 100 : 50;
    for (let d = stepM; d < span; d += stepM) { post(S, -4.4, sc.z(d), "#f8fafc", 1.1); S.label("m" + d, [-4.4, 1.5, sc.z(d)], `${d} m`, "tiny"); }
    S.car(LL, sc.z(m) + 2.1, { color: YOU });
    S.strip(LL - 0.3, sc.z(r.x), LL + 0.3, sc.z(0), GOOD, 0.5);
    S.label("v", [LL, 2.3, sc.z(m) + 2.1], `<b>${Math.round(v)} km/h</b>`, "good");
    S.label("x", [LL, 0.6, sc.z(r.x)], r.stops ? `${tt("coDist")} <b>${Math.round(r.x)} m</b>` : tt("coNoStop"), sayCls(r));
    along(S, 12, sc.z(span));
  },
});

def("tyresize", {
  env: { kind: "studio" }, dur: 3,
  scene(S, c) {
    const st = c.st, r = c.r, R0 = 0.33, R1 = R0 * (1 + st.pct / 100), p = P1(c), rot = 2 * Math.PI * p;
    const c0 = 2 * Math.PI * R0, c1 = 2 * Math.PI * R1;
    S.dyn("t0", "a", () => tyreMesh(R0, 0.2, 0.007), M.mul(M.t(-0.5, R0, -c0 * p), M.rx(-rot)));
    S.dyn("t1", "b" + st.pct, () => tyreMesh(R1, 0.2, 0.007), M.mul(M.t(0.5, R1, -c1 * p), M.rx(-rot)));
    S.strip(-0.62, -c0 * p, -0.38, 0, "#94a3b8", 0.85); S.strip(0.38, -c1 * p, 0.62, 0, st.pct > 0 ? WARN : st.pct < 0 ? BRAKE : GOOD, 0.85);
    S.label("a", [-0.5, 0.05, -c0], `${fx(c0, 2)} m`, "tag"); S.label("b", [0.5, 0.05, -c1], `${fx(c1, 2)} m`, "tag");
    const dc = [1.6, 1.25, -0.6];
    dial(S, "s", dc, 0.75, 160, 20, null, null, 2);
    needle(S, dc, st.kmh * sm(p), 160, 0.6, "#94a3b8", 0.03); needle(S, dc, r.v * sm(p), 160, 0.62, "#ef4444");
    S.label("v", [dc[0] + 0.1, dc[1] - 0.95, dc[2]], `${tt("tsShown")} ${st.kmh} · <b>${fx(r.v, 1)} km/h</b>`, sayCls(r));
    S.cam([3.6, 1.9, 2.6], [0.6, 0.6, -0.6], 42);
  },
});

/* =================== TRAFFIC & PLANNING =================== */

def("overtaking", {
  env: { kind: "road", length: 220 }, dur: 5,
  scene(S, c) {
    const st = c.st, r = c.r, tl = st.len / 8, TL = st.len / 2, CL = 2.2;   // half lengths (m)
    if (r.never) {
      S.car(LL, -2, { kind: "truck", color: "#a16207", id: "ov", post: M.s(1, 1, tl), lenScale: tl, shadow: false });
      S.shadow(LL, -2, 1.6, 4.8 * tl);
      S.car(LL, -2 + TL + 20 + CL, { color: YOU });
      S.label("n", [LL, 3, 0], `✕ ${tt("ovNever")}`, "bad big"); along(S, 20, -40); return;
    }
    /* the manoeuvre in real metres relative to the lorry: start 20 m behind
       it, finish 20 m ahead of it; out in the right lane only while
       alongside (plus a safety margin) */
    const p = P0(c), tau = r.t * p, vt = st.truck / 3.6, vo = st.onc / 3.6, dv = (st.you - st.truck) / 3.6;
    const start = -(20 + TL + CL), rel = start + dv * tau;                 // our centre minus lorry centre (m, +ahead)
    const clear = TL + CL + 4, lane = 1 - sm((Math.abs(rel) - clear) / 9);
    const sc = scaler(Math.max(r.need, 120) * 1.05, 80), z0 = 2;
    const truckZ = z0 - vt * tau * sc.k - TL, youZ = truckZ - rel, x = LL + (LR - LL) * lane;
    const head = !c.idle && p > 0 && p < 1 ? (Math.abs(rel) > clear ? 0.12 * Math.sign(-rel) * (lane > 0.02 && lane < 0.98 ? 1 : 0) : 0) : 0;
    S.car(LL, truckZ, { kind: "truck", color: "#a16207", id: "ov", post: M.s(1, 1, tl), lenScale: tl, shadow: false });
    S.shadow(LL, truckZ, 1.6, 4.8 * tl);
    S.car(x, youZ, { color: YOU, yaw: head });
    const vy = st.you / 3.6, D = Math.max(0, r.need - (vy + vo) * tau);   // real gap to the oncoming car
    const oncZ = youZ - 2 * CL - 0.3 - D * sc.k;
    S.car(LR, oncZ, { yaw: Math.PI, color: "#e2e8f0" });
    S.strip(LR - 0.35, z0 - r.need * sc.k, LR + 0.35, z0, r.need > 400 ? BAD : GOOD, 0.55);
    S.label("n", [LR, 2.3, z0 - r.need * sc.k], `${tt("ovNeed")} <b>${Math.round(r.need)} m</b> · ${fx(r.t)} s`, sayCls(r));
    S.cam([9, 9, youZ + 16], [0, 0, youZ - 18], 44);
  },
});

def("traveltime", {
  env: { kind: "road", length: 260 }, dur: 4,
  scene(S, c) {
    const st = c.st, r = c.r, fast = Math.max(st.fast, st.slow), L1 = 90, p = P0(c);
    const df = Math.min(1, p / 0.75), ds = Math.min(1, df * st.slow / fast);
    const zs = 8 - L1 * ds, zf = 8 - L1 * df;
    S.strip(-3.6, -L1 + 8 - 0.3, 3.6, -L1 + 8 + 0.3, "#f8fafc", 0.95);
    S.car(LL, zs, { color: "#94a3b8" }); S.car(LR, zf, { color: YOU });
    S.strip(LL - 0.25, zs - 2.2 - r.sa * 0.5, LL + 0.25, zs - 2.2, GOOD, 0.75);
    S.strip(LR - 0.25, zf - 2.2 - r.sb * 0.5, LR + 0.25, zf - 2.2, BAD, 0.75);
    S.label("a", [LL, 2.2, zs], `${st.slow} km/h · <b>${Math.round(r.a)} min</b>`, "good");
    S.label("b", [LR, 2.2, zf], `${fast} km/h · <b>${Math.round(r.b)} min</b>`, "warn");
    S.label("s", [0, 4, -L1 + 8], `🏁 ${tt("ttSaved")} <b>${Math.round(r.a - r.b)} min</b> / ${st.km} km`, "big");
    along(S, 14, -L1 + 8);
  },
});

const WB = { car: 2.6, bus: 6.0, truck: 7.5 };
def("offtracking", {
  env: { kind: "open" }, dur: 3.6,
  scene(S, c) {
    const st = c.st, r = c.r, Rf = r.Rf, rr = r.rr, p = P1(c), aEnd = c.idle ? Math.PI / 2 : Math.PI / 2 * p, aCar = c.idle ? Math.PI / 4 : aEnd;
    S.dyn("j", "j", () => { const b = new B(); b.flat(-4, -60, 40, 4, 0.002, K.C.tarmac, -3, 0.12); b.flat(-60, -40, -4, -4, 0.002, K.C.tarmac, -3, 0.12); return b; }, M.t(0, 0, 0));
    S.cyl(0, 0, 0, 3, 0.15, "#a8a29e");
    S.box(-60, 0, -3, 0, 0.15, 4, "#a8a29e"); S.box(-3, 0, -0.01, 4, 0.15, 4, "#a8a29e");
    const arc = (rad, color) => { for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI / 2; if (a > aEnd + 1e-3) break; S.cyl(rad * Math.cos(a), 0.01, -rad * Math.sin(a), 0.12, 0.02, color, 0.95); } };
    arc(Rf, GOOD); arc(rr, BAD);
    const fxA = Rf * Math.cos(aCar), fzA = -Rf * Math.sin(aCar), yaw = -aCar, dir = [Math.sin(yaw), -Math.cos(yaw)];
    const kind = st.veh, L = { car: 4.2, bus: 10.5, truck: 8 }[kind], off = L / 2 - (kind === "car" ? 1.3 : 1.6);
    S.car(fxA - dir[0] * off, fzA - dir[1] * off, { kind, yaw, color: kind === "bus" ? "#b91c1c" : kind === "truck" ? "#0f766e" : YOU, id: "ot" });
    const bR = Math.max(rr - 1.2, 4.5), bA = Math.PI / 4.6;
    S.car(bR * Math.cos(bA), -bR * Math.sin(bA), { kind: "cycle", yaw: -bA, id: "otc" });
    S.ring(bR * Math.cos(bA), -bR * Math.sin(bA), 1, r.cut > 1 ? BAD : GOOD, 0.95);
    S.label("c", [rr * 0.7, 0.5, -rr * 0.7], `${tt("otCut")} <b>${fx(r.cut)} m</b>`, sayCls(r));
    S.label("f", [Rf + 0.5, 0.3, -2], tt("otFront"), "good"); S.label("r", [rr * 0.95, 0.3, -2], tt("otRear"), "bad");
    S.cam([Rf * 0.6 + 10, Rf * 0.6 + 12, 14], [Rf * 0.5, 0, -Rf * 0.4], 44);
  },
});

def("trafficwave", {
  env: { kind: "open" },
  hold: 4,
  scene(S, c) {
    S.live();
    const cars = c.cars || [], RING = 360, rad = RING / (2 * Math.PI);
    S.dyn("ring", "r", () => { const b = new B(), n = 96; for (let i = 0; i < n; i++) { const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2;
      const q = (r0, r1, y, col, pat) => b.quad([Math.cos(a0) * r0, y, Math.sin(a0) * r0], [Math.cos(a0) * r1, y, Math.sin(a0) * r1], [Math.cos(a1) * r1, y, Math.sin(a1) * r1], [Math.cos(a1) * r0, y, Math.sin(a1) * r0], col, pat, 0.12, [0, 1, 0]);
      q(rad - 3, rad + 3, 0.002, K.C.tarmac, -3); q(rad - 3.2, rad - 3, 0.012, K.C.white, 0); q(rad + 3, rad + 3.2, 0.012, K.C.white, 0); } return b; }, M.t(0, 0, 0));
    const pal = ["#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e"];
    cars.forEach((cr) => { const a = cr.x / RING * Math.PI * 2, sp = clamp(cr.v / 20, 0, 1); S.car(Math.cos(a) * rad, Math.sin(a) * rad, { yaw: Math.PI - a, color: pal[Math.min(5, Math.floor(sp * 6))], brake: cr.a < -0.5, id: "tw" }); });
    const avg = cars.length ? cars.reduce((t, cr) => t + cr.v, 0) / cars.length * 3.6 : 0;
    S.label("a", [0, 3, 0], `<b>${Math.round(avg)} km/h</b>`, "big");
    S.cam([0, 64, 52], [0, 0, 2], 46);
  },
});

/* the gap drill (following) and the sign lab have their own canvases */
})();
