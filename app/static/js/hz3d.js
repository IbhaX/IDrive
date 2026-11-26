/* iDrive hz3d.js — 3D renderer for the hazard-perception scenes.
   A small self-contained WebGL2 engine (no CDN, works offline): procedural
   low-poly vehicles, people and roadside scenery, sun + sky lighting, night
   lamps and headlights, rain and fog, soft contact shadows, a rear-view mirror
   and a tap-to-pick test. Scenes come from the same scenario data as the 2D
   view (scenarios.json): x/y are the 400×600 top-down units, ego car at
   (150, 500) facing up. hazard.js owns the timeline and writes actor positions
   into a shared state object; this file only draws it.

   Hz3D.supported() → bool
   Hz3D.mount(canvas, scenario, state, opts) → { view(k), speed(v, secs),
     pick(clientX, clientY) → actor id | null, shake(), destroy() }            */
(() => {
"use strict";

/* ---------- world mapping (metres) ---------- */
const SX = 0.035, SZ = 0.07;               // lane ≈ 3.5 m wide, 600 units ≈ 42 m of road
const WX = (x) => (x - 200) * SX, WZ = (y) => (y - 300) * SZ;
const EGO = { x: WX(150), z: WZ(500) };
const ROAD = 3.5, WALK = 4.9;               // half road width, outer edge of the footpath
const BASE_MS = 12.4;                       // scenery speed at timeScale 1 (≈ 45 km/h)

/* ---------- colour ---------- */
const lin = (h) => {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2));
};
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const shade = (c, k) => c.map((v) => v * k);
const hashStr = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/* ---------- 4×4 matrices (column-major) ---------- */
const M = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / Math.tan(fovy / 2), m = new Float32Array(16);
    m[0] = t / asp; m[5] = t; m[10] = (f + n) / (n - f); m[11] = -1; m[14] = 2 * f * n / (n - f);
    return m;
  },
  look(e, t, up) {
    let z = [e[0] - t[0], e[1] - t[1], e[2] - t[2]]; z = norm(z);
    let x = norm(cross(up, z)); const y = cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
  },
  /* T · Ry · S — yaw 0 faces −Z, positive yaw turns towards +X */
  trs(x, y, z, yaw, s = 1) {
    const c = Math.cos(yaw) * s, n = Math.sin(yaw) * s;
    return new Float32Array([c, 0, n, 0, 0, s, 0, 0, -n, 0, c, 0, x, y, z, 1]);
  },
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
  t(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
  s(x, y, z) { return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]); },
  apply(m, p) { return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]]; },
};
function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

/* ---------- mesh builder ----------
   vertex = pos(3) normal(3) colour(3) material(2): mat.x = emissive kind or
   ground pattern (negative), mat.y = specular strength.
   Emissive kinds: .25 always-on panel, .5 lamp/window (night), .75 headlight,
   1 tail/brake light. Patterns: −1 kerb stripes, −2 lane dash, −3 tarmac,
   −4 grass, −5 paddy, −6 paving. */
