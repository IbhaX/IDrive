/* iDrive lab3d.js — 3D stage for the driving-science labs.
   Built on the hazard engine's toolkit (Hz3D.kit, WebGL2, no CDN). A lab
   scene is a function called every frame that draws in immediate mode:

     scene(S, ctx)   ctx = { st, r, t, idle, time }
       S.cam(eye, at, fov)            camera target (smoothed; the student can orbit by dragging)
       S.mood(name)                   day | night | rain | fog | studio (+ S.fog(metres) for visibility)
       S.ground(kind)                 "road" (straight road along −Z) | "studio" | "none"
       S.car(x, z, o)                 vehicle; o = {kind, color, yaw, y, pitch, roll, brake, tint, scale}
       S.person(x, z, o)              figure; o = {yaw, scale, id, walk}
       S.box / S.cyl / S.sph / S.cone primitives (world units, colour "#hex", alpha)
       S.strip(x0, z0, x1, z1, col, a) flat marking on the ground
       S.arrow(from, to, col, w)      3D arrow
       S.mesh(key, build, matrix, o)  custom geometry, cached by key (rebuilt when key changes)
       S.label(key, [x,y,z], html, cls) DOM label pinned to a 3D point
       S.glow([x,y,z], size, col)     additive light glow
       S.live()                       keep animating this frame (wind, spinning parts…)
   Lab3D.attach(viz, id, get) mounts a stage above a lab's diagram, with a
   "3D | Diagram" switch; returns { dirty(), run(dur), ground(cx, cy), destroy() }. */