class B {
  constructor() { this.v = []; this.x = null; }
  with(m, fn) { const o = this.x; this.x = o ? M.mul(o, m) : m; fn(this); this.x = o; return this; }
  P(p) { if (!this.x) return p; const r = M.apply(this.x, [p[0], p[1], p[2], 1]); return [r[0], r[1], r[2]]; }
  N(n) { if (!this.x) return n; const m = this.x; return norm([m[0] * n[0] + m[4] * n[1] + m[8] * n[2], m[1] * n[0] + m[5] * n[1] + m[9] * n[2], m[2] * n[0] + m[6] * n[1] + m[10] * n[2]]); }
  vert(p, n, c, e, s) { p = this.P(p); n = this.N(n); this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], e, s); }
  tri(a, b, c, col, e = 0, s = 0.15, na, nb, nc) {
    const fn = na ? null : norm(cross(sub(b, a), sub(c, a)));
    this.vert(a, na || fn, col, e, s); this.vert(b, nb || fn, col, e, s); this.vert(c, nc || fn, col, e, s);
  }
  quad(a, b, c, d, col, e, s, n) { this.tri(a, b, c, col, e, s, n, n, n); this.tri(a, c, d, col, e, s, n, n, n); }
  /* axis-aligned box from (x0,y0,z0) to (x1,y1,z1) */
  box(x0, y0, z0, x1, y1, z1, col, e = 0, s = 0.12) {
    const q = (a, b, c, d, n) => this.quad(a, b, c, d, col, e, s, n);
    q([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0]);
    q([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0]);
    q([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    q([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    q([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    q([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    return this;
  }
  /* centred box: centre x/z, bottom y */
  cb(cx, y0, cz, w, h, d, col, e, s) { return this.box(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, col, e, s); }
  /* cylinder along an axis; smooth sides, flat caps */
  cyl(cx, cy, cz, r, len, axis, seg, col, e = 0, s = 0.15, cap) {
    const P = (a, t) => { const u = Math.cos(a) * r, w = Math.sin(a) * r;
      return axis === "x" ? [cx + t, cy + u, cz + w] : axis === "z" ? [cx + u, cy + w, cz + t] : [cx + u, cy + t, cz + w]; };
    const Nn = (a) => { const u = Math.cos(a), w = Math.sin(a); return axis === "x" ? [0, u, w] : axis === "z" ? [u, w, 0] : [u, 0, w]; };
    const h0 = axis === "y" ? 0 : -len / 2, h1 = axis === "y" ? len : len / 2;
    const ax = axis === "x" ? [1, 0, 0] : axis === "z" ? [0, 0, 1] : [0, 1, 0];
    const c0 = axis === "x" ? [cx + h0, cy, cz] : axis === "z" ? [cx, cy, cz + h0] : [cx, cy + h0, cz];
    const c1 = axis === "x" ? [cx + h1, cy, cz] : axis === "z" ? [cx, cy, cz + h1] : [cx, cy + h1, cz];
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
      const p00 = P(a, h0), p01 = P(a, h1), p10 = P(b, h0), p11 = P(b, h1);
      this.tri(p00, p10, p11, col, e, s, Nn(a), Nn(b), Nn(b));
      this.tri(p00, p11, p01, col, e, s, Nn(a), Nn(b), Nn(a));
      this.tri(c1, p01, p11, cap || col, e, s, ax, ax, ax);
      this.tri(c0, p10, p00, cap || col, e, s, ax, ax, ax);
    }
    return this;
  }
  /* tapered cylinder / cone along y from y0 (radius r0) to y1 (radius r1) */
  cone(cx, y0, cz, r0, y1, r1, seg, col, e = 0, s = 0.1) {
    for (let i = 0; i < seg; i++) {
      const a = i / seg * Math.PI * 2, b = (i + 1) / seg * Math.PI * 2;
      const A0 = [cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0], B0 = [cx + Math.cos(b) * r0, y0, cz + Math.sin(b) * r0];
      const A1 = [cx + Math.cos(a) * r1, y1, cz + Math.sin(a) * r1], B1 = [cx + Math.cos(b) * r1, y1, cz + Math.sin(b) * r1];
      const sl = (r0 - r1) / (y1 - y0);
      const na = norm([Math.cos(a), sl, Math.sin(a)]), nb = norm([Math.cos(b), sl, Math.sin(b)]);
      this.tri(A0, B0, B1, col, e, s, na, nb, nb); this.tri(A0, B1, A1, col, e, s, na, nb, na);
      if (r1 > 0.001) this.tri([cx, y1, cz], A1, B1, col, e, s, [0, 1, 0], [0, 1, 0], [0, 1, 0]);
      this.tri([cx, y0, cz], B0, A0, col, e, s, [0, -1, 0], [0, -1, 0], [0, -1, 0]);
    }
    return this;
  }
  /* ellipsoid; flat=true gives faceted (stylised foliage) */
  sph(cx, cy, cz, rx, ry, rz, col, seg = 10, flat = false, e = 0, s = 0.2) {
    const rows = Math.max(3, seg >> 1);
    const pt = (i, j) => { const th = i / rows * Math.PI, ph = j / seg * Math.PI * 2;
      const n = [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)];
      return [[cx + n[0] * rx, cy + n[1] * ry, cz + n[2] * rz], norm([n[0] / rx, n[1] / ry, n[2] / rz])]; };
    for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) {
      const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
      if (flat) { this.tri(a[0], b[0], c[0], col, e, s); this.tri(a[0], c[0], d[0], col, e, s); }
      else { this.tri(a[0], b[0], c[0], col, e, s, a[1], b[1], c[1]); this.tri(a[0], c[0], d[0], col, e, s, a[1], c[1], d[1]); }
    }
    return this;
  }
  /* side profile [[z, y], …] (star-shaped) extruded across x0..x1 */
  ext(prof, x0, x1, col, e = 0, s = 0.25, capCol) {
    let cz = 0, cy = 0; prof.forEach((p) => { cz += p[0]; cy += p[1]; }); cz /= prof.length; cy /= prof.length;
    for (let i = 0; i < prof.length; i++) {
      const p = prof[i], q = prof[(i + 1) % prof.length];
      const dz = q[0] - p[0], dy = q[1] - p[1];
      let n = norm([0, -dz, dy]);
      const mz = (p[0] + q[0]) / 2 - cz, my = (p[1] + q[1]) / 2 - cy;
      if (n[2] * mz + n[1] * my < 0) n = [0, -n[1], -n[2]];
      this.quad([x0, p[1], p[0]], [x1, p[1], p[0]], [x1, q[1], q[0]], [x0, q[1], q[0]], col, e, s, n);
      this.tri([x0, cy, cz], [x0, p[1], p[0]], [x0, q[1], q[0]], capCol || col, e, s, [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]);
      this.tri([x1, cy, cz], [x1, q[1], q[0]], [x1, p[1], p[0]], capCol || col, e, s, [1, 0, 0], [1, 0, 0], [1, 0, 0]);
    }
    return this;
  }
  /* flat ground rectangle at height y, optional pattern code */
  flat(x0, z0, x1, z1, y, col, pat = 0, s = 0.05) { this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], col, pat, s, [0, 1, 0]); return this; }
}

/* ---------- palette ---------- */
const C = {
  tyre: lin("#141414"), rim: lin("#9ca3af"), glass: lin("#1b2733"), glassL: lin("#2b3b4a"), chrome: lin("#cbd5e1"),
  dark: lin("#1f2328"), plate: lin("#f3f4f6"), plateY: lin("#facc15"), head: lin("#fff6dc"), tail: lin("#e0112b"),
  amber: lin("#ffb020"), skin: [lin("#8d5524"), lin("#a0673a"), lin("#c68642"), lin("#6b4226")],
  hair: [lin("#121212"), lin("#1e1a17"), lin("#2b2420"), lin("#5b5550")],
  tarmac: lin("#3b3d40"), walk: lin("#a8a29e"), kerb: lin("#ededed"), grass: lin("#5b8c3a"), soil: lin("#8a6a46"),
  white: lin("#f2f2f2"), yellow: lin("#f5c400"), concrete: lin("#b9b4aa"),
};
const SHIRTS = ["#f97316", "#38bdf8", "#f43f5e", "#84cc16", "#e879f9", "#facc15", "#2dd4bf", "#ffffff", "#6366f1", "#fb923c"].map(lin);
const PANTS = ["#1e293b", "#334155", "#3f3f46", "#1e3a8a", "#57534e"].map(lin);
const SAREE = ["#be123c", "#7c3aed", "#0f766e", "#c2410c", "#db2777", "#15803d"].map(lin);

/* ---------- vehicle & figure models (facing −Z, origin on the ground) ---------- */
function wheel(b, x, y, z, r, w) {
  b.cyl(x, y, z, r, w, "x", 14, C.tyre, 0, 0.05);
  b.cyl(x + (x > 0 ? w / 2 : -w / 2), y, z, r * 0.58, 0.02, "x", 12, C.rim, 0, 0.6);
}
function carModel(col) {
  const b = new B(), c = lin(col || "#64748b"), w = 0.88;
  const lower = [[-2.12, 0.3], [-2.16, 0.6], [-2.02, 0.8], [-0.9, 0.98], [1.72, 1.02], [2.1, 0.95], [2.15, 0.62], [2.12, 0.3]];
  b.ext(lower, -w, w, c, 0, 0.55);
  b.ext([[-0.88, 0.96], [-0.22, 1.42], [0.98, 1.43], [1.72, 1.0]], -w + 0.12, w - 0.12, C.glass, 0, 0.9);
  b.box(-w + 0.1, 1.4, -0.22, w - 0.1, 1.46, 1.0, c, 0, 0.55);              // roof
  b.box(-w + 0.11, 0.98, 0.36, w - 0.11, 1.42, 0.46, c, 0, 0.4);            // B-pillars
  b.box(-w - 0.01, 0.3, -2.18, w + 0.01, 0.48, -1.9, C.dark, 0, 0.2);        // bumpers
  b.box(-w - 0.01, 0.3, 1.92, w + 0.01, 0.48, 2.2, C.dark, 0, 0.2);
  b.box(-0.45, 0.5, -2.17, 0.45, 0.68, -2.1, C.dark, 0, 0.3);               // grille
  [-1, 1].forEach((s) => {
    b.box(s * 0.62 - 0.2, 0.64, -2.13, s * 0.62 + 0.2, 0.76, -2.05, C.head, 0.75, 0.9);
    b.box(s * 0.64 - 0.18, 0.72, 2.07, s * 0.64 + 0.18, 0.86, 2.16, C.tail, 1, 0.6);
    b.box(s * (w + 0.12) - 0.07, 0.95, -0.82, s * (w + 0.12) + 0.07, 1.06, -0.66, c, 0, 0.4); // mirrors
    wheel(b, s * 0.8, 0.33, -1.33, 0.33, 0.24); wheel(b, s * 0.8, 0.33, 1.32, 0.33, 0.24);
  });
  b.box(-0.26, 0.42, -2.2, 0.26, 0.53, -2.17, C.plate); b.box(-0.26, 0.55, 2.16, 0.26, 0.67, 2.19, C.plate);
  return { b, lights: { head: [[-0.62, 0.7, -2.15], [0.62, 0.7, -2.15]], tail: [[-0.64, 0.79, 2.17], [0.64, 0.79, 2.17]] }, r: 2.3, h: 0.8 };
}
function busModel(col) {
  const b = new B(), c = lin(col || "#b91c1c"), w = 1.25, L = 5.25, roof = lin("#f1efe9");
  b.box(-w, 0.45, -L, w, 1.55, L, c, 0, 0.35);
  b.box(-w + 0.02, 1.55, -L + 0.5, w - 0.02, 2.45, L - 0.2, C.glassL, 0, 0.8);   // window band
  for (let z = -L + 1.3; z < L - 0.4; z += 1.15) b.box(-w - 0.005, 1.55, z, w + 0.005, 2.45, z + 0.12, c, 0, 0.3); // pillars
  b.box(-w, 2.45, -L, w, 3.05, L, roof, 0, 0.3);
  b.box(-w + 0.05, 1.0, -L - 0.03, w - 0.05, 2.5, -L + 0.4, C.glass, 0, 0.9);      // windscreen
  b.box(-0.9, 2.55, -L - 0.04, 0.9, 2.9, -L, C.amber, 0.25, 0.4);                 // destination board
  b.box(-w - 0.01, 1.45, -L, w + 0.01, 1.6, L, lin("#fef3c7"), 0, 0.3);           // stripe
  b.box(w - 0.02, 0.5, -L + 0.8, w + 0.01, 2.4, -L + 1.8, C.glass, 0, 0.8);       // door (left side faces kerb: x<0 is left)
  b.box(-w - 0.01, 0.5, -L + 0.8, -w + 0.02, 2.4, -L + 1.8, lin("#111827"), 0, 0.5);
  b.box(-w, 0.3, -L - 0.08, w, 0.6, -L + 0.1, C.dark); b.box(-w, 0.3, L - 0.1, w, 0.6, L + 0.08, C.dark);
  b.box(-w + 0.12, 1.65, L - 0.02, w - 0.12, 2.4, L + 0.03, C.glass, 0, 0.9);                    // rear window
  b.box(-w + 0.2, 0.75, L - 0.02, w - 0.2, 1.3, L + 0.02, shade(c, 0.8), 0, 0.3);                // engine hatch
  b.box(-0.35, 0.62, L, 0.35, 0.78, L + 0.04, C.plateY);
  [-1, 1].forEach((s) => {
    b.box(s * 0.95 - 0.18, 0.7, -L - 0.08, s * 0.95 + 0.18, 0.86, -L + 0.02, C.head, 0.75, 0.9);
    b.box(s * 1.0 - 0.15, 0.75, L - 0.02, s * 1.0 + 0.15, 1.1, L + 0.08, C.tail, 1, 0.6);
    wheel(b, s * 1.05, 0.5, -L + 1.7, 0.5, 0.34); wheel(b, s * 1.05, 0.5, L - 2.1, 0.5, 0.34);
  });
  return { b, lights: { head: [[-0.95, 0.78, -L - 0.1], [0.95, 0.78, -L - 0.1]], tail: [[-1, 0.92, L + 0.1], [1, 0.92, L + 0.1]] }, r: 5.6, h: 1.5 };
}
function truckModel(col, id) {
  const b = new B(), c = lin(col || "#a16207"), w = 1.2, L = 4.0;
  const tractor = /trac/.test(id || "");
  if (tractor) {                                  // farm tractor with a trolley
    const red = lin("#c2410c");
    b.box(-0.55, 0.6, -L, 0.55, 1.35, -L + 1.6, red, 0, 0.5);                       // bonnet
    b.box(-0.6, 0.9, -L + 1.6, 0.6, 1.4, -L + 2.4, red, 0, 0.5);                    // body
    b.cb(0, 1.4, -L + 2.1, 0.5, 0.5, 0.3, C.dark);                                  // seat back
    b.box(-0.04, 1.35, -L + 0.4, 0.04, 1.85, -L + 0.48, C.dark);                    // exhaust
    [-1, 1].forEach((s) => { wheel(b, s * 0.62, 0.42, -L + 0.5, 0.42, 0.26); wheel(b, s * 0.78, 0.78, -L + 2.2, 0.78, 0.45); });
    b.box(-0.15, 0.6, -L + 2.4, 0.15, 0.75, -L + 3.1, C.dark);                       // hitch
    b.box(-w, 0.75, -L + 3.1, w, 0.85, L, lin("#5b6b3a"));                           // trolley bed
    b.box(-w, 0.85, -L + 3.1, w, 1.55, -L + 3.18, lin("#4d7c0f")); b.box(-w, 0.85, L - 0.08, w, 1.55, L, lin("#4d7c0f"));
    b.box(-w, 0.85, -L + 3.1, -w + 0.08, 1.55, L, lin("#4d7c0f")); b.box(w - 0.08, 0.85, -L + 3.1, w, 1.55, L, lin("#4d7c0f"));
    b.box(-w + 0.1, 0.85, -L + 3.3, w - 0.1, 1.75, L - 0.2, lin("#d6b25e"), 0, 0.05); // load of hay
    [-1, 1].forEach((s) => wheel(b, s * 1.05, 0.42, L - 1.3, 0.42, 0.28));
    b.box(-w + 0.05, 1.2, L - 0.02, -w + 0.35, 1.35, L + 0.04, C.tail, 1);           // reflectors
    b.box(w - 0.35, 1.2, L - 0.02, w - 0.05, 1.35, L + 0.04, C.tail, 1);
    return { b, lights: { head: [[-0.35, 1.1, -L - 0.02], [0.35, 1.1, -L - 0.02]], tail: [[-w + 0.2, 1.28, L + 0.05], [w - 0.2, 1.28, L + 0.05]] }, r: 4.3, h: 1.2 };
  }
  const cab = lin("#f97316"), wood = lin("#9a6b3c");
  b.box(-w, 0.55, -L + 0.6, w, 0.85, L, C.dark);                                      // chassis
  b.box(-w, 0.85, -L, w, 2.4, -L + 1.9, cab, 0, 0.45);                                // cab
  b.box(-w + 0.05, 1.6, -L - 0.02, w - 0.05, 2.25, -L + 0.3, C.glass, 0, 0.9);        // windscreen
  b.box(-w - 0.01, 1.65, -L + 0.4, w + 0.01, 2.2, -L + 1.3, C.glass, 0, 0.9);         // side windows
  b.box(-w, 2.4, -L - 0.02, w, 2.95, -L + 0.35, c, 0.0, 0.4);                         // painted headboard
  b.box(-w + 0.15, 2.5, -L - 0.04, w - 0.15, 2.85, -L - 0.02, lin("#fde047"), 0.25, 0.3);
  b.box(-w, 0.85, -L + 2.0, w, 2.5, L, wood, 0, 0.08);                                 // cargo body
  b.box(-w - 0.01, 1.2, -L + 2.0, w + 0.01, 1.28, L, c, 0, 0.3);                       // painted bands
  b.box(-w - 0.01, 2.0, -L + 2.0, w + 0.01, 2.08, L, c, 0, 0.3);
  b.ext([[-L + 2.0, 2.5], [-L + 2.0, 2.75], [0, 3.15], [L, 2.75], [L, 2.5]], -w - 0.02, w + 0.02, lin("#1e40af"), 0, 0.15); // tarpaulin
  b.box(-w, 0.4, -L - 0.08, w, 0.7, -L + 0.1, C.dark);
  b.box(-w + 0.08, 0.95, L, w - 0.08, 2.4, L + 0.03, shade(wood, 0.85), 0, 0.05);                 // tailgate
  [[1.05, lin("#dc2626")], [1.5, lin("#facc15")], [1.95, lin("#16a34a")]].forEach(([y, col]) => b.box(-w + 0.1, y, L + 0.03, w - 0.1, y + 0.22, L + 0.05, col, 0, 0.2));
  b.box(-0.35, 0.72, L + 0.02, 0.35, 0.9, L + 0.06, C.plateY);
  [-1, 1].forEach((s) => {
    b.box(s * 0.85 - 0.18, 0.95, -L - 0.08, s * 0.85 + 0.18, 1.1, -L + 0.02, C.head, 0.75, 0.9);
    b.box(s * 0.95 - 0.15, 0.9, L - 0.01, s * 0.95 + 0.15, 1.1, L + 0.06, C.tail, 1, 0.6);
    wheel(b, s * 1.02, 0.5, -L + 1.1, 0.5, 0.32); wheel(b, s * 1.02, 0.5, L - 1.9, 0.5, 0.32); wheel(b, s * 1.02, 0.5, L - 0.8, 0.5, 0.32);
  });
  return { b, lights: { head: [[-0.85, 1.02, -L - 0.1], [0.85, 1.02, -L - 0.1]], tail: [[-0.95, 1.0, L + 0.08], [0.95, 1.0, L + 0.08]] }, r: 4.4, h: 1.4 };
}
function autoModel(col) {
  const b = new B(), c = lin(col || "#facc15"), green = lin("#15803d"), black = lin("#18181b");
  b.ext([[-1.3, 0.3], [-1.38, 0.75], [-1.15, 1.0], [-0.7, 1.05], [-0.6, 0.55], [1.2, 0.55], [1.25, 0.3]], -0.68, 0.68, c, 0, 0.5); // tub
  b.ext([[-1.2, 0.95], [-0.95, 1.65], [1.15, 1.7], [1.25, 1.1], [1.2, 0.55], [-0.62, 0.55]], -0.7, 0.7, black, 0, 0.1);      // canopy
  b.box(-0.6, 0.95, -1.18, 0.6, 1.55, -1.12, C.glass, 0, 0.9);                         // windscreen
  b.box(-0.71, 0.6, -0.5, 0.71, 1.4, 0.9, lin("#0b0b0c"), 0, 0.05);                   // open sides
  b.box(-0.72, 0.5, -0.6, 0.72, 0.62, 1.22, green, 0, 0.4);                           // green belt
  b.cb(0, 0.6, -1.42, 0.24, 0.16, 0.06, C.head, 0.75, 0.9);                            // single headlamp
  b.box(-0.6, 0.55, 1.2, -0.42, 0.68, 1.27, C.tail, 1); b.box(0.42, 0.55, 1.2, 0.6, 0.68, 1.27, C.tail, 1);
  wheel(b, 0, 0.25, -1.05, 0.25, 0.16); wheel(b, -0.62, 0.25, 0.75, 0.25, 0.16); wheel(b, 0.62, 0.25, 0.75, 0.25, 0.16);
  return { b, lights: { head: [[0, 0.68, -1.47]], tail: [[-0.51, 0.62, 1.28], [0.51, 0.62, 1.28]] }, r: 1.6, h: 0.8 };
}
function rider(b, shirt, helmet, lean, kneeZ) {
  b.with(M.mul(M.t(0, 0.95, 0.1), M.rx(-lean)), (q) => {
    q.cb(0, 0, 0, 0.36, 0.56, 0.24, shirt, 0, 0.1);                                  // torso
    q.sph(0, 0.72, 0, 0.14, 0.15, 0.15, helmet, 12, false, 0, 0.7);                 // helmet
    q.box(-0.1, 0.66, -0.17, 0.1, 0.76, -0.12, C.glass, 0, 0.9);                    // visor
    [-1, 1].forEach((s) => q.with(M.mul(M.t(s * 0.2, 0.5, 0), M.rx(0.95)), (r) => r.cb(0, -0.5, 0, 0.09, 0.5, 0.09, shirt)));
  });
  [-1, 1].forEach((s) => { b.box(s * 0.12 - 0.07, 0.6, kneeZ, s * 0.12 + 0.07, 0.95, 0.2, PANTS[0]); b.box(s * 0.16 - 0.06, 0.15, kneeZ - 0.05, s * 0.16 + 0.06, 0.62, kneeZ + 0.1, PANTS[0]); });
}
function bikeModel(col, id) {
  const b = new B(), c = lin(col || "#16a34a"), r = rng(hashStr(id));
  wheel(b, 0, 0.32, -0.68, 0.32, 0.1); wheel(b, 0, 0.32, 0.68, 0.32, 0.1);
  b.box(-0.12, 0.42, -0.45, 0.12, 0.62, 0.55, C.dark);                                // engine/frame
  b.ext([[-0.55, 0.62], [-0.45, 0.85], [0.0, 0.88], [0.05, 0.66]], -0.16, 0.16, c, 0, 0.7); // tank
  b.box(-0.15, 0.78, 0.0, 0.15, 0.86, 0.6, lin("#111"), 0, 0.2);                     // seat
  b.box(-0.13, 0.62, 0.45, 0.13, 0.78, 0.8, c, 0, 0.6);                              // tail panel
  b.box(-0.04, 0.4, -0.78, 0.04, 1.0, -0.66, C.chrome, 0, 0.7);                      // forks
  b.box(-0.36, 0.98, -0.62, 0.36, 1.02, -0.58, C.dark);                              // handlebar
  b.cb(0, 0.82, -0.78, 0.16, 0.14, 0.08, C.head, 0.75, 0.9);
  b.box(-0.07, 0.72, 0.8, 0.07, 0.8, 0.84, C.tail, 1);
  rider(b, SHIRTS[(r() * SHIRTS.length) | 0], [lin("#111827"), lin("#dc2626"), lin("#f8fafc"), lin("#1d4ed8")][(r() * 4) | 0], 0.35, -0.25);
  return { b, lights: { head: [[0, 0.89, -0.83]], tail: [[0, 0.76, 0.85]] }, r: 1.1, h: 1.0 };
}
function cycleModel(id) {
  const b = new B(), r = rng(hashStr(id)), frame = lin("#0f766e");
  [-0.52, 0.52].forEach((z) => { b.cyl(0, 0.34, z, 0.34, 0.04, "x", 18, C.tyre, 0, 0.1); b.cyl(0, 0.34, z, 0.3, 0.045, "x", 18, lin("#d4d4d4"), 0, 0.6); });
  b.with(M.mul(M.t(0, 0.62, 0), M.rx(0.08)), (q) => q.box(-0.025, -0.02, -0.5, 0.025, 0.02, 0.35, frame));
  b.box(-0.025, 0.34, 0.0, 0.025, 0.85, 0.05, frame); b.box(-0.025, 0.34, -0.52, 0.025, 0.95, -0.47, frame);
  b.box(-0.28, 0.95, -0.52, 0.28, 0.98, -0.47, C.dark); b.box(-0.08, 0.85, -0.05, 0.08, 0.9, 0.12, C.dark);
  b.cb(0, 0.82, 0.55, 0.06, 0.06, 0.03, C.tail, 1);
  b.with(M.mul(M.t(0, 0.95, 0.05), M.rx(-0.25)), (q) => {
    q.cb(0, 0, 0, 0.34, 0.55, 0.22, SHIRTS[(r() * SHIRTS.length) | 0], 0, 0.1);
    q.sph(0, 0.7, 0, 0.11, 0.12, 0.11, C.skin[(r() * 4) | 0], 10, false, 0, 0.2);
    q.sph(0, 0.75, 0.02, 0.115, 0.08, 0.115, C.hair[0], 10);
    [-1, 1].forEach((s) => q.with(M.mul(M.t(s * 0.19, 0.5, 0), M.rx(0.9)), (w) => w.cb(0, -0.5, 0, 0.08, 0.5, 0.08, C.skin[1])));
  });
  [-1, 1].forEach((s) => b.box(s * 0.1 - 0.06, 0.25, -0.05, s * 0.1 + 0.06, 0.95, 0.07, PANTS[1]));
  return { b, lights: { head: [], tail: [[0, 0.85, 0.57]] }, r: 0.9, h: 0.9 };
}
/* people: body mesh + four limb meshes swung by the walk cycle */
function personParts(id, color) {
  const r = rng(hashStr(id)), kid = /^kid/.test(id), worker = /^w\d*$/.test(id) || /work/.test(id);
  const skin = C.skin[(r() * 4) | 0], hair = C.hair[(r() * 4) | 0];
  const style = worker ? "work" : kid ? "kid" : ["trousers", "trousers", "mundu", "saree"][(r() * 4) | 0];
  const shirt = color ? lin(color) : worker ? lin("#f97316") : style === "saree" ? SAREE[(r() * SAREE.length) | 0] : SHIRTS[(r() * SHIRTS.length) | 0];
  const legC = style === "mundu" ? lin("#f5f5f0") : style === "saree" ? shirt : PANTS[(r() * PANTS.length) | 0];
  const body = new B();
  body.cb(0, 0.92, 0, 0.36, 0.5, 0.21, shirt, 0, 0.12);                                // torso
  body.cb(0, 1.38, 0, 0.42, 0.08, 0.22, shirt, 0, 0.12);                               // shoulders
  body.cyl(0, 1.44, 0, 0.05, 0.08, "y", 8, skin);                                       // neck
  body.sph(0, 1.6, -0.01, 0.105, 0.125, 0.11, skin, 12, false, 0, 0.25);               // head
  body.sph(0, 1.65, 0.015, 0.112, 0.09, 0.115, hair, 12, false, 0, 0.3);               // hair
  if (style === "saree") { body.sph(0, 1.6, 0.11, 0.06, 0.06, 0.05, hair, 8); body.with(M.mul(M.t(0, 1.15, 0), M.rz(0.6)), (q) => q.cb(0, -0.3, 0, 0.06, 0.62, 0.23, lin("#fde68a"))); }
  if (style === "mundu" || style === "saree") body.cone(0, 0.08, 0, style === "saree" ? 0.26 : 0.22, 0.95, 0.19, 12, legC, 0, 0.1);
  if (style === "mundu") body.cone(0, 0.08, 0, 0.222, 0.14, 0.218, 12, lin("#d4a017"));
  if (worker) {
    body.cb(0, 0.95, 0, 0.375, 0.45, 0.225, lin("#ff7a00"), 0, 0.2);
    body.cb(0, 1.05, 0, 0.38, 0.05, 0.23, lin("#e5e7eb"), 0.25, 0.8); body.cb(0, 1.2, 0, 0.38, 0.05, 0.23, lin("#e5e7eb"), 0.25, 0.8);
    body.sph(0, 1.68, 0, 0.14, 0.08, 0.15, lin("#facc15"), 12, false, 0, 0.6); body.cyl(0, 1.66, 0, 0.17, 0.02, "y", 12, lin("#facc15"));
  }
  const leg = new B(); const shoe = lin("#1c1917");
  if (style === "mundu" || style === "saree") { leg.box(-0.055, -0.92, -0.06, 0.055, -0.75, 0.06, skin); }
  else leg.box(-0.065, -0.84, -0.07, 0.065, 0, 0.07, legC, 0, 0.08);
  leg.box(-0.06, -0.92, -0.14, 0.06, -0.84, 0.06, shoe, 0, 0.3);
  const arm = new B();
  arm.box(-0.05, -0.32, -0.055, 0.05, 0, 0.055, style === "saree" ? skin : shirt, 0, 0.1);
  arm.box(-0.042, -0.6, -0.045, 0.042, -0.32, 0.045, skin);
  arm.sph(0, -0.64, 0, 0.045, 0.055, 0.045, skin, 8);
  return { body, leg, arm, scale: kid ? 0.64 : 1, r: kid ? 0.7 : 0.8, h: kid ? 0.6 : 1.0 };
}
function cowModel(id) {
  const b = new B(), r = rng(hashStr(id)), col = [lin("#e7e2d6"), lin("#bdb5a6"), lin("#d9cbb0"), lin("#5b4636")][(r() * 4) | 0];
  b.ext([[-0.8, 0.75], [-0.85, 1.25], [-0.55, 1.42], [0.75, 1.32], [0.85, 1.1], [0.8, 0.75]], -0.3, 0.3, col, 0, 0.1); // body
  b.sph(0, 1.42, -0.55, 0.16, 0.16, 0.2, col, 8);                                     // hump (zebu)
  b.with(M.mul(M.t(0, 1.3, -0.95), M.rx(0.5)), (q) => {
    q.cb(0, -0.1, 0, 0.24, 0.3, 0.42, col);
    q.cb(0, -0.12, -0.25, 0.2, 0.2, 0.18, shade(col, 0.8));                            // muzzle
    [-1, 1].forEach((s) => { q.with(M.mul(M.t(s * 0.1, 0.2, 0.05), M.rz(-s * 0.5)), (h) => h.cone(0, 0, 0, 0.03, 0.22, 0.005, 6, lin("#3f3a33"))); q.cb(s * 0.17, 0.08, 0.08, 0.14, 0.05, 0.08, col); });
  });
  b.with(M.t(0, 1.25, 0.82), (q) => q.with(M.rx(0.25), (t) => t.cb(0, -0.7, 0, 0.04, 0.7, 0.04, col)));
  const leg = new B(); leg.box(-0.06, -0.75, -0.06, 0.06, 0, 0.06, col); leg.box(-0.065, -0.78, -0.065, 0.065, -0.68, 0.065, lin("#2a2522"));
  return { body: b, leg, legs: [[-0.18, 0.78, -0.6], [0.18, 0.78, -0.6], [-0.18, 0.78, 0.6], [0.18, 0.78, 0.6]], r: 1.1, h: 0.9 };
}
function dogModel() {
  const b = new B(), col = lin("#b7793f");
  b.ext([[-0.35, 0.32], [-0.38, 0.52], [0.35, 0.5], [0.38, 0.32]], -0.12, 0.12, col);
  b.with(M.mul(M.t(0, 0.52, -0.42), M.rx(-0.3)), (q) => { q.cb(0, -0.04, 0, 0.18, 0.18, 0.22, col); q.cb(0, -0.04, -0.15, 0.1, 0.09, 0.12, shade(col, 0.75)); q.cb(-0.07, 0.12, 0.05, 0.05, 0.08, 0.04, col); q.cb(0.07, 0.12, 0.05, 0.05, 0.08, 0.04, col); });
  b.with(M.mul(M.t(0, 0.48, 0.36), M.rx(-0.9)), (q) => q.cb(0, 0, 0, 0.04, 0.3, 0.04, col));
  const leg = new B(); leg.box(-0.035, -0.33, -0.035, 0.035, 0, 0.035, col);
  return { body: b, leg, legs: [[-0.08, 0.34, -0.28], [0.08, 0.34, -0.28], [-0.08, 0.34, 0.28], [0.08, 0.34, 0.28]], r: 0.6, h: 0.35 };
}
function ballModel() {
  const b = new B(); b.sph(0, 0.11, 0, 0.11, 0.11, 0.11, lin("#ef4444"), 14, false, 0, 0.5); b.cyl(0, 0.11, 0, 0.112, 0.03, "x", 14, C.white, 0, 0.5);
  return { b, r: 0.4, h: 0.1 };
}

/* ---------- scenery ---------- */
function palm(seed) {
  const b = new B(), r = rng(seed), h = 6 + r() * 4, bend = (r() - 0.5) * 0.9, bark = lin("#7a6650");
  let x = 0, y = 0;
  const seg = 7;
  for (let i = 0; i < seg; i++) {
    const t0 = i / seg, t1 = (i + 1) / seg;
    const x0 = bend * t0 * t0 * 2, x1 = bend * t1 * t1 * 2;
    b.with(M.t(x0, t0 * h, 0), (q) => q.cone(0, 0, 0, 0.2 - t0 * 0.07, h / seg, 0.2 - t1 * 0.07, 8, shade(bark, 0.85 + (i % 2) * 0.15), 0, 0.05));
    x = x1; y = t1 * h;
  }
  const leaf = lin("#3f7d2a"), leaf2 = lin("#5a9a35");
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + r() * 0.3, len = 2.4 + r() * 0.8, droop = 0.5 + r() * 0.5;
    b.with(M.mul(M.t(x, y, 0), M.trs(0, 0, 0, a)), (q) => {
      let pz = 0, py = 0, pw = 0.12;
      for (let k = 0; k < 4; k++) {
        const nz = pz - len / 4, ny = py + (k < 1 ? 0.35 : -droop * (k / 2)), nw = 0.12 + Math.sin((k + 1) / 4 * Math.PI) * 0.42;
        q.quad([-pw, py, pz], [pw, py, pz], [nw, ny, nz], [-nw, ny, nz], k % 2 ? leaf : leaf2, 0, 0.12);
        pz = nz; py = ny; pw = nw;
      }
    });
  }
  b.sph(x, y - 0.2, 0, 0.32, 0.25, 0.32, lin("#6b8e23"), 6, true);
  return b;
}
function broadTree(seed) {
  const b = new B(), r = rng(seed), h = 2.2 + r() * 1.5, g = [lin("#2f5d1f"), lin("#3b6e25"), lin("#476f1e")];
  b.cone(0, 0, 0, 0.22, h + 0.6, 0.12, 7, lin("#5b4636"));
  for (let i = 0; i < 4; i++) b.sph((r() - 0.5) * 1.6, h + 0.6 + r() * 1.4, (r() - 0.5) * 1.6, 1.3 + r() * 0.7, 1.0 + r() * 0.5, 1.3 + r() * 0.7, g[i % 3], 7, true, 0, 0.05);
  return b;
}
function shrub(seed) {
  const b = new B(), r = rng(seed);
  for (let i = 0; i < 3; i++) b.sph((r() - 0.5) * 0.8, 0.35 + r() * 0.2, (r() - 0.5) * 0.8, 0.45 + r() * 0.25, 0.4, 0.45, [lin("#3f6b26"), lin("#4f7d2c")][i % 2], 6, true);
  return b;
}
function lamp(side) {
  const b = new B(), g = lin("#6b7280");
  b.cyl(0, 0, 0, 0.09, 7.5, "y", 8, g, 0, 0.4);
  b.box(0, 7.35, -0.06, -side * 1.8, 7.45, 0.06, g, 0, 0.4);
  b.box(-side * 1.75 - 0.25, 7.2, -0.14, -side * 1.75 + 0.25, 7.35, 0.14, g, 0, 0.4);
  b.box(-side * 1.75 - 0.22, 7.16, -0.12, -side * 1.75 + 0.22, 7.2, 0.12, lin("#fff1c1"), 0.5, 0.5);
  return b;
}
function ePole(side) {
  const b = new B(), c = lin("#a8a29e");
  b.cone(0, 0, 0, 0.13, 8.5, 0.08, 4, c, 0, 0.05);
  b.box(-0.9, 7.9, -0.05, 0.9, 8.0, 0.05, c);
  [-0.8, 0, 0.8].forEach((x) => b.cyl(x, 8.0, 0, 0.04, 0.12, "y", 6, lin("#e5e7eb")));
  if (side) b.cb(0, 5.0, 0, 0.5, 0.6, 0.35, lin("#57534e"));
  return b;
}
function shop(seed, side) {
  const b = new B(), r = rng(seed), w = 6 + r() * 4, d = 6, h = 3.2 + r() * 3.5;
  const walls = ["#e8dcc6", "#f1d6a8", "#cfe3d4", "#d9d2e9", "#f3c7b8", "#e5e5e5"].map(lin), signs = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#7c3aed", "#0891b2"].map(lin);
  const wall = walls[(r() * walls.length) | 0], sign = signs[(r() * signs.length) | 0];
  const fx = -side * 0.0;  // building front faces the road (towards x=0)
  b.box(-d / 2, 0, -w / 2, d / 2, h, w / 2, wall, 0, 0.05);
  const front = side < 0 ? d / 2 : -d / 2, out = side < 0 ? 1 : -1;
  b.box(front - 0.02 * out, 0, -w / 2 + 0.4, front + 0.03 * out, 2.6, w / 2 - 0.4, lin("#52525b"), 0, 0.3);          // shutter / shop front
  for (let z = -w / 2 + 0.5; z < w / 2 - 0.4; z += 0.18) b.box(front + 0.03 * out, 0.1, z, front + 0.05 * out, 2.5, z + 0.04, lin("#3f3f46"));
  b.box(front, 2.7, -w / 2 + 0.2, front + 0.12 * out, 3.25, w / 2 - 0.2, sign, 0.25, 0.3);                            // signboard
  b.with(M.t(front, 2.62, 0), (q) => q.quad([0, 0, -w / 2], [0, 0, w / 2], [out * 1.3, -0.45, w / 2], [out * 1.3, -0.45, -w / 2], lin(["#0f766e", "#b45309", "#1d4ed8"][(r() * 3) | 0]), 0, 0.1));
  if (h > 4.6) for (let z = -w / 2 + 0.9; z < w / 2 - 0.8; z += 1.6) b.box(front, 3.8, z, front + 0.04 * out, 4.8, z + 0.9, lin("#1f2937"), r() < 0.55 ? 0.5 : 0, 0.8);
  b.box(-d / 2 - 0.1, h, -w / 2 - 0.1, d / 2 + 0.1, h + 0.25, w / 2 + 0.1, shade(wall, 0.8));
  return b;
}
function keralaHouse(seed, side) {
  const b = new B(), r = rng(seed), w = 7 + r() * 3, d = 6, wall = [lin("#f5f5f4"), lin("#fde68a"), lin("#bfdbfe"), lin("#fbcfe8")][(r() * 4) | 0];
  const tile = lin("#9a3412");
  b.box(-d / 2, 0, -w / 2, d / 2, 0.4, w / 2, lin("#78716c"));                          // plinth
  b.box(-d / 2 + 0.4, 0.4, -w / 2 + 0.4, d / 2 - 0.4, 3.0, w / 2 - 0.4, wall, 0, 0.05);
  b.ext([[-w / 2 - 0.9, 2.8], [0, 4.9], [w / 2 + 0.9, 2.8], [w / 2 + 0.9, 2.65], [0, 4.72], [-w / 2 - 0.9, 2.65]].map(([z, y]) => [z, y]), -d / 2 - 0.9, d / 2 + 0.9, tile, 0, 0.15);
  const front = side < 0 ? d / 2 - 0.4 : -d / 2 + 0.4, out = side < 0 ? 1 : -1;
  b.box(front, 0.4, -0.5, front + 0.04 * out, 2.3, 0.5, lin("#5b3a1e"));                 // door
  [-2.2, 2.2].forEach((z) => b.box(front, 1.2, z - 0.5, front + 0.04 * out, 2.1, z + 0.5, lin("#1e3a5f"), r() < 0.5 ? 0.5 : 0, 0.6));
  [-w / 2 + 0.3, w / 2 - 0.3].forEach((z) => b.cyl(front + 0.7 * out, 0.4, z, 0.1, 2.5, "y", 8, C.white));
  // compound wall with gate opening
  const wx = side < 0 ? d / 2 + 2.2 : -d / 2 - 2.2;
  b.box(wx - 0.12, 0, -w / 2 - 2, wx + 0.12, 1.3, -1.2, lin("#d6d3d1")); b.box(wx - 0.12, 0, 1.2, wx + 0.12, 1.3, w / 2 + 2, lin("#d6d3d1"));
  return b;
}
function flats(seed, side) {
  const b = new B(), r = rng(seed), fl = 3 + ((r() * 3) | 0), w = 10, d = 8, wall = [lin("#e7e5e4"), lin("#d6d3d1"), lin("#fde7c8")][(r() * 3) | 0];
  b.box(-d / 2, 0, -w / 2, d / 2, fl * 3.1, w / 2, wall, 0, 0.05);
  const front = side < 0 ? d / 2 : -d / 2, out = side < 0 ? 1 : -1;
  for (let f = 0; f < fl; f++) for (let z = -w / 2 + 0.8; z < w / 2 - 1; z += 2.2) {
    b.box(front, f * 3.1 + 1.0, z, front + 0.05 * out, f * 3.1 + 2.3, z + 1.4, lin("#203040"), r() < 0.45 ? 0.5 : 0, 0.8);
    b.box(front, f * 3.1 + 0.9, z - 0.1, front + 0.5 * out, f * 3.1 + 1.0, z + 1.5, shade(wall, 0.85));
  }
  b.box(-d / 2, fl * 3.1, -w / 2, d / 2, fl * 3.1 + 1, w / 2, shade(wall, 0.9));
  return b;
}
function barrierPost() { const b = new B(); b.cb(0, 0, 0, 0.12, 0.75, 0.12, lin("#9ca3af"), 0, 0.5); return b; }
function milestone() {
  const b = new B(); b.cb(0, 0, 0, 0.18, 0.55, 0.42, C.white, 0, 0.1); b.with(M.t(0, 0.55, 0), (q) => q.ext([[-0.21, 0], [-0.21, 0.08], [0, 0.22], [0.21, 0.08], [0.21, 0]], -0.09, 0.09, C.yellow));
  return b;
}
function signPost(kind) {
  const b = new B(); b.cyl(0, 0, 0, 0.04, 2.4, "y", 8, lin("#9ca3af"), 0, 0.5);
  if (kind === "giveway") {
    b.with(M.t(0, 2.0, 0), (q) => { q.ext([[-0.38, 0.32], [0.38, 0.32], [0, -0.34]], -0.02, 0.02, lin("#dc2626"), 0, 0.3); q.ext([[-0.26, 0.24], [0.26, 0.24], [0, -0.21]], -0.03, 0.03, C.white, 0, 0.3); });
  } else if (kind === "zebra") {
    b.cb(0, 2.0, 0, 0.04, 0.6, 0.6, lin("#1d4ed8"), 0, 0.3);
    b.with(M.t(0, 2.08, 0), (q) => q.ext([[-0.22, 0], [0.22, 0], [0, 0.4]], -0.03, 0.03, C.white));
  }
  return b;
}
function signal(state) {
  const b = new B(), g = lin("#1f2937");
  b.cyl(0, 0, 0, 0.08, 3.4, "y", 8, lin("#4b5563"), 0, 0.4);
  b.cb(0, 3.3, 0, 0.36, 1.05, 0.3, g, 0, 0.3);
  [["red", 4.08], ["amber", 3.75], ["green", 3.42]].forEach(([k, y]) => {
    const on = state === k, col = k === "red" ? lin("#ef4444") : k === "amber" ? lin("#f59e0b") : lin("#22c55e");
    b.cyl(0, y, 0.17, 0.12, 0.04, "z", 12, on ? col : shade(col, 0.12), on ? 0.25 : 0, 0.8);
  });
  return b;
}
function hill(seed) { const b = new B(), r = rng(seed); b.sph(0, -6, 0, 30 + r() * 30, 18 + r() * 14, 26 + r() * 24, lin("#3d5f34"), 9, true, 0, 0); return b; }

/* ---------- shaders ---------- */
const TONE = `vec3 tone(vec3 c){c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);return pow(clamp(c,0.,1.),vec3(1./2.2));}`;
const VS = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec3 aN; layout(location=2) in vec3 aC; layout(location=3) in vec2 aM;
uniform mat4 uVP, uModel; out vec3 vW, vN, vC; out vec2 vM;
void main(){ vec4 w=uModel*vec4(aP,1.); vW=w.xyz; vN=mat3(uModel)*aN; vC=aC; vM=aM; gl_Position=uVP*w; }`;
const FS = `#version 300 es
precision highp float;
in vec3 vW, vN, vC; in vec2 vM;
uniform vec3 uCam, uSunDir, uSunCol, uSky, uGnd, uFog, uTint;
uniform float uFogDen, uWet, uNight, uBrake, uScroll, uTintAmt, uFade; uniform vec4 uMul;
uniform int uNL; uniform vec4 uLP[10], uLC[10], uLD[10];
out vec4 o;
${TONE}
float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
void main(){
  vec3 base=vC*uMul.rgb; float em=vM.x, spec=vM.y;
  vec2 g=vec2(vW.x, vW.z+uScroll);
  if(em<-.5){
    if(em>-1.5){ base = mod(floor(g.y*1.0),2.)<1. ? base : vec3(.012); }                 // kerb stripes
    else if(em>-2.5){ if(mod(g.y,7.5)>3.) discard; }                                      // lane dash
    else if(em>-3.5){ float n=vn(g*vec2(1.6,.9))*.5+vn(g*7.)*.5; base*=.82+.3*n;
      float tr=abs(fract((vW.x+1.75)/3.5)-.5); base*=1.-.12*smoothstep(.36,.2,abs(tr-.24)); }   // tarmac + wheel tracks
    else if(em>-4.5){ float n=vn(g*.35)*.6+vn(g*2.3)*.4; base*=.65+.6*n; }               // grass
    else if(em>-5.5){ float row=abs(fract(g.x*1.3)-.5); base*=mix(.9,1.04,smoothstep(.05,.3,row))*(.8+.35*vn(g*.25)); } // paddy rows
    else { vec2 t=fract(g*vec2(2.,2.)); base*= (min(t.x,t.y)<.06?.78:1.)*(.9+.15*vn(g*3.)); } // paving
    em=0.;
  }
  vec3 n=normalize(vN), V=normalize(uCam-vW); if(dot(n,V)<0.) n=-n;
  float wet = vW.y<.2 ? uWet : 0.;
  base*=1.-.38*wet;
  float sh=spec+wet*.9;
  vec3 hemi=mix(uGnd,uSky,n.y*.5+.5);
  vec3 Hs=normalize(uSunDir+V);
  vec3 col=base*(hemi+uSunCol*max(dot(n,uSunDir),0.)) + uSunCol*pow(max(dot(n,Hs),0.),28.+wet*90.)*sh*.6;
  for(int i=0;i<10;i++){ if(i>=uNL) break;
    vec3 L=uLP[i].xyz-vW; float d=length(L); L/=d;
    float a=clamp(1.-d/uLP[i].w,0.,1.); a*=a;
    float cone=uLD[i].w>0. ? smoothstep(uLD[i].w,uLD[i].w+.1,dot(-L,uLD[i].xyz)) : 1.;
    float k=a*cone*uLC[i].w; if(k<=0.) continue;
    vec3 Hh=normalize(L+V);
    col+=uLC[i].rgb*k*(base*max(dot(n,L),0.)+pow(max(dot(n,Hh),0.),40.+wet*120.)*(sh*.8+wet*1.2));
  }
  if(vW.y>.03) col*=mix(.62,1.,smoothstep(0.,1.4,vW.y));          // ground contact occlusion
  if(em>0.){ float lv = em<.4 ? .9 : em<.6 ? uNight*1.6 : em<.9 ? .35+uNight*2.2 : .1+uNight*1.2+uBrake*2.6;
    col+=base*lv*2.; }
  col+=uTint*uTintAmt;
  float d=length(uCam-vW); float f=1.-exp(-pow(d*uFogDen,1.6));
  col=mix(col,uFog,clamp(f,0.,1.));
  o=vec4(tone(col),uFade*uMul.a);
}`;
const VS2 = `#version 300 es
layout(location=0) in vec3 aP; layout(location=1) in vec2 aU; uniform mat4 uVP, uModel; out vec2 vU;
void main(){ vU=aU; gl_Position=uVP*uModel*vec4(aP,1.); }`;
const FS2 = `#version 300 es
precision highp float; in vec2 vU; uniform vec4 uCol; uniform int uMode; uniform float uTime; out vec4 o;
void main(){ float r=length(vU); float a;
  if(uMode==0) a=(1.-smoothstep(.25,1.,r));                                     // soft contact shadow
  else if(uMode==1) a=smoothstep(.62,.76,r)*(1.-smoothstep(.86,1.,r))*(.75+.25*sin(uTime*6.)); // pulsing ring
  else if(uMode==2) a=pow(max(1.-r,0.),2.2);                                    // light glow
  else a=1.;
  if(a<=.002) discard; o=vec4(uCol.rgb*(uMode==2?a:1.), uCol.a*a); }`;
const VSKY = `#version 300 es
layout(location=0) in vec2 aP; out float vY; void main(){ vY=aP.y; gl_Position=vec4(aP,.9999,1.); }`;
const FSKY = `#version 300 es
precision highp float; in float vY; uniform vec3 uTop, uHor; uniform float uHorY; out vec4 o; ${TONE}
void main(){ float t=smoothstep(uHorY-.02, 1.4, vY); vec3 c=mix(uHor,uTop,pow(t,.7)); o=vec4(tone(c),1.); }`;

function prog(gl, vs, fs) {
  const p = gl.createProgram();
  [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([t, src]) => {
    const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  });
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, ""); u[name] = gl.getUniformLocation(p, name.includes("[") ? name : gl.getActiveUniform(p, i).name); }
  return { p, u };
}
function upload(gl, b) {
  const data = new Float32Array(b.v), vao = gl.createVertexArray(), buf = gl.createBuffer();
  gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const st = 44;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, st, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, st, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, st, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, st, 36);
  gl.bindVertexArray(null);
  return { vao, buf, n: data.length / 11 };
}

/* ---------- moods ---------- */
const MOODS = {
  day: { sun: norm([-0.55, 0.7, 0.45]), sunC: [2.9, 2.6, 2.2], sky: [0.34, 0.46, 0.68], gnd: [0.16, 0.15, 0.11], fog: [0.62, 0.72, 0.85], den: 0.0065, top: [0.14, 0.32, 0.72], hor: [0.66, 0.76, 0.88], wet: 0, night: 0, shadow: 0.72 },
  night: { sun: norm([0.3, 0.7, -0.4]), sunC: [0.03, 0.04, 0.07], sky: [0.02, 0.025, 0.05], gnd: [0.008, 0.008, 0.01], fog: [0.008, 0.01, 0.022], den: 0.012, top: [0.002, 0.004, 0.014], hor: [0.02, 0.026, 0.055], wet: 0, night: 1, shadow: 0.25 },
  rain: { sun: norm([-0.3, 0.9, 0.2]), sunC: [0.55, 0.57, 0.62], sky: [0.42, 0.45, 0.5], gnd: [0.12, 0.12, 0.12], fog: [0.3, 0.33, 0.37], den: 0.021, top: [0.18, 0.2, 0.24], hor: [0.32, 0.35, 0.39], wet: 1, night: 0.35, shadow: 0.28 },
  fog: { sun: norm([-0.3, 0.9, 0.2]), sunC: [0.65, 0.65, 0.66], sky: [0.66, 0.68, 0.7], gnd: [0.24, 0.24, 0.23], fog: [0.6, 0.62, 0.64], den: 0.052, top: [0.55, 0.57, 0.6], hor: [0.6, 0.62, 0.64], wet: 0.3, night: 0.45, shadow: 0.2 },
};
const THEME = { ped: "town", town: "town", junc: "town", two: "suburb", heavy: "suburb", hwy: "highway", rural: "rural", wx: "rural" };

/* ---------- the renderer ---------- */
const H3 = {};
H3.supported = () => {
  try { const c = document.createElement("canvas"); return !!(window.WebGL2RenderingContext && c.getContext("webgl2")); } catch (e) { return false; }
};

H3.mount = (canvas, scen, state, opts = {}) => {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, powerPreference: "high-performance", preserveDrawingBuffer: !!opts.keep });
  if (!gl) return null;
  let P1, P2, P3;
  try { P1 = prog(gl, VS, FS); P2 = prog(gl, VS2, FS2); P3 = prog(gl, VSKY, FSKY); } catch (e) { console.warn("hz3d", e); return null; }
  const mood = MOODS[scen.mood] || MOODS.day, theme = THEME[scen.cat] || "suburb", layout = scen.layout || "straight";
  const dual = layout === "dual", junction = layout === "junction", crossing = layout === "crossing";
  const meshes = [];
  const mk = (b) => { const m = upload(gl, b); meshes.push(m); return m; };

  /* --- static ground --- */
  const g = new B(), far = -160, near = 60;
  g.flat(-400, far - 300, 400, near + 40, -0.02, theme === "rural" ? lin("#5f8f3b") : C.grass, -4, 0.02);
  if (theme === "rural") { g.flat(-60, far, -WALK - 3, near, -0.01, lin("#7fae45"), -5, 0.05); g.flat(WALK + 3, far, 60, near, -0.01, lin("#79a843"), -5, 0.05); }
  g.flat(-ROAD, far, ROAD, near, 0, C.tarmac, -3, 0.12);
  if (theme === "town") {                                    // paved forecourts up to the shop fronts
    g.flat(-14, far, -WALK, near, 0.004, lin("#9d968c"), -6, 0.04);
    if (!dual) g.flat(WALK, far, 14, near, 0.004, lin("#9d968c"), -6, 0.04);
  }
  const jz0 = WZ(196), jz1 = WZ(260);
  if (junction) {
    g.flat(-200, jz0, -ROAD, jz1, 0.001, C.tarmac, -3, 0.12);
    for (let x = -200; x < -6; x += 4) g.flat(x, (jz0 + jz1) / 2 - 0.06, x + 2.4, (jz0 + jz1) / 2 + 0.06, 0.012, C.white, 0, 0.2);
    for (let z = jz0 + 0.2; z < jz1 - 0.2; z += 0.9) { g.flat(-ROAD - 0.42, z, -ROAD - 0.27, z + 0.5, 0.013, C.white, 0, 0.2); g.flat(-ROAD - 0.67, z, -ROAD - 0.52, z + 0.5, 0.013, C.white, 0, 0.2); }
  }
  const walkSeg = (x0, x1, z0, z1, kerbX) => {
    g.box(x0, 0, z0, x1, 0.15, z1, C.walk, 0, 0.05);
    g.flat(x0, z0, x1, z1, 0.151, C.walk, -6, 0.05);
    g.quad([kerbX, 0, z0], [kerbX, 0, z1], [kerbX, 0.16, z1], [kerbX, 0.16, z0], C.kerb, -1, 0.1, [kerbX < 0 ? 1 : -1, 0, 0]);
    g.flat(Math.min(kerbX, kerbX + (kerbX < 0 ? 0.25 : -0.25)), z0, Math.max(kerbX, kerbX + (kerbX < 0 ? 0.25 : -0.25)), z1, 0.155, C.kerb, -1, 0.1);
  };
  if (junction) { walkSeg(-WALK, -ROAD, far, jz0, -ROAD); walkSeg(-WALK, -ROAD, jz1, near, -ROAD); }
  else walkSeg(-WALK, -ROAD, far, near, -ROAD);
  const med0 = ROAD + 0.07, med1 = ROAD + 0.35 + 0.35;
  if (dual) {
    g.box(med0, 0, far, med1, 0.25, near, C.concrete, 0, 0.05);
    g.quad([med0, 0, far], [med0, 0, near], [med0, 0.26, near], [med0, 0.26, far], C.yellow, -1, 0.1, [-1, 0, 0]);
    g.flat(med0, far, med1, near, 0.251, lin("#5b7a35"), -4, 0.02);
    g.flat(med1, far, med1 + 7, near, 0, C.tarmac, -3, 0.12);
    g.flat(med1 + 3.45, far, med1 + 3.55, near, 0.012, C.white, -2, 0.2);
    walkSeg(med1 + 7, med1 + 8.4, far, near, med1 + 7);
    g.flat(-ROAD + 0.12, far, -ROAD + 0.24, near, 0.012, C.white, 0, 0.2);          // edge line
    g.flat(ROAD - 0.2, far, ROAD - 0.08, near, 0.012, C.yellow, 0, 0.2);
  } else walkSeg(ROAD, WALK, far, near, ROAD);
  const cz0 = WZ(222), cz1 = WZ(252);
  const dashCut = crossing ? [[far, cz0 - 1.2], [cz1 + 0.6, near]] : [[far, near]];
  dashCut.forEach(([a, b2]) => g.flat(-0.07, a, 0.07, b2, 0.012, C.white, -2, 0.25));
  if (crossing) {
    for (let x = -ROAD + 0.25; x < ROAD - 0.3; x += 0.88) g.flat(x, cz0, x + 0.5, cz1, 0.013, C.white, 0, 0.25);
    g.flat(-ROAD, WZ(262) - 0.15, 0, WZ(262) + 0.05, 0.013, C.white, 0, 0.25);
    g.flat(0, cz0 - 1.0, ROAD, cz0 - 0.8, 0.013, C.white, 0, 0.25);
  }
  const ground = mk(g);

  /* --- fixed props (signs, signals) --- */
  const fixed = [];
  const addFixed = (b, x, z, yaw = 0) => fixed.push({ m: mk(b), M: M.trs(x, 0, z, yaw) });
  if (junction) addFixed(signPost("giveway"), -ROAD - 1.1, jz1 + 0.8, Math.PI / 2);
  if (crossing) {
    if (scen.cat === "junc") {
      const st = scen.id === "amber-light" ? "amber" : "green";
      addFixed(signal(st), -WALK + 0.4, cz1 + 1.6, 0); addFixed(signal(st), dual ? med0 + 0.2 : WALK - 0.4, cz0 - 1.2, 0);
    } else { addFixed(signPost("zebra"), -WALK + 0.3, cz1 + 0.9, Math.PI / 2); addFixed(signPost("zebra"), WALK - 0.3, cz0 - 0.9, -Math.PI / 2); }
  }
  for (let i = 0; i < 6; i++) { const r = rng(900 + i); fixed.push({ m: mk(hill(900 + i)), M: M.trs((i % 2 ? 1 : -1) * (120 + r() * 80), 0, -200 - r() * 150 + i * 30, r() * 3) }); }

  /* --- scrolling scenery (wraps along the road) --- */
  const decor = [], SPAN = 180, Z0 = -150;
  const addD = (b, x, z, yaw = 0, s = 1, skipJ = true) => decor.push({ m: mk(b), x, z, yaw, s, skipJ });
  const R = rng(hashStr(scen.id) + 77);
  const side = (s) => s < 0 ? -1 : 1;
  const leftEdge = -WALK, rightEdge = dual ? med1 + 8.4 : WALK;
  for (let z = Z0; z < Z0 + SPAN; z += 30) {
    addD(lamp(-1), leftEdge - 0.4, z + 4, 0);
    if (!dual) addD(lamp(1), rightEdge + 0.4, z + 19, 0); else addD(lamp(1), (med0 + med1) / 2, z + 19, 0);
  }
  if (theme !== "highway") for (let z = Z0; z < Z0 + SPAN; z += 36) { addD(ePole(true), leftEdge - 1.2, z + 12, 0); }
  if (dual || theme === "highway") for (let z = Z0; z < Z0 + SPAN; z += 4) addD(barrierPost(), leftEdge - 0.9, z, 0);
  for (let z = Z0; z < Z0 + SPAN; z += 3.6) if (dual) addD(shrub(hashStr("m" + z)), (med0 + med1) / 2, z, 0, 0.55);
  if (theme === "highway" || theme === "rural") for (let z = Z0; z < Z0 + SPAN; z += 60) addD(milestone(), leftEdge - 0.6, z + 25, Math.PI / 2);
  const bandL = leftEdge - 3, bandR = rightEdge + 3;
  let z = Z0;
  while (z < Z0 + SPAN) {
    const k = R();
    if (theme === "town") {
      const w = 11; addD(k < 0.75 ? shop(R() * 1e9 | 0, -1) : flats(R() * 1e9 | 0, -1), bandL - 3.2, z + w / 2, 0); z += w;
    } else if (theme === "suburb") {
      if (k < 0.35) { addD(keralaHouse(R() * 1e9 | 0, -1), bandL - 4, z + 7, 0); z += 15; }
      else if (k < 0.55) { addD(shop(R() * 1e9 | 0, -1), bandL - 3.2, z + 6, 0); z += 12; }
      else { addD(palm(R() * 1e9 | 0), bandL - 1 - R() * 4, z + 3, R() * 6); z += 6 + R() * 5; }
    } else if (theme === "rural") {
      if (k < 0.15) { addD(keralaHouse(R() * 1e9 | 0, -1), bandL - 10, z + 8, 0); z += 18; }
      else { addD(palm(R() * 1e9 | 0), bandL - R() * 14, z, R() * 6); z += 4 + R() * 6; }
    } else { addD(k < 0.5 ? broadTree(R() * 1e9 | 0) : palm(R() * 1e9 | 0), bandL - 1.5 - R() * 8, z, R() * 6); z += 6 + R() * 8; }
  }
  z = Z0;
  while (z < Z0 + SPAN) {
    const k = R();
    if (theme === "town" && !dual) { const w = 11; addD(k < 0.75 ? shop(R() * 1e9 | 0, 1) : flats(R() * 1e9 | 0, 1), bandR + 3.2, z + w / 2, 0); z += w; }
    else if ((theme === "suburb" || theme === "town") && k < 0.3) { addD(keralaHouse(R() * 1e9 | 0, 1), bandR + 4, z + 7, 0); z += 15; }
    else { addD(R() < 0.6 ? palm(R() * 1e9 | 0) : broadTree(R() * 1e9 | 0), bandR + 1.2 + R() * 10, z, R() * 6); z += 5 + R() * 7; }
  }
  for (let i = 0; i < 26; i++) addD(R() < 0.55 ? palm(R() * 1e9 | 0) : broadTree(R() * 1e9 | 0), (R() < 0.5 ? -1 : 1) * (26 + R() * 40), Z0 + R() * SPAN, R() * 6, 1.2);

  /* --- actors --- */
  const kinds = {};
  const actors = scen.actors.map((a) => {
    let model, parts = null;
    switch (a.kind) {
      case "car": model = carModel(a.color); break;
      case "bus": model = busModel(a.color); break;
      case "truck": model = truckModel(a.color, a.id); break;
      case "auto": model = autoModel(a.color); break;
      case "bike": model = bikeModel(a.color, a.id); break;
      case "cycle": model = cycleModel(a.id); break;
      case "ball": model = ballModel(); break;
      case "ped": parts = personParts(a.id, a.color); break;
      case "cow": parts = cowModel(a.id); break;
      case "dog": parts = dogModel(); break;
      default: model = carModel(a.color);
    }
    const o = { a, id: a.id, kind: a.kind, yaw: null, phase: 0, last: null };
    if (model) { o.m = mk(model.b); o.lights = model.lights; o.r = model.r; o.h = model.h; }
    else {
      o.body = mk(parts.body); o.leg = mk(parts.leg); o.arm = parts.arm ? mk(parts.arm) : null;
      o.legs = parts.legs; o.sc = parts.scale || 1; o.r = parts.r; o.h = parts.h;
    }
    kinds[a.kind] = 1;
    return o;
  });
  const egoM = carModel(opts.egoColor || "#e5e7eb");
  const ego = { m: mk(egoM.b), lights: egoM.lights };

  /* decals: unit quad in xz with uv −1..1, billboard quad in xy */
  const dq = (verts) => { const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null); meshes.push({ vao, buf }); return vao; };
  const flatQ = dq([-1, 0, -1, -1, -1, 1, 0, -1, 1, -1, 1, 0, 1, 1, 1, -1, 0, -1, -1, -1, 1, 0, 1, 1, 1, -1, 0, 1, -1, 1]);
  const bbQ = dq([-1, -1, 0, -1, -1, 1, -1, 0, 1, -1, 1, 1, 0, 1, 1, -1, -1, 0, -1, -1, 1, 1, 0, 1, 1, -1, 1, 0, -1, 1]);
  const skyVao = (() => { const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); meshes.push({ vao, buf }); return vao; })();
  /* rain streaks */
  const RAIN = scen.mood === "rain" ? 900 : 0;
  let rainVao = null, rainBuf = null, rainPts = null, rainSeed = rng(5);
  if (RAIN) {
    rainPts = []; for (let i = 0; i < RAIN; i++) rainPts.push([(rainSeed() - 0.5) * 30, rainSeed() * 14, -rainSeed() * 40 + 8]);
    rainVao = gl.createVertexArray(); rainBuf = gl.createBuffer(); gl.bindVertexArray(rainVao); gl.bindBuffer(gl.ARRAY_BUFFER, rainBuf);
    gl.bufferData(gl.ARRAY_BUFFER, RAIN * 2 * 20, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null); meshes.push({ vao: rainVao, buf: rainBuf });
  }

  /* --- camera --- */
  const CAMS = {
    drive: { eye: [0, 3.05, 7.6], at: [0, 0.9, -20], fov: 40 },
    top: { eye: [0.4, 20, 17], at: [0.4, 0, -6], fov: 50 },
  };
  let camKey = CAMS[opts.view] ? opts.view : "drive", camT = 1, camFrom = null;
  const camNow = () => {
    const to = CAMS[camKey], f = camFrom || to, t = camT < 1 ? 1 - Math.pow(1 - camT, 3) : 1;
    const L = (a, b2) => a.map((v, i) => v + (b2[i] - v) * t);
    return { eye: L(f.eye, to.eye), at: L(f.at, to.at), fov: f.fov + (to.fov - f.fov) * t };
  };
  let shakeT = 0;

  /* --- state, timing --- */
  let lastCull = null, scroll = 0, spd = 0, spdTo = 0, spdRate = 1, raf = 0, last = performance.now(), time = 0, alive = true, lastVP = null, lastMirror = null, dirty = true;
  const W = { w: 1, h: 1 };
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    W.w = w; W.h = h; dirty = true;
  };
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); resize();

  const pos = (o) => {
    const p = (state.pos || {})[o.id];
    const x = p ? p[0] : o.a.x, y = p ? p[1] : o.a.y, rot = p ? p[2] : (o.a.rot || 0);
    return { X: WX(x), Z: WZ(y), rot };
  };
  const yawOf = (rot) => { const r = rot * Math.PI / 180; return Math.atan2(Math.sin(r) * SX, Math.cos(r) * SZ); };

  /* lights list (night/rain/fog) */
  const lights = [];
  const pushL = (p, range, col, inten, dir, cut) => { if (lights.length < 10) lights.push({ p, range, col, inten, dir: dir || [0, 0, 0], cut: cut || 0 }); };

  const drawMesh = (m, Mtx, brake = 0, tint = 0, tintC = [1, 0.75, 0.2]) => {
    gl.uniformMatrix4fv(P1.u.uModel, false, Mtx); gl.uniform1f(P1.u.uBrake, brake);
    gl.uniform1f(P1.u.uTintAmt, tint); gl.uniform3fv(P1.u.uTint, tintC);
    gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n);
  };
  const wrapZ = (z0) => { const t = ((z0 + scroll - Z0) % SPAN + SPAN) % SPAN; return t + Z0; };

  const egoPos = () => ({ X: EGO.x, Z: EGO.z + ((state.ego && state.ego.y) || 0) * SZ });

  /* per-frame actor transforms */
  const actorFrames = () => actors.map((o) => {
    const p = pos(o);
    let yaw = yawOf(p.rot);
    if (o.kind === "ped" || o.kind === "cow" || o.kind === "dog") {
      if (o.last) {
        const dx = p.X - o.last.X, dz = p.Z - o.last.Z, d = Math.hypot(dx, dz);
        if (d > 0.0005) { const want = Math.atan2(dx, -dz); o.yaw = o.yaw == null ? want : o.yaw + Math.atan2(Math.sin(want - o.yaw), Math.cos(want - o.yaw)) * 0.25; o.phase += d / (o.kind === "ped" ? 0.33 * o.sc : 0.45); }
        o.moving = d > 0.0005;
      }
      if (o.yaw == null) o.yaw = yaw;
      yaw = o.yaw;
    }
    o.last = p;
    o.X = p.X; o.Z = p.Z; o.Y = yaw;
    return o;
  });

  const lightWorld = (o, l, X, Zz, yaw) => { const c = Math.cos(yaw), s = Math.sin(yaw); return [X + l[0] * c - l[2] * s, l[1], Zz + l[0] * s + l[2] * c]; };

  function render(vp, eye, opt) {
    const md = mood;
    gl.useProgram(P1.p);
    gl.uniformMatrix4fv(P1.u.uVP, false, vp);
    gl.uniform3fv(P1.u.uCam, eye); gl.uniform3fv(P1.u.uSunDir, md.sun); gl.uniform3fv(P1.u.uSunCol, md.sunC);
    gl.uniform3fv(P1.u.uSky, md.sky); gl.uniform3fv(P1.u.uGnd, md.gnd); gl.uniform3fv(P1.u.uFog, md.fog);
    gl.uniform1f(P1.u.uFogDen, md.den); gl.uniform1f(P1.u.uWet, md.wet); gl.uniform1f(P1.u.uNight, md.night);
    gl.uniform1f(P1.u.uScroll, scroll); gl.uniform1f(P1.u.uFade, 1); gl.uniform4f(P1.u.uMul, 1, 1, 1, 1);
    gl.uniform1i(P1.u.uNL, lights.length);
    if (lights.length) {
      const LP = new Float32Array(40), LC = new Float32Array(40), LD = new Float32Array(40);
      lights.forEach((l, i) => { LP.set([...l.p, l.range], i * 4); LC.set([...l.col, l.inten], i * 4); LD.set([...l.dir, l.cut], i * 4); });
      gl.uniform4fv(P1.u.uLP, LP); gl.uniform4fv(P1.u.uLC, LC); gl.uniform4fv(P1.u.uLD, LD);
    }
    const I = M.trs(0, 0, 0, 0);
    drawMesh(ground, I);
    fixed.forEach((f) => drawMesh(f.m, f.M));
    const jz0 = WZ(196) - 2, jz1 = WZ(260) + 2;
    decor.forEach((d) => {
      const zz = wrapZ(d.z);
      if (junction && d.skipJ && d.x < 0 && zz > jz0 && zz < jz1) return;
      if (opt.cullZ != null && zz > opt.cullZ + 14) return;
      drawMesh(d.m, M.trs(d.x, 0, zz, d.yaw, d.s));
    });
    actors.forEach((o) => {
      if (opt.cullZ != null && o.Z - o.r * 0.55 > opt.cullZ) return;   // behind the camera: it's in the mirror
      const hz = state.hazard === o.id, tint = hz ? 0.18 + 0.12 * Math.sin(time * 6) : 0, brake = (state.brake || {})[o.id] ? 1 : 0;
      const base = M.trs(o.X, 0, o.Z, o.Y);
      if (o.m) { drawMesh(o.m, base, brake, tint); return; }
      if (o.kind === "ped") {
        const swing = o.moving || (state.walk || {})[o.id] ? Math.sin(o.phase) * 0.55 : 0, bob = Math.abs(Math.sin(o.phase)) * 0.025 * (swing ? 1 : 0);
        const root = M.mul(base, M.mul(M.t(0, bob, 0), M.s(o.sc, o.sc, o.sc)));
        drawMesh(o.body, root, 0, tint);
        [-1, 1].forEach((s) => {
          drawMesh(o.leg, M.mul(root, M.mul(M.t(s * 0.09, 0.92, 0), M.rx(s * swing))), 0, tint);
          drawMesh(o.arm, M.mul(root, M.mul(M.t(s * 0.235, 1.4, 0), M.mul(M.rx(-s * swing * 0.8), M.rz(s * 0.06)))), 0, tint);
        });
      } else {
        drawMesh(o.body, base, 0, tint);
        const swing = o.moving ? Math.sin(o.phase * 1.4) * 0.4 : 0;
        o.legs.forEach((l, i) => drawMesh(o.leg, M.mul(base, M.mul(M.t(l[0], l[1], l[2]), M.rx((i === 0 || i === 3 ? 1 : -1) * swing))), 0, tint));
      }
    });
    if (!opt.mirror) {
      const e = egoPos();
      drawMesh(ego.m, M.trs(e.X, 0, e.Z, 0), state.egoBrake ? 1 : 0, 0);
    }

    /* decals */
    gl.useProgram(P2.p);
    gl.uniformMatrix4fv(P2.u.uVP, false, vp); gl.uniform1f(P2.u.uTime, time);
    gl.enable(gl.BLEND); gl.depthMask(false);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(P2.u.uMode, 0);
    const shadow = (X, Zz, yaw, w, l, a) => { gl.uniform4f(P2.u.uCol, 0, 0, 0, a); gl.uniformMatrix4fv(P2.u.uModel, false, M.mul(M.trs(X, 0.02, Zz, yaw), M.s(w, 1, l))); gl.bindVertexArray(flatQ); gl.drawArrays(gl.TRIANGLES, 0, 6); };
    actors.forEach((o) => {
      if (opt.cullZ != null && o.Z - o.r * 0.55 > opt.cullZ) return;
      const big = { car: [1.35, 2.75], bus: [1.6, 5.9], truck: [1.6, 4.8], auto: [0.9, 1.6], bike: [0.45, 1.1], cycle: [0.35, 0.9], ped: [0.32, 0.32], cow: [0.55, 1.1], dog: [0.25, 0.45], ball: [0.16, 0.16] }[o.kind] || [1, 1];
      shadow(o.X, o.Z, o.Y, big[0] * (o.sc || 1), big[1] * (o.sc || 1), md.shadow);
    });
    if (!opt.mirror) { const e = egoPos(); shadow(e.X, e.Z, 0, 1.25, 2.6, md.shadow); }
    if (state.hazard && state.ring !== false) {
      const o = actors.find((x) => x.id === state.hazard);
      if (o && !(opt.cullZ != null && o.Z - o.r * 0.55 > opt.cullZ)) {
        gl.uniform1i(P2.u.uMode, 1); gl.uniform4f(P2.u.uCol, 1, 0.42, 0.32, 0.95);
        const rr = Math.max(1.1, o.r * 0.9);
        gl.uniformMatrix4fv(P2.u.uModel, false, M.mul(M.t(o.X, 0.03, o.Z), M.s(rr, 1, rr))); gl.bindVertexArray(flatQ); gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }
    if (state.pickHint) {
      gl.uniform1i(P2.u.uMode, 1); gl.uniform4f(P2.u.uCol, 0.98, 0.75, 0.15, 0.55);
      actors.forEach((o) => { if (opt.cullZ != null && o.Z - o.r * 0.55 > opt.cullZ) return; const rr = Math.max(0.9, o.r * 0.8);
        gl.uniformMatrix4fv(P2.u.uModel, false, M.mul(M.t(o.X, 0.03, o.Z), M.s(rr, 1, rr))); gl.bindVertexArray(flatQ); gl.drawArrays(gl.TRIANGLES, 0, 6); });
    }
    /* glows (additive billboards) */
    const glowOn = md.night > 0.2;
    gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1i(P2.u.uMode, 2);
    const camR = norm([opt.view[0], opt.view[4], opt.view[8]]), camU = norm([opt.view[1], opt.view[5], opt.view[9]]);
    const glow = (p, size, col) => {
      const m = new Float32Array([camR[0] * size, camR[1] * size, camR[2] * size, 0, camU[0] * size, camU[1] * size, camU[2] * size, 0, 0, 0, 1, 0, p[0], p[1], p[2], 1]);
      gl.uniform4f(P2.u.uCol, col[0], col[1], col[2], 1); gl.uniformMatrix4fv(P2.u.uModel, false, m); gl.bindVertexArray(bbQ); gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    const fogK = scen.mood === "fog" ? 1.8 : 1;
    actors.forEach((o) => {
      if (!o.lights || (opt.cullZ != null && o.Z - o.r * 0.55 > opt.cullZ)) return;
      const brake = (state.brake || {})[o.id];
      const fx = Math.sin(o.Y), fz = -Math.cos(o.Y), tc = norm([eye[0] - o.X, 0, eye[2] - o.Z]), facing = fx * tc[0] + fz * tc[2];
      if (glowOn && facing > 0.15) o.lights.head.forEach((l) => glow(lightWorld(o, l, o.X, o.Z, o.Y), 0.9 * fogK, [0.9, 0.82, 0.62]));
      if ((glowOn || brake) && facing < -0.15) o.lights.tail.forEach((l) => glow(lightWorld(o, l, o.X, o.Z, o.Y), (brake ? 0.75 : 0.4) * fogK, brake ? [0.9, 0.05, 0.03] : [0.35, 0.02, 0.01]));
    });
    if (!opt.mirror && (glowOn || state.egoBrake)) { const e = egoPos(); ego.lights.tail.forEach((l) => glow(lightWorld(ego, l, e.X, e.Z, 0), state.egoBrake ? 0.7 : 0.35, state.egoBrake ? [0.9, 0.05, 0.03] : [0.3, 0.02, 0.01])); }
    if (glowOn) decor.forEach((d) => { if (d.lamp == null) return; const zz = wrapZ(d.z); if (opt.cullZ != null && zz > opt.cullZ) return; glow([d.x + d.lamp, 7.1, zz], scen.mood === "fog" ? 1.1 : 1.4, scen.mood === "fog" ? [0.22, 0.2, 0.16] : [0.55, 0.42, 0.22]); });
    /* rain */
    if (RAIN) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.uniform1i(P2.u.uMode, 3); gl.uniform4f(P2.u.uCol, 0.75, 0.8, 0.88, 0.32);
      gl.uniformMatrix4fv(P2.u.uModel, false, M.t(0, 0, 0)); gl.bindVertexArray(rainVao); gl.drawArrays(gl.LINES, 0, RAIN * 2);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
  }

  // lamp heads (for glows and night lighting): the first decor items are the lamp pairs
  decor.forEach((d) => { d.lamp = null; });
  (() => { let i = 0; for (let zz = Z0; zz < Z0 + SPAN; zz += 30) { decor[i].lamp = 1.75; decor[i + 1].lamp = -1.75; i += 2; } })();

  function sky(vp) {
    gl.useProgram(P3.p);
    const h = M.apply(vp, [0, 0, -2000, 1]);
    gl.uniform3fv(P3.u.uTop, mood.top); gl.uniform3fv(P3.u.uHor, mood.hor);
    gl.uniform1f(P3.u.uHorY, h[3] > 0 ? h[1] / h[3] : -1);
    gl.depthMask(false); gl.bindVertexArray(skyVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
  }

  function frame(now) {
    if (!alive) return;
    if (!canvas.isConnected) { api.destroy(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (spd !== spdTo) { const k = Math.min(1, dt * spdRate); spd += (spdTo - spd) * k; if (Math.abs(spd - spdTo) < 0.004) spd = spdTo; }
    scroll += spd * BASE_MS * dt;
    if (camT < 1) camT = Math.min(1, camT + dt / 0.8);
    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (opts.onSpeed) opts.onSpeed(spd);
    actorFrames();
    if (RAIN) {
      const fall = 22 * dt, arr = new Float32Array(RAIN * 10);
      rainPts.forEach((p, i) => {
        p[1] -= fall; p[2] += spd * BASE_MS * dt * 0.6;
        if (p[1] < 0 || p[2] > 12) { p[0] = (rainSeed() - 0.5) * 30; p[1] = 8 + rainSeed() * 6; p[2] = 8 - rainSeed() * 40; }
        const zz = EGO.z + p[2] - 8;
        arr.set([EGO.x + p[0], p[1], zz, 0, 0, EGO.x + p[0] - 0.05, p[1] + 0.55, zz - spd * 0.25, 0, 0], i * 10);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, rainBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
    }
    /* lights for this frame */
    lights.length = 0;
    if (mood.night > 0.2) {
      const e = egoPos();
      [-0.62, 0.62].forEach((x) => pushL([e.X + x, 0.75, e.Z - 2.2], 48, [1, 0.92, 0.75], scen.mood === "night" ? 5.5 : 3.2, norm([0, -0.07, -1]), Math.cos(0.42)));
      actors.forEach((o) => {
        if (!o.lights || !o.lights.head.length) return;
        const l = lightWorld(o, o.lights.head[0], o.X, o.Z, o.Y);
        pushL([l[0], l[1], l[2]], 30, [1, 0.9, 0.7], 3.2, norm([Math.sin(o.Y), -0.08, -Math.cos(o.Y)]), Math.cos(0.5));
      });
      if (scen.mood === "night") {
        const lamps = decor.filter((d) => d.lamp != null).map((d) => ({ d, zz: wrapZ(d.z) })).filter((x) => x.zz > EGO.z - 45 && x.zz < EGO.z + 8).sort((a2, b2) => Math.abs(a2.zz - EGO.z + 12) - Math.abs(b2.zz - EGO.z + 12));
        lamps.slice(0, 10 - lights.length).forEach((x) => pushL([x.d.x + x.d.lamp, 7, x.zz], 17, [1, 0.72, 0.4], 2.4));
      }
    }
    /* main view */
    const cam = camNow(), e = egoPos();
    const sh = shakeT > 0 ? shakeT * 0.25 : 0;
    const asp = W.w / W.h, port = camKey === "drive" ? Math.max(0, Math.min(1, (1.2 - asp) / 0.45)) : 0;   // tall screens: pull back
    const eye = [e.X + cam.eye[0] + (Math.random() - 0.5) * sh, cam.eye[1] + port * 1.1 + (Math.random() - 0.5) * sh, e.Z + cam.eye[2] + port * 3.2];
    const at = [e.X * 0.55 + cam.at[0], cam.at[1], e.Z + cam.at[2]];
    if (camKey === "top") { eye[0] = cam.eye[0]; at[0] = cam.at[0]; }
    const fov = (cam.fov + port * 10 + (camKey === "top" && asp < 1 ? 14 : 0)) * Math.PI / 180;
    const view = M.look(eye, at, [0, 1, 0]), proj = M.persp(fov, asp, 0.1, 700), vp = M.mul(proj, view);
    lastVP = vp;
    gl.viewport(0, 0, W.w, W.h); gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    sky(vp);
    lastCull = camKey === "drive" ? e.Z + 2.2 : null;          // anything behind our car is shown in the mirror
    render(vp, eye, { view, cullZ: lastCull });
    /* rear-view mirror (driver view only) */
    lastMirror = null;
    if (camKey === "drive" && camT >= 1 && opts.mirror !== false) {
      const mw = Math.round(W.w * (asp < 1 ? 0.5 : 0.32)), mh = Math.round(mw * 0.3), mx = Math.round((W.w - mw) / 2), my = Math.round(W.h - mh - W.h * 0.035);
      const meye = [e.X + 0.15, 1.3, e.Z + 2.3], mat = [e.X * 0.4, 0.55, e.Z + 40];
      const mview = M.look(meye, mat, [0, 1, 0]), mproj = M.mul(M.s(-1, 1, 1), M.persp(30 * Math.PI / 180, mw / mh, 0.3, 400));
      const mvp = M.mul(mproj, mview);
      gl.enable(gl.SCISSOR_TEST); gl.scissor(mx, my, mw, mh); gl.viewport(mx, my, mw, mh);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      sky(mvp);
      render(mvp, meye, { view: mview, mirror: true, cullZ: null });
      gl.disable(gl.SCISSOR_TEST);
      lastMirror = { vp: mvp, x: mx, y: my, w: mw, h: mh };
      if (opts.onMirror) opts.onMirror({ x: mx / W.w, y: 1 - (my + mh) / W.h, w: mw / W.w, h: mh / W.h });
    } else if (opts.onMirror) opts.onMirror(null);
    dirty = false;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  const lost = (ev) => { ev.preventDefault(); if (opts.onLost) opts.onLost(); api.destroy(); };
  canvas.addEventListener("webglcontextlost", lost);

  const project = (vp, p, vx, vy, vw, vh) => {
    const c = M.apply(vp, [p[0], p[1], p[2], 1]); if (c[3] <= 0.05) return null;
    return [vx + (c[0] / c[3] * 0.5 + 0.5) * vw, vy + (c[1] / c[3] * 0.5 + 0.5) * vh, c[3]];
  };
  const api = {
    view(k) { if (!CAMS[k] || k === camKey) return; camFrom = camNow(); camKey = k; camT = 0; },
    get viewKey() { return camKey; },
    speed(v, secs = 0.5) { spdTo = v; spdRate = secs > 0 ? 3 / secs : 1000; if (secs <= 0) spd = v; },
    shake() { shakeT = 0.6; },
    /* nearest actor to a tap, in the main view or the mirror */
    pick(cx, cy) {
      if (!lastVP) return null;
      const r = canvas.getBoundingClientRect(), dpr = W.w / r.width;
      const px = (cx - r.left) * dpr, py = W.h - (cy - r.top) * dpr;
      let best = null, bd = Infinity;
      const tryV = (vp, vx, vy, vw, vh, cull) => actors.forEach((o) => {
        if (cull != null && o.Z - o.r * 0.55 > cull) return;
        const c = project(vp, [o.X, o.h, o.Z], vx, vy, vw, vh), q = project(vp, [o.X + o.r, o.h, o.Z], vx, vy, vw, vh);
        if (!c) return;
        if (c[0] < vx || c[0] > vx + vw || c[1] < vy || c[1] > vy + vh) return;
        const rad = Math.max(30 * dpr, q ? Math.hypot(q[0] - c[0], q[1] - c[1]) * 1.3 : 0);
        const d = Math.hypot(px - c[0], py - c[1]);
        if (d < rad && d / rad < bd) { bd = d / rad; best = o.id; }
      });
      if (lastMirror && px >= lastMirror.x && px <= lastMirror.x + lastMirror.w && py >= lastMirror.y && py <= lastMirror.y + lastMirror.h) {
        tryV(lastMirror.vp, lastMirror.x, lastMirror.y, lastMirror.w, lastMirror.h, null);
      } else {
        tryV(lastVP, 0, 0, W.w, W.h, lastCull);
      }
      return best;
    },
    /* client coordinates of an actor in the main view (tests, keyboard focus rings) */
    where(id) {
      const o = actors.find((x) => x.id === id); if (!o || !lastVP) return null;
      const r = canvas.getBoundingClientRect(), cull = lastCull;
      const c = cull != null && o.Z - o.r * 0.55 > cull
        ? (lastMirror ? project(lastMirror.vp, [o.X, o.h, o.Z], lastMirror.x, lastMirror.y, lastMirror.w, lastMirror.h) : null)
        : project(lastVP, [o.X, o.h, o.Z], 0, 0, W.w, W.h);
      return c ? [r.left + c[0] / W.w * r.width, r.top + (1 - c[1] / W.h) * r.height] : null;
    },
    destroy() {
      if (!alive) return; alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect();
      canvas.removeEventListener("webglcontextlost", lost);
      meshes.forEach((m) => { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.buf); });
      [P1, P2, P3].forEach((p) => gl.deleteProgram(p.p));
      const lc = gl.getExtension("WEBGL_lose_context"); if (lc) lc.loseContext();      // free the context now, not at GC
    },
  };
  return api;
};
/* the toolkit, shared with the science-lab stage (lab3d.js) */
H3.kit = { M, B, C, lin, mixc, shade, rng, hashStr, norm, cross, dot, sub, SHIRTS, PANTS,
  carModel, busModel, truckModel, autoModel, bikeModel, cycleModel, personParts, cowModel, dogModel, ballModel,
  palm, broadTree, shrub, lamp, ePole, shop, keralaHouse, flats, signPost, signal, hill, milestone, barrierPost,
  VS, FS, VS2, FS2, VSKY, FSKY, prog, upload, MOODS };
window.Hz3D = H3;
})();