(() => {
"use strict";
if (!window.Hz3D || !Hz3D.kit) return;
const K = Hz3D.kit, { M, B, lin, norm, cross, prog, upload } = K;
const SCENES = {};
const L3 = { scenes: SCENES, def: (id, sc) => { SCENES[id] = sc; }, has: (id) => !!SCENES[id] && Hz3D.supported() };

const MOODS = Object.assign({}, K.MOODS, {
  labnight: { sun: norm([0.3, 0.7, -0.4]), sunC: [0.16, 0.18, 0.28], sky: [0.07, 0.08, 0.14], gnd: [0.03, 0.03, 0.04], fog: [0.02, 0.025, 0.05], den: 0.01, top: [0.005, 0.01, 0.035], hor: [0.04, 0.05, 0.1], wet: 0, night: 1, shadow: 0.3 },
  studio: { sun: norm([-0.5, 0.8, 0.55]), sunC: [2.1, 2.05, 2.0], sky: [0.5, 0.55, 0.62], gnd: [0.22, 0.22, 0.24], fog: [0.72, 0.75, 0.8], den: 0.006, top: [0.32, 0.38, 0.5], hor: [0.78, 0.8, 0.84], wet: 0, night: 0, shadow: 0.55 },
});
const colCache = {};
const col = (c) => (Array.isArray(c) ? c : colCache[c] || (colCache[c] = lin(c)));

/* ---------- unit primitives ---------- */
const prim = {
  cube: () => new B().box(-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, [1, 1, 1], 0, 0.25),
  cyl: () => new B().cyl(0, 0, 0, 1, 1, "y", 24, [1, 1, 1], 0, 0.3),
  sph: () => new B().sph(0, 0, 0, 1, 1, 1, [1, 1, 1], 20, false, 0, 0.35),
  cone: () => new B().cone(0, 0, 0, 1, 1, 0, 20, [1, 1, 1], 0, 0.3),
  ring: () => { const b = new B(); for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, c = (i + 1) / 48 * Math.PI * 2; b.quad([Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86], [Math.cos(a), 0, Math.sin(a)], [Math.cos(c), 0, Math.sin(c)], [Math.cos(c) * 0.86, 0, Math.sin(c) * 0.86], [1, 1, 1], 0, 0.2, [0, 1, 0]); } return b; },
};
/* matrix whose Y axis points along dir (for arrows, rods) */
const alignY = (p, dir, w, len) => {
  const y = norm(dir), ref = Math.abs(y[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = norm(cross(ref, y)), z = cross(x, y);
  return new Float32Array([x[0] * w, x[1] * w, x[2] * w, 0, y[0] * len, y[1] * len, y[2] * len, 0, z[0] * w, z[1] * w, z[2] * w, 0, p[0], p[1], p[2], 1]);
};

/* ---------- static environments ---------- */
function roadEnv(o) {
  const g = new B(), L = o.length || 260, W = o.width || 3.6, lanes = o.lanes || 2, z1 = 40, z0 = -L;
  const half = W * lanes / 2;
  g.flat(-400, -900, 400, 300, -0.02, K.C.grass, -4, 0.02);
  g.flat(-half, z0, half, z1, 0, K.C.tarmac, -3, 0.12);
  for (let i = 1; i < lanes; i++) { const x = -half + i * W; for (let z = z1; z > z0; z -= 9) g.flat(x - 0.07, z - 4, x + 0.07, z, 0.012, K.C.white, 0, 0.25); }
  g.flat(-half + 0.15, z0, -half + 0.3, z1, 0.012, K.C.white, 0, 0.2); g.flat(half - 0.3, z0, half - 0.15, z1, 0.012, K.C.white, 0, 0.2);
  [-1, 1].forEach((s) => {
    const k = s * half, w = s * (half + 1.6);
    g.box(Math.min(k, w), 0, z0, Math.max(k, w), 0.15, z1, K.C.walk, 0, 0.05);
    g.flat(Math.min(k, w), z0, Math.max(k, w), z1, 0.151, K.C.walk, -6, 0.05);
    g.quad([k, 0, z0], [k, 0, z1], [k, 0.16, z1], [k, 0.16, z0], K.C.kerb, -1, 0.1, [-s, 0, 0]);
  });
  return g;
}
function studioEnv() {
  const g = new B(), c = lin("#c9ccd2");
  g.flat(-300, -300, 300, 300, -0.01, lin("#8f949c"), -4, 0.04);
  g.flat(-16, -16, 16, 16, 0, c, -6, 0.15);
  return g;
}
function scenery(o, seed) {
  const r = K.rng(seed), items = [], L = o.length || 260, half = (o.width || 3.6) * (o.lanes || 2) / 2;
  for (let z = 20; z > -L; z -= 26 + r() * 10) {
    [-1, 1].forEach((s) => {
      const k = r();
      const x = s < 0 ? -(half + 3 + r() * 9) : half + 16 + r() * 14;   // keep the camera side (+x) clear
      items.push({ b: k < 0.55 ? K.palm(r() * 1e9 | 0) : K.broadTree(r() * 1e9 | 0), x, z: z - r() * 10, yaw: r() * 6 });
    });
    if (r() < 0.5) items.push({ b: K.lamp(-1), x: -half - 1.9, z, yaw: 0 });
  }
  for (let i = 0; i < 6; i++) items.push({ b: K.hill(seed + i), x: (i % 2 ? 1 : -1) * (130 + r() * 70), z: -220 - r() * 200, yaw: r() * 3 });
  return items;
}

/* ---------- the stage ---------- */
L3.attach = (viz, id, get) => {
  const sc = SCENES[id];
  if (!sc || !Hz3D.supported() || !viz) return null;
  const wrap = document.createElement("div");
  wrap.className = "lab3";
  wrap.innerHTML = `<canvas aria-hidden="true"></canvas><div class="lab3lbl"></div>
    <div class="lab3ctl seg" role="group"><button type="button" class="on" data-l3view="3d" aria-pressed="true">3D</button><button type="button" data-l3view="2d" aria-pressed="false">${I18n.esc(I18n.one(I18n.u("lab3Diagram")))}</button></div>
    <button type="button" class="lab3reset" hidden aria-label="${I18n.attr(I18n.u("lab3Reset"))}">⟲</button>
    <button type="button" class="scenebtn" hidden></button>
    <p class="lab3hint">${I18n.esc(I18n.one(I18n.u(sc.hint || "lab3Drag")))}</p>`;
  viz.prepend(wrap);
  viz.classList.add("has3d");
  const playBtn = wrap.querySelector(".scenebtn"), toolbar = wrap.querySelector(".lab3ctl"), hintEl = wrap.querySelector(".lab3hint");
  setTimeout(() => hintEl.classList.add("gone"), 5000);
  const canvas = wrap.querySelector("canvas"), lblHost = wrap.querySelector(".lab3lbl"), resetBtn = wrap.querySelector(".lab3reset");
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: false });
  if (!gl) { wrap.remove(); viz.classList.remove("has3d"); return null; }
  let P1, P2, P3;
  try { P1 = prog(gl, K.VS, K.FS); P2 = prog(gl, K.VS2, K.FS2); P3 = prog(gl, K.VSKY, K.FSKY); }
  catch (err) { console.warn("lab3d", err); wrap.remove(); viz.classList.remove("has3d"); return null; }

  /* view switch: 3D (default) or the original diagram */
  let mode = "3d";
  try { mode = localStorage.getItem("idrive-lab3") === "2d" ? "2d" : "3d"; } catch (err) {}
  const setMode = (m) => {
    mode = m; viz.classList.toggle("show2d", m === "2d");
    wrap.querySelectorAll("[data-l3view]").forEach((b) => { const on = b.dataset.l3view === m; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    try { localStorage.setItem("idrive-lab3", m); } catch (err) {}
    dirty = true;
  };
  wrap.querySelector(".lab3ctl").addEventListener("click", (ev) => { const b = ev.target.closest("[data-l3view]"); if (b) setMode(b.dataset.l3view); });

  /* meshes */
  const cache = new Map(), dyn = new Map();
  const meshOf = (key, build) => { let m = cache.get(key); if (!m) { m = upload(gl, build()); cache.set(key, m); } return m; };
  const dynMesh = (slot, key, build) => {
    const cur = dyn.get(slot);
    if (cur && cur.key === key) return cur.m;
    if (cur) { gl.deleteVertexArray(cur.m.vao); gl.deleteBuffer(cur.m.buf); }
    const m = upload(gl, build()); dyn.set(slot, { key, m }); return m;
  };
  const quadVao = (() => { const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, -1, -1, -1, 1, 0, -1, 1, -1, 1, 0, 1, 1, 1, -1, 0, -1, -1, -1, 1, 0, 1, 1, 1, -1, 0, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null); return { vao, buf }; })();
  const bbVao = (() => { const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, -1, -1, 1, -1, 0, 1, -1, 1, 1, 0, 1, 1, -1, -1, 0, -1, -1, 1, 1, 0, 1, 1, -1, 1, 0, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null); return { vao, buf }; })();
  const lineVao = (() => { const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, 4000 * 20, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12); gl.bindVertexArray(null); return { vao, buf }; })();
  const skyVao = (() => { const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null); return { vao, buf }; })();

  /* environment */
  const envOpt = sc.env || { kind: "road" };
  let envMesh = null, envItems = [];
  if (envOpt.kind === "road") { envMesh = upload(gl, roadEnv(envOpt)); if (envOpt.scenery !== false) envItems = scenery(envOpt, K.hashStr(id)).map((x) => ({ m: upload(gl, x.b), M: M.trs(x.x, 0, x.z, x.yaw) })); }
  else if (envOpt.kind === "studio") envMesh = upload(gl, studioEnv());
  else if (envOpt.kind === "open") { const g = new B(); g.flat(-600, -900, 600, 400, -0.02, K.C.grass, -4, 0.02); envMesh = upload(gl, g);
    if (envOpt.scenery !== false) { const r = K.rng(K.hashStr(id)); for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = 45 + r() * 90; envItems.push({ m: upload(gl, r() < 0.6 ? K.palm(r() * 1e9 | 0) : K.broadTree(r() * 1e9 | 0)), M: M.trs(Math.cos(a) * d, 0, Math.sin(a) * d - 20, r() * 6) }); }
      for (let i = 0; i < 5; i++) envItems.push({ m: upload(gl, K.hill(77 + i)), M: M.trs((i - 2) * 120, 0, -260 - r() * 120, r() * 3) }); } }

  /* per-frame draw lists */
  let opaque = [], trans = [], decals = [], glows = [], lines = [], labelsUsed = new Set(), live = false;
  let moodName = envOpt.mood || (envOpt.kind === "studio" ? "studio" : "day"), fogVis = 0;
  const camTarget = { eye: [12, 8, 14], at: [0, 0.8, 0], fov: 42 }, camNow = { eye: [12, 8, 14], at: [0, 0.8, 0], fov: 42 };
  let camInit = false, orbit = { yaw: 0, pitch: 0, zoom: 1 };
  const labels = new Map();

  const S = {
    cam(eye, at, fov = 42) { camTarget.eye = eye; camTarget.at = at; camTarget.fov = fov; },
    mood(n) { moodName = MOODS[n] ? n : "day"; },
    fog(m) { fogVis = m; },
    live() { live = true; },
    mesh(key, build, Mx, o = {}) { (o.alpha != null && o.alpha < 1 ? trans : opaque).push({ m: meshOf(key, build), M: Mx, o }); },
    dyn(slot, key, build, Mx, o = {}) { (o.alpha != null && o.alpha < 1 ? trans : opaque).push({ m: dynMesh(slot, key, build), M: Mx, o }); },
    prim(kind, Mx, color, alpha = 1, o = {}) { const c = col(color); (alpha < 1 ? trans : opaque).push({ m: meshOf("#" + kind, prim[kind]), M: Mx, o: Object.assign({ mul: [c[0], c[1], c[2], alpha] }, o) }); },
    box(x0, y0, z0, x1, y1, z1, color, alpha = 1, o) { S.prim("cube", M.mul(M.t((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), M.s(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))), color, alpha, o); },
    cyl(x, y, z, r, h, color, alpha = 1, o) { S.prim("cyl", M.mul(M.t(x, y, z), M.s(r, h, r)), color, alpha, o); },
    sph(x, y, z, r, color, alpha = 1, o) { S.prim("sph", M.mul(M.t(x, y, z), M.s(r, r, r)), color, alpha, o); },
    cone(x, y, z, r, h, color, alpha = 1, o) { S.prim("cone", M.mul(M.t(x, y, z), M.s(r, h, r)), color, alpha, o); },
    rod(a, b, w, color, alpha = 1) { const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); if (L < 1e-4) return; S.prim("cyl", alignY(a, d, w, L), color, alpha); },
    arrow(a, b, color, w = 0.12, alpha = 1) {
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = Math.hypot(...d); if (L < 0.05) return;
      const head = Math.min(L * 0.4, w * 4.5), n = d.map((v) => v / L), mid = [b[0] - n[0] * head, b[1] - n[1] * head, b[2] - n[2] * head];
      S.prim("cyl", alignY(a, d, w, L - head), color, alpha);
      S.prim("cone", alignY(mid, d, w * 2.6, head), color, alpha);
    },
    ring(x, z, r, color, alpha = 0.9, y = 0.03) { S.prim("ring", M.mul(M.t(x, y, z), M.s(r, 1, r)), color, alpha, { flat: true }); },
    strip(x0, z0, x1, z1, color, a = 0.85, y = 0.03) { const c = col(color); decals.push({ M: M.mul(M.t((x0 + x1) / 2, y, (z0 + z1) / 2), M.s(Math.abs(x1 - x0) / 2, 1, Math.abs(z1 - z0) / 2)), c: [c[0], c[1], c[2], a], mode: 3 }); },
    shadow(x, z, w, l, yaw = 0, a = null) { decals.push({ M: M.mul(M.trs(x, 0.02, z, yaw), M.s(w, 1, l)), c: [0, 0, 0, a == null ? MOODS[moodName].shadow : a], mode: 0 }); },
    glow(p, size, color) { glows.push({ p, size, c: col(color) }); },
    line(a, b, color, alpha = 1) { lines.push([a, b, col(color), alpha]); },
    car(x, z, o = {}) {
      const kind = o.kind || "car", c = o.color || (o.you ? "#2563eb" : "#e5e7eb");
      const key = kind + ":" + c + ":" + (o.id || "");
      const model = meshOf(key, () => (kind === "bus" ? K.busModel(c) : kind === "truck" ? K.truckModel(c, o.id || "") : kind === "auto" ? K.autoModel(c) : kind === "bike" ? K.bikeModel(c, o.id || "b") : kind === "cycle" ? K.cycleModel(o.id || "c") : K.carModel(c)).b);
      let Mx = M.trs(x, o.y || 0, z, o.yaw || 0, o.scale || 1);
      if (o.pitch || o.roll) {
        const piv = o.pivot || [0, 0, 0];
        Mx = M.mul(Mx, M.mul(M.t(piv[0], piv[1], piv[2]), M.mul(M.mul(M.rx(o.pitch || 0), M.rz(o.roll || 0)), M.t(-piv[0], -piv[1], -piv[2]))));
      }
      if (o.base) Mx = M.mul(o.base, Mx);
      if (o.post) Mx = M.mul(Mx, o.post);
      (o.alpha != null && o.alpha < 1 ? trans : opaque).push({ m: model, M: Mx, o: { brake: o.brake ? 1 : 0, tint: o.tint || 0, tintC: o.tintC, mul: o.alpha != null ? [1, 1, 1, o.alpha] : null } });
      if (o.shadow !== false && !o.base && !(o.alpha < 1)) { const sz = { car: [1.35, 2.75], bus: [1.6, 5.9], truck: [1.6, 4.8], auto: [0.9, 1.6], bike: [0.45, 1.1], cycle: [0.35, 0.9] }[kind] || [1.3, 2.7]; S.shadow(x, z, sz[0] * (o.scale || 1), sz[1] * (o.scale || 1), o.yaw || 0); }
      return Mx;
    },
    person(x, z, o = {}) {
      const id = o.id || "p0", parts = cache.get("P:" + id) || (() => { const p = K.personParts(id, o.color); const v = { body: upload(gl, p.body), leg: upload(gl, p.leg), arm: upload(gl, p.arm), sc: p.scale }; cache.set("P:" + id, v); return v; })();
      const sc = (o.scale || 1) * parts.sc, sw = o.walk ? Math.sin(o.walk) * 0.55 : 0;
      let root = M.mul(M.trs(x, o.y || 0, z, o.yaw || 0), M.s(sc, sc, sc));
      if (o.base) root = M.mul(o.base, root);
      if (o.lean) root = M.mul(root, M.rx(o.lean));
      const tint = o.tint || 0;
      opaque.push({ m: parts.body, M: root, o: { tint } });
      [-1, 1].forEach((s) => {
        opaque.push({ m: parts.leg, M: M.mul(root, M.mul(M.t(s * 0.09, 0.92, 0), M.rx(o.sit ? -1.45 : s * sw))), o: { tint } });
        opaque.push({ m: parts.arm, M: M.mul(root, M.mul(M.t(s * 0.235, 1.4, 0), M.mul(M.rx(o.armUp != null ? o.armUp : -s * sw * 0.8), M.rz(s * 0.06)))), o: { tint } });
      });
      if (o.shadow !== false && !o.base) S.shadow(x, z, 0.32 * sc, 0.32 * sc);
    },
    label(key, p, html, cls = "") {
      labelsUsed.add(key);
      let el = labels.get(key);
      if (!el) { el = document.createElement("div"); el.className = "l3l"; lblHost.appendChild(el); labels.set(key, el); el._h = null; el._c = null; }
      if (el._h !== html) { el.innerHTML = html; el._h = html; }
      if (el._c !== cls) { el.className = "l3l " + cls; el._c = cls; }
      el._p = p;
    },
    /* ground point under a client position (y = 0 plane) */
    ground(cx, cy) {
      if (!lastCam) return null;
      const r = canvas.getBoundingClientRect(), nx = ((cx - r.left) / r.width) * 2 - 1, ny = 1 - ((cy - r.top) / r.height) * 2;
      const { eye, f, rt, up, th, asp } = lastCam;
      const d = norm([f[0] + rt[0] * nx * th * asp + up[0] * ny * th, f[1] + rt[1] * nx * th * asp + up[1] * ny * th, f[2] + rt[2] * nx * th * asp + up[2] * ny * th]);
      if (d[1] >= -1e-4) return null;
      const k = -eye[1] / d[1];
      return [eye[0] + d[0] * k, eye[2] + d[2] * k];
    },
  };

  /* the big ▶ in the middle: clicks the lab's own run button, hides while
     the run animates and comes back when it has finished */
  const runCtl = () => { const sec = viz.closest(".lab") || viz.parentElement; return sec && sec.querySelector("[data-l3run],[data-act='labrun'],[data-act='lab.folrun'],[data-act='lab.corun'],[data-act='lab.endrop'],[data-act='lab.hlrun'],[data-act='engplay']"); };
  let playHold = 0;
  const syncPlay = () => {
    const ctl = runCtl();
    if (sc.noplay) { playBtn.hidden = true; return; }
    const busy = runDur > 0 || Date.now() < playHold || (sc.playing && sc.playing());
    if (!busy) { const name = ctl ? (ctl.textContent || "").replace(/[▶▼❚]/g, "").trim() : I18n.one(I18n.u("play")); if (playBtn._h !== name) { playBtn.innerHTML = `<i aria-hidden="true">${ctl && /▼/.test(ctl.textContent) ? "▼" : "▶"}</i>`; playBtn.setAttribute("aria-label", name); playBtn.title = name; playBtn._h = name; } }
    playBtn.hidden = busy;
  };
  playBtn.addEventListener("click", () => {
    dirty = true;
    const ctl = runCtl();
    playBtn.hidden = true;
    if (sc.hold) playHold = Date.now() + sc.hold * 1000;
    if (ctl) ctl.click();
    else api.run(sc.dur || 3);          // the scene's own animation
    setTimeout(syncPlay, 60);
  });

  /* run clock */
  let runT = 1, runDur = 0, idle = true, dirty = true, alive = true, raf = 0, last = performance.now(), time = 0, lastCam = null;
  const W = { w: 2, h: 2 };
  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr)), h = Math.max(2, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    W.w = w; W.h = h; dirty = true;
  };
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); resize();
  let visible = true;
  const io = window.IntersectionObserver ? new IntersectionObserver((en) => { visible = en[0].isIntersecting; if (visible) dirty = true; }) : null;
  if (io) io.observe(wrap);

  /* orbit by dragging (a short tap is passed to the scene as a click) */
  let drag = null;
  canvas.addEventListener("pointerdown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, yaw: orbit.yaw, pitch: orbit.pitch, moved: false }; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; hintEl.classList.add("gone");
    orbit.yaw = Math.max(-1.3, Math.min(1.3, drag.yaw - dx * 0.006));
    orbit.pitch = Math.max(-0.35, Math.min(0.55, drag.pitch + dy * 0.004));
    resetBtn.hidden = false; dirty = true;
  });
  const up = (ev) => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved && sc.click) { const p = S.ground(ev.clientX, ev.clientY); if (p) sc.click(p, get()); }
  };
  canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("wheel", (ev) => { if (!ev.ctrlKey && !ev.metaKey) return; ev.preventDefault(); orbit.zoom = Math.max(0.5, Math.min(1.8, orbit.zoom * (ev.deltaY > 0 ? 1.08 : 0.93))); resetBtn.hidden = false; dirty = true; }, { passive: false });
  resetBtn.addEventListener("click", () => { orbit = { yaw: 0, pitch: 0, zoom: 1 }; resetBtn.hidden = true; dirty = true; });

  const drawItem = (it, md) => {
    const o = it.o || {};
    gl.uniformMatrix4fv(P1.u.uModel, false, it.M);
    gl.uniform1f(P1.u.uBrake, o.brake || 0);
    gl.uniform1f(P1.u.uTintAmt, o.tint || 0); gl.uniform3fv(P1.u.uTint, o.tintC || [1, 0.7, 0.2]);
    const m = o.mul || [1, 1, 1, 1]; gl.uniform4f(P1.u.uMul, m[0], m[1], m[2], m[3] == null ? 1 : m[3]);
    gl.bindVertexArray(it.m.vao); gl.drawArrays(gl.TRIANGLES, 0, it.m.n);
  };

  const frame = (now) => {
    if (!alive) return;
    if (!canvas.isConnected) { api.destroy(); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
    if (runDur > 0) { runT = Math.min(1, runT + dt / runDur); if (runT >= 1) { runDur = 0; syncPlay(); } dirty = true; }
    if ((sc.playing || playHold) && (time % 0.25) < dt) syncPlay();
    const need = dirty || live || runDur > 0 || !camSettled();
    if (mode === "3d" && visible && !document.hidden && need) render(dt);
    raf = requestAnimationFrame(frame);
  };
  const camSettled = () => Math.hypot(...camNow.eye.map((v, i) => v - camTarget.eye[i])) < 0.01 && Math.hypot(...camNow.at.map((v, i) => v - camTarget.at[i])) < 0.01;

  function render(dt) {
    dirty = false; live = false;
    opaque = []; trans = []; decals = []; glows = []; lines = []; labelsUsed = new Set();
    const g0 = get();
    try { sc.scene(S, Object.assign({ t: runT, idle, time, running: runDur > 0 }, g0)); } catch (err) { console.warn("lab3d scene", id, err); }
    /* camera: ease towards the scene's target, then orbit around the look-at point */
    if (!camInit) { camNow.eye = camTarget.eye.slice(); camNow.at = camTarget.at.slice(); camNow.fov = camTarget.fov; camInit = true; }
    const k = Math.min(1, dt * 5);
    for (let i = 0; i < 3; i++) { camNow.eye[i] += (camTarget.eye[i] - camNow.eye[i]) * k; camNow.at[i] += (camTarget.at[i] - camNow.at[i]) * k; }
    camNow.fov += (camTarget.fov - camNow.fov) * k;
    const at = camNow.at, rel = [camNow.eye[0] - at[0], camNow.eye[1] - at[1], camNow.eye[2] - at[2]];
    const dist = Math.hypot(...rel) * orbit.zoom, yaw0 = Math.atan2(rel[0], rel[2]) + orbit.yaw, pit0 = Math.asin(Math.max(-0.99, Math.min(0.99, rel[1] / Math.hypot(...rel)))) + orbit.pitch;
    const pit = Math.max(0.03, Math.min(1.45, pit0));
    const eye = [at[0] + Math.sin(yaw0) * Math.cos(pit) * dist, at[1] + Math.sin(pit) * dist, at[2] + Math.cos(yaw0) * Math.cos(pit) * dist];
    const asp = W.w / W.h, fov = (camNow.fov + (asp < 1.1 ? 16 * (1.1 - asp) : 0)) * Math.PI / 180;
    const view = M.look(eye, at, [0, 1, 0]), proj = M.persp(fov, asp, 0.05, 1500), vp = M.mul(proj, view);
    const f = norm([at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]]), rt = norm(cross(f, [0, 1, 0])), upv = cross(rt, f);
    lastCam = { eye, f, rt, up: upv, th: Math.tan(fov / 2), asp, vp };

    const md = Object.assign({}, MOODS[moodName]);
    md.den *= 0.4;                                    // lab views look across a scene: lighter haze
    if (fogVis > 0) { md.den = 2.2 / fogVis; md.fog = [0.62, 0.64, 0.66]; md.hor = md.fog; md.top = [0.56, 0.58, 0.61]; }
    gl.viewport(0, 0, W.w, W.h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    /* sky */
    gl.useProgram(P3.p);
    const h = M.apply(vp, [eye[0] + f[0] * 2000, 0, eye[2] + f[2] * 2000, 1]);
    gl.uniform3fv(P3.u.uTop, md.top); gl.uniform3fv(P3.u.uHor, md.hor); gl.uniform1f(P3.u.uHorY, h[3] > 0 ? h[1] / h[3] : -1);
    gl.depthMask(false); gl.bindVertexArray(skyVao.vao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.depthMask(true);
    /* lit geometry */
    gl.useProgram(P1.p);
    gl.uniformMatrix4fv(P1.u.uVP, false, vp); gl.uniform3fv(P1.u.uCam, eye);
    gl.uniform3fv(P1.u.uSunDir, md.sun); gl.uniform3fv(P1.u.uSunCol, md.sunC); gl.uniform3fv(P1.u.uSky, md.sky); gl.uniform3fv(P1.u.uGnd, md.gnd); gl.uniform3fv(P1.u.uFog, md.fog);
    gl.uniform1f(P1.u.uFogDen, md.den); gl.uniform1f(P1.u.uWet, md.wet); gl.uniform1f(P1.u.uNight, md.night); gl.uniform1f(P1.u.uScroll, 0); gl.uniform1f(P1.u.uFade, 1);
    const Ls = S._lights || [];
    gl.uniform1i(P1.u.uNL, Ls.length);
    if (Ls.length) {
      const LP = new Float32Array(40), LC = new Float32Array(40), LD = new Float32Array(40);
      Ls.slice(0, 10).forEach((l, i) => { LP.set([...l.p, l.range], i * 4); LC.set([...l.col, l.inten], i * 4); LD.set([...(l.dir || [0, 0, 0]), l.cut || 0], i * 4); });
      gl.uniform4fv(P1.u.uLP, LP); gl.uniform4fv(P1.u.uLC, LC); gl.uniform4fv(P1.u.uLD, LD);
    }
    S._lights = [];
    if (envMesh) drawItem({ m: envMesh, M: M.t(0, 0, 0) }, md);
    envItems.forEach((it) => drawItem(it, md));
    opaque.forEach((it) => drawItem(it, md));
    /* ground decals */
    gl.useProgram(P2.p); gl.uniformMatrix4fv(P2.u.uVP, false, vp); gl.uniform1f(P2.u.uTime, time);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-1, -2);
    decals.forEach((d) => { gl.uniform1i(P2.u.uMode, d.mode); gl.uniform4fv(P2.u.uCol, d.c); gl.uniformMatrix4fv(P2.u.uModel, false, d.M); gl.bindVertexArray(quadVao.vao); gl.drawArrays(gl.TRIANGLES, 0, 6); });
    gl.disable(gl.POLYGON_OFFSET_FILL);
    /* lines */
    if (lines.length) {
      const arr = new Float32Array(lines.length * 10);
      lines.forEach((l, i) => arr.set([...l[0], 0, 0, ...l[1], 0, 0], i * 10));
      gl.bindBuffer(gl.ARRAY_BUFFER, lineVao.buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, Math.min(arr.length, 4000 * 5)));
      gl.uniform1i(P2.u.uMode, 3); gl.uniformMatrix4fv(P2.u.uModel, false, M.t(0, 0, 0)); gl.bindVertexArray(lineVao.vao);
      lines.forEach((l, i) => { if (i * 2 >= 4000) return; gl.uniform4f(P2.u.uCol, l[2][0], l[2][1], l[2][2], l[3]); gl.drawArrays(gl.LINES, i * 2, 2); });
    }
    /* translucent volumes (far to near) */
    gl.useProgram(P1.p);
    trans.sort((a, b) => { const da = Math.hypot(a.M[12] - eye[0], a.M[13] - eye[1], a.M[14] - eye[2]), db = Math.hypot(b.M[12] - eye[0], b.M[13] - eye[1], b.M[14] - eye[2]); return db - da; });
    trans.forEach((it) => drawItem(it, md));
    /* glows */
    gl.useProgram(P2.p); gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1i(P2.u.uMode, 2);
    glows.forEach((gw) => {
      const s = gw.size, m = new Float32Array([rt[0] * s, rt[1] * s, rt[2] * s, 0, upv[0] * s, upv[1] * s, upv[2] * s, 0, 0, 0, 1, 0, gw.p[0], gw.p[1], gw.p[2], 1]);
      gl.uniform4f(P2.u.uCol, gw.c[0], gw.c[1], gw.c[2], 1); gl.uniformMatrix4fv(P2.u.uModel, false, m); gl.bindVertexArray(bbVao.vao); gl.drawArrays(gl.TRIANGLES, 0, 6);
    });
    gl.depthMask(true); gl.disable(gl.BLEND);
    /* labels: pinned to their 3D point, nudged upwards so they never overlap */
    const box = lblHost.getBoundingClientRect(), placed = [];
    const shown = [];
    labels.forEach((el, key) => {
      if (!labelsUsed.has(key)) { el.style.display = "none"; return; }
      const c = M.apply(vp, [el._p[0], el._p[1], el._p[2], 1]);
      if (c[3] <= 0.05) { el.style.display = "none"; return; }
      el.style.display = "";
      shown.push({ el, x: (c[0] / c[3] * 0.5 + 0.5) * box.width, y: (1 - (c[1] / c[3] * 0.5 + 0.5)) * box.height, d: c[3] });
    });
    /* keep the scene readable: while a run animates only the key label shows;
       labels never cover the toolbar, the ▶ button or each other — when two
       collide the less important (then the farther) one is hidden */
    const prio = (el) => (/\b(bad|good|warn|big)\b/.test(el.className) ? 0 : /\btiny\b/.test(el.className) ? 2 : 1);
    const small = box.width < 520, running = runDur > 0;
    const keep = [];
    const tb = toolbar.getBoundingClientRect(), pb = playBtn.hidden ? null : playBtn.getBoundingClientRect();
    if (tb.width) keep.push({ x: tb.left - box.left + tb.width / 2, y: tb.top - box.top + tb.height / 2, w: tb.width + 8, h: tb.height + 8 });
    if (pb && pb.width) keep.push({ x: pb.left - box.left + pb.width / 2, y: pb.top - box.top + pb.height / 2, w: pb.width + 10, h: pb.height + 10 });
    shown.sort((a, b) => prio(a.el) - prio(b.el) || a.d - b.d).forEach((s) => {
      const p = prio(s.el);
      if ((running && p > 0) || (small && p === 2)) { s.el.style.display = "none"; return; }
      const w = s.el.offsetWidth || 60, h = s.el.offsetHeight || 20;
      const clampX = (v) => Math.max(w / 2 + 4, Math.min(box.width - w / 2 - 4, v));
      const free = (x, y) => !keep.concat(placed).some((q) => Math.abs(q.x - x) < (q.w + w) / 2 + 3 && Math.abs(q.y - y) < (q.h + h) / 2 + 2);
      /* try the spot itself, then slide sideways, then just below */
      const tries = [[0, 0], [-(w / 2 + 38), 0], [w / 2 + 38, 0], [0, h + 6], [-(w / 2 + 38), h + 6], [w / 2 + 38, h + 6]];
      let spot = null;
      for (const [dx, dy] of tries) { const x = clampX(s.x + dx), y = s.y - h * 0.55 + dy; if (y > h / 2 && y < box.height - h && free(x, y)) { spot = [x, y, dy]; break; } }
      if (!spot) { s.el.style.display = "none"; return; }
      placed.push({ x: spot[0], y: spot[1], w, h });
      s.el.style.left = spot[0] + "px"; s.el.style.top = s.y + spot[2] + "px";
    });
  }
  /* scene-side lights (night labs) */
  S.light = (p, range, color, inten, dir, cutDeg) => { (S._lights = S._lights || []).push({ p, range, col: col(color), inten, dir: dir ? norm(dir) : null, cut: cutDeg ? Math.cos(cutDeg * Math.PI / 180) : 0 }); };

  raf = requestAnimationFrame(frame);
  setMode(mode);
  setTimeout(syncPlay, 0);
  const api = {
    dirty() { dirty = true; },
    /* a state change: show the settled picture */
    changed() { const was = runDur > 0; runT = 1; runDur = 0; idle = true; dirty = true; if (was || playBtn.hidden) syncPlay(); },
    run(dur = 2.2) { idle = false; if (!Motion.gsap || Motion.reduced()) { runT = 1; runDur = 0; dirty = true; syncPlay(); return; } runT = 0; runDur = dur; dirty = true; playBtn.hidden = true; },
    destroy() {
      if (!alive) return; alive = false; cancelAnimationFrame(raf); if (ro) ro.disconnect(); if (io) io.disconnect();
      cache.forEach((m) => { gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.buf); }); dyn.forEach((d) => { gl.deleteVertexArray(d.m.vao); gl.deleteBuffer(d.m.buf); });
      const lc = gl.getExtension("WEBGL_lose_context"); if (lc) lc.loseContext();
    },
  };
  canvas.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); api.destroy(); wrap.remove(); viz.classList.remove("has3d", "show2d"); });
  return api;
};

/* labs that are not on the declarative engine register their stage here */
L3.mounted = {};
L3.mount = (id, viz, get) => { const s = L3.attach(viz, id, get); L3.mounted[id] = s; return s; };
L3.touch = (id, runDur) => { const s = L3.mounted[id]; if (!s) return; if (runDur) s.run(runDur); else s.changed(); };
L3.helpers = { M, B, K, lin, alignY };
window.Lab3D = L3;
})();
