/* iDrive car3d.js — real 3D car for the vehicle explorer.

   Model: "Car Concept" by Eric Chadwick (Darmstadt Graphics Group), from a
   CC0 model by Unity Fan — CC BY 4.0, Khronos glTF Sample Assets. Khronos
   logos are not covered by that licence, so badge/plate meshes are hidden.
   three.js (MIT) and the model are loaded on demand from public CDNs and
   cached by the service worker.

   The car body is the real model. Tyres and brakes highlight the model's own
   meshes; inner parts (engine, gearbox, …) are simplified shapes placed in a
   typical front-engine layout and revealed with X-ray mode. */
(() => {
"use strict";
const THREE_V = "0.170.0";
const CDN = `https://cdn.jsdelivr.net/npm/three@${THREE_V}`;
const MODEL_SHA = "e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea";
const MODEL_PATH = "Models/CarConcept/glTF-KTX-BasisU-Draco/CarConcept.gltf";
const MODEL_URLS = [
  "/models/carconcept/CarConcept.gltf",   // same-origin mirror (fast, not blocked by ISPs)
  `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${MODEL_SHA}/${MODEL_PATH}`,
  `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/${MODEL_PATH}`,
];
const GROUP_COL = { powertrain: 0xf5b83d, transmission: 0xa78bfa, chassis: 0x38bdf8, electrical: 0x34d399, safety: 0xfb7185 };
const MODEL_PARTS = { tyres: /^(tiretread|tireside|rim1|rim2)$/i, brakes: /^(brake|disc)$/i };
const HIDE_MATS = /^license$/i;

const C = { state: "idle", el: null, sel: null, xray: false, parts: [], onPick: null };
let T, renderer, scene, camera, controls, car, frame, raf = 0, dirty = true, clock;
const meshesFor = {};      // part id -> [mesh]
const anchors = {};        // part id -> THREE.Vector3 (world)
let bodyMats = [];

C.supported = () => {
  try { const c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl"))); }
  catch (e) { return false; }
};
C.wanted = () => { try { return localStorage.getItem("idrive-3d") === "1"; } catch (e) { return false; } };
const remember = () => { try { localStorage.setItem("idrive-3d", "1"); } catch (e) {} };

/* The viewer lives in one persistent element so re-rendering the explorer
   (group filter, picking a part) never reloads the model. */
C.mount = (slot, parts, sel, onPick) => {
  C.parts = parts; C.onPick = onPick;
  if (!C.el) {
    C.el = document.createElement("div");
    C.el.className = "x3d";
    C.el.innerHTML = `<div class="x3dstage"></div><div class="x3dpins" aria-hidden="false"></div>
      <div class="x3dbar"><button class="x3dbtn" data-x3d="xray" aria-pressed="false"></button><button class="x3dbtn" data-x3d="reset"></button></div>
      <div class="x3dmsg" role="status"></div>`;
    C.el.addEventListener("click", onClick);
  }
  slot.appendChild(C.el);
  labels();
  if (C.state === "ready") { resize(); C.select(sel, false); pins(); start(); }
  else if (C.state === "idle") C.wanted() ? C.load() : showGate();
  else if (C.state === "error") showError();
};

function u(k) { return I18n.one(I18n.u(k)); }
function labels() {
  const x = C.el.querySelector('[data-x3d="xray"]'), r = C.el.querySelector('[data-x3d="reset"]');
  x.textContent = u("v3dXray"); x.setAttribute("aria-pressed", C.xray);
  x.classList.toggle("on", C.xray);
  r.textContent = u("v3dReset");
}
function msg(html) { const m = C.el.querySelector(".x3dmsg"); m.innerHTML = html; m.hidden = !html; }
function showGate() {
  msg(`<p>${I18n.esc(u("v3dIntro"))}</p><button class="btn primary" data-x3d="load">${I18n.esc(u("v3dLoad"))}</button><small>${I18n.esc(u("v3dCredit"))}</small>`);
}
function showError() {
  msg(`<p>${I18n.esc(u("v3dFail"))}</p><button class="btn" data-x3d="load">${I18n.esc(u("v3dRetry"))}</button>${C.lastErr ? `<small>${I18n.esc(C.lastErr)}</small>` : ""}`);
}

function onClick(ev) {
  const b = ev.target.closest("[data-x3d]");
  if (b) {
    const a = b.dataset.x3d;
    if (a === "load") { remember(); C.load(); }
    else if (a === "xray") { C.setXray(!C.xray); }
    else if (a === "reset") { C.resetView(); }
    else if (a === "pin" && C.onPick) C.onPick(b.dataset.id);
    return;
  }
}

/* ---------- loading ---------- */
C.load = async () => {
  if (C.state === "loading" || C.state === "ready") return;
  if (!C.supported()) { C.state = "error"; msg(`<p>${I18n.esc(u("v3dNoGl"))}</p>`); return; }
  C.state = "loading";
  msg(`<div class="x3dload"><i></i></div><p>${I18n.esc(u("v3dLoading"))}</p><b class="x3dpct">0%</b><small class="x3dfile"></small>`);
  /* progress: 0–15 % for the 3D library, 15–100 % by files of the model.
     (Byte counts are unreliable here: the CDN gzips, so "loaded" can exceed
     the compressed "total" — that is what produced readings over 100 %.) */
  let shown = 0;
  const pct = (v) => {
    shown = Math.max(shown, Math.min(99, Math.round(v)));
    const el = C.el && C.el.querySelector(".x3dpct");
    if (el) el.textContent = shown + "%";
  };
  let libs = 0;
  const step = (pr) => pr.then((m) => { libs++; pct(libs / 6 * 15); return m; });
  try {
    const [three, gltf, draco, ktx2, orbit, room] = await Promise.all([
      step(import(`${CDN}/+esm`)),
      step(import(`${CDN}/examples/jsm/loaders/GLTFLoader.js/+esm`)),
      step(import(`${CDN}/examples/jsm/loaders/DRACOLoader.js/+esm`)),
      step(import(`${CDN}/examples/jsm/loaders/KTX2Loader.js/+esm`)),
      step(import(`${CDN}/examples/jsm/controls/OrbitControls.js/+esm`)),
      step(import(`${CDN}/examples/jsm/environments/RoomEnvironment.js/+esm`)),]);
    T = three;
    pct(15);
    setup(orbit.OrbitControls, room.RoomEnvironment);
    const manager = new T.LoadingManager();
    // track which files are still in flight so a stall can say what it is waiting for
    const pend = new Set(); let lastTick = Date.now(), counts = "";
    const s0 = manager.itemStart.bind(manager), e0 = manager.itemEnd.bind(manager);
    manager.itemStart = (url) => { pend.add(url); s0(url); };
    manager.itemEnd = (url) => { pend.delete(url); e0(url); };
    const fileLine = () => {
      const f = C.el && C.el.querySelector(".x3dfile");
      if (!f) return;
      const stalled = Date.now() - lastTick > 6000;
      const names = [...pend].map(x => x.split("/").pop().split("?")[0]).slice(0, 2).join(", ");
      f.textContent = counts + (stalled && names ? ` · ${u("v3dWaiting")} ${names}` : stalled && counts && !pend.size ? ` · ${u("v3dPreparing")}` : "");
    };
    manager.onProgress = (url, done, total) => { lastTick = Date.now(); if (total) { pct(15 + done / total * 85); counts = `${done} / ${total}`; fileLine(); } };
    const ticker = setInterval(() => { if (C.state !== "loading") { clearInterval(ticker); return; } fileLine(); }, 1000);
    C.pending = () => [...pend].map(x => x.split("/").pop());
    const loader = new gltf.GLTFLoader(manager);
    const dl = new draco.DRACOLoader(manager).setDecoderPath(`${CDN}/examples/jsm/libs/draco/gltf/`);
    const kl = new ktx2.KTX2Loader(manager).setTranscoderPath(`${CDN}/examples/jsm/libs/basis/`).detectSupport(renderer);
    loader.setDRACOLoader(dl); loader.setKTX2Loader(kl);
    let res = null, lastErr = null;
    for (const url of MODEL_URLS) {
      try {
        // never spin forever: give up after 90 s and offer a retry
        res = await Promise.race([loader.loadAsync(url), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 90000))]);
        break;
      } catch (e) { lastErr = e; }
    }
    if (!res) throw lastErr || new Error("model");
    build(res.scene);
    C.state = "ready";
    C.el.classList.add("ready");
    msg("");
    C.select(S.param2 || null, false);
    pins(); start();
    Motion.rise && Motion.rise(C.el.querySelector(".x3dstage"));
  } catch (err) {
    console.warn("3D car failed to load", err);
    C.state = "error"; C.lastErr = (String((err && err.message) || err) + (C.pending && C.pending().length ? " — " + C.pending().join(", ") : "")).slice(0, 200); showError();
  }
};

function setup(OrbitControls, RoomEnvironment) {
  const stage = C.el.querySelector(".x3dstage");
  renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.appendChild(renderer.domElement);
  scene = new T.Scene();
  const pmrem = new T.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  camera = new T.PerspectiveCamera(32, 1, 0.05, 200);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.addEventListener("change", () => { dirty = true; });
  clock = new T.Clock();
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  window.addEventListener("resize", () => { if (C.el && C.el.isConnected) { resize(); dirty = true; } });
  resize();
}

/* ---------- build: orient the real model, add simplified inner parts ---------- */
function build(root) {
  car = new T.Group();
  car.add(root);
  scene.add(car);
  const tyreMeshes = [], lightMeshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const names = mats.map(m => m.name || "");
    const logo = mats.some(m => ["map", "emissiveMap"].some(k => m[k] && /khronos/i.test(m[k].name || "")));
    if (names.some(n => HIDE_MATS.test(n)) || logo) { o.visible = false; return; }
    if (names.some(n => /^tire/i.test(n))) tyreMeshes.push(o);
    if (names.some(n => /headlight/i.test(n))) lightMeshes.push(o);
    for (const [pid, re] of Object.entries(MODEL_PARTS)) if (names.some(n => re.test(n))) (meshesFor[pid] = meshesFor[pid] || []).push(o);
    const isRunning = names.some(n => /^(tire|rim|brake|disc)/i.test(n));
    if (!isRunning) mats.forEach(m => { if (!bodyMats.includes(m)) bodyMats.push(m); });
  });
  bodyMats.forEach(m => { m.userData.base = { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite, transmission: m.transmission || 0 }; });

  // centre on the floor
  const box = new T.Box3().setFromObject(root), size = box.getSize(new T.Vector3()), ctr = box.getCenter(new T.Vector3());
  root.position.sub(new T.Vector3(ctr.x, box.min.y, ctr.z));
  car.updateMatrixWorld(true);

  // length axis = longer horizontal side; front = the end with the headlights
  const alongX = size.x >= size.z;
  const len = alongX ? size.x : size.z, wid = alongX ? size.z : size.x, hgt = size.y;
  const coord = (v) => (alongX ? v.x : v.z);
  const centreOf = (ms) => { const b = new T.Box3(); ms.forEach(m => b.expandByObject(m)); return b.isEmpty() ? null : b.getCenter(new T.Vector3()); };
  const hl = centreOf(lightMeshes);
  const sign = hl ? (coord(hl) >= 0 ? 1 : -1) : 1;
  const L = alongX ? new T.Vector3(sign, 0, 0) : new T.Vector3(0, 0, sign);
  const H = new T.Vector3(0, 1, 0);
  const Rt = new T.Vector3().crossVectors(L, H).normalize();   // driver's right

  // axles from the tyres when we can find them
  let fa = 0.31 * len, ra = -0.31 * len, R = 0.17 * hgt;
  const wheels = tyreMeshes.map(m => new T.Box3().setFromObject(m)).filter(b => !b.isEmpty());
  if (wheels.length >= 2) {
    const us = wheels.map(b => coord(b.getCenter(new T.Vector3())) * sign);
    const front = us.filter(x => x > 0), rear = us.filter(x => x <= 0);
    if (front.length) fa = front.reduce((a, b) => a + b, 0) / front.length;
    if (rear.length) ra = rear.reduce((a, b) => a + b, 0) / rear.length;
    R = Math.max(...wheels.map(b => b.getSize(new T.Vector3()).y)) / 2 || R;
  }
  frame = { L, H, Rt, len, wid, hgt, fa, ra, R };

  // car-frame helper: u along length (+front), y up, w across (+driver's right)
  const P = (u0, y0, w0) => new T.Vector3().addScaledVector(L, u0).addScaledVector(H, y0).addScaledVector(Rt, w0);
  const orient = (obj) => { obj.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(L, H, Rt)); return obj; };
  const mat = (pid) => {
    const p = C.parts.find(x => x.id === pid), col = GROUP_COL[p ? p.group : "chassis"] || 0x38bdf8;
    return new T.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.25, metalness: 0.35, roughness: 0.45, transparent: true, opacity: 0.95 });
  };
  const add = (pid, geo, pos, opt = {}) => {
    const m = new T.Mesh(geo, mat(pid));
    m.position.copy(pos);
    orient(m);
    if (opt.rot) m.rotateOnAxis(opt.rot[0], opt.rot[1]);
    m.userData.part = pid; m.userData.synthetic = true; m.renderOrder = 2;
    car.add(m);
    (meshesFor[pid] = meshesFor[pid] || []).push(m);
    return m;
  };
  const box3 = (l, h, w) => new T.BoxGeometry(l, h, w);
  const X = new T.Vector3(1, 0, 0), Y = new T.Vector3(0, 1, 0), Z = new T.Vector3(0, 0, 1);
  const bay = fa + (len / 2 - fa) * 0.15, half = wid / 2;

  add("engine", box3(len * .15, hgt * .28, wid * .42), P(bay, R * 1.35, 0));
  add("radiator", box3(len * .02, hgt * .26, wid * .58), P(fa + (len / 2 - fa) * .62, R * 1.2, 0));
  add("battery", box3(len * .055, hgt * .1, wid * .12), P(fa - len * .01, R * 1.75, -half * .55));
  add("abs", box3(len * .04, hgt * .06, wid * .08), P(fa - len * .05, R * 1.75, half * .55));
  add("clutch", new T.CylinderGeometry(hgt * .1, hgt * .1, len * .02, 32), P(fa - len * .1, R * 1.05, 0), { rot: [Z, Math.PI / 2] });
  add("gearbox", box3(len * .12, hgt * .15, wid * .18), P(fa - len * .17, R * .95, 0));
  const shaftLen = (fa - len * .23) - ra;
  add("driveshaft", new T.CylinderGeometry(hgt * .02, hgt * .02, shaftLen, 16), P(ra + shaftLen / 2, R * .62, 0), { rot: [Z, Math.PI / 2] });
  add("differential", new T.SphereGeometry(hgt * .085, 24, 16), P(ra, R, 0));
  add("fuel", box3(len * .14, hgt * .08, wid * .5), P(ra + len * .13, R * .72, 0));
  // exhaust: pipe under the floor to the back, with a silencer
  const exLen = (fa - len * .12) - (-len / 2 + len * .02);
  add("exhaust", new T.CylinderGeometry(hgt * .022, hgt * .022, exLen, 12), P(fa - len * .12 - exLen / 2, R * .42, half * .28), { rot: [Z, Math.PI / 2] });
  add("exhaust", new T.CapsuleGeometry(hgt * .05, len * .07, 6, 12), P(ra - len * .08, R * .45, half * .28), { rot: [Z, Math.PI / 2] });
  // steering: wheel in front of the driver (India: right-hand drive) + column
  const drvU = fa - (fa - ra) * .42, drvW = half * .42;
  add("steering", new T.TorusGeometry(len * .042, len * .006, 10, 40), P(drvU, hgt * .64, drvW), { rot: [Y, Math.PI / 2] }).rotateOnAxis(X, -0.35);
  add("steering", new T.CylinderGeometry(len * .005, len * .005, len * .14, 8), P(drvU + len * .07, hgt * .56, drvW * .95), { rot: [Z, Math.PI / 2 - 0.45] });
  // airbags: in the steering wheel and the passenger dashboard
  add("airbags", new T.SphereGeometry(len * .035, 20, 14), P(drvU - len * .005, hgt * .64, drvW));
  add("airbags", new T.SphereGeometry(len * .04, 20, 14), P(drvU + len * .02, hgt * .62, -drvW));
  // suspension coils at each corner
  const coil = () => {
    const pts = [], turns = 6, r = wid * .045, h = hgt * .26;
    for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * turns * Math.PI * 2; pts.push(new T.Vector3(Math.cos(a) * r, t * h, Math.sin(a) * r)); }
    return new T.TubeGeometry(new T.CatmullRomCurve3(pts), 160, wid * .008, 6, false);
  };
  [fa, ra].forEach(a => [-1, 1].forEach(s => add("suspension", coil(), P(a, R * .95, s * (half - wid * .2)))));

  // anchors (hotspot positions)
  const centreParts = (pid) => { const b = new T.Box3(); (meshesFor[pid] || []).forEach(m => b.expandByObject(m)); return b.isEmpty() ? null : b.getCenter(new T.Vector3()); };
  for (const p of C.parts) anchors[p.id] = centreParts(p.id);
  // tyres/brakes: front wheel on the camera's side
  anchors.tyres = P(fa, R * .35, half * .98);
  anchors.brakes = P(fa, R, half * .8);
  anchors.suspension = P(fa, R * 1.6, half - wid * .2);

  // camera
  const tgt = new T.Vector3(0, hgt * .42, 0);
  C.home = { tgt, pos: P(len * .78, hgt * 1.05, len * .95) };
  camera.position.copy(C.home.pos); controls.target.copy(tgt);
  controls.minDistance = len * .45; controls.maxDistance = len * 2.6;
  controls.update();
  C.setXray(C.xray);
}

/* ---------- selection, x-ray, view ---------- */
const INNER = new Set(["engine", "radiator", "battery", "abs", "clutch", "gearbox", "driveshaft", "differential", "fuel", "exhaust", "steering", "airbags", "suspension"]);
C.setXray = (on) => {
  C.xray = !!on;
  bodyMats.forEach(m => {
    const b = m.userData.base || {};
    if (C.xray) { m.transparent = true; m.opacity = Math.min(b.opacity ?? 1, 0.13); m.depthWrite = false; if ("transmission" in m) m.transmission = 0; }
    else { m.transparent = b.transparent; m.opacity = b.opacity ?? 1; m.depthWrite = b.depthWrite ?? true; if ("transmission" in m) m.transmission = b.transmission || 0; }
    m.needsUpdate = true;
  });
  Object.values(meshesFor).flat().forEach(o => { if (o.userData.synthetic) o.visible = C.xray; });
  if (C.el) labels();
  pins(); dirty = true;
};
C.select = (id, fly = true) => {
  C.sel = id || null;
  if (C.state !== "ready") return;
  if (id && INNER.has(id) && !C.xray) C.setXray(true);
  for (const [pid, ms] of Object.entries(meshesFor)) ms.forEach(o => {
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(mm => {
      if (!mm.userData.e0) mm.userData.e0 = { c: mm.emissive ? mm.emissive.clone() : null, i: mm.emissiveIntensity ?? 1 };
      const on = pid === C.sel;
      if (o.userData.synthetic) { mm.opacity = C.sel && !on ? 0.28 : 0.95; mm.emissiveIntensity = on ? 1 : 0.25; }
      else if (mm.emissive) { mm.emissive.copy(on ? new T.Color(GROUP_COL.chassis) : mm.userData.e0.c); mm.emissiveIntensity = on ? 0.8 : mm.userData.e0.i; }
    });
  });
  pins();
  if (fly && id && anchors[id]) C.flyTo(anchors[id]);
  dirty = true;
};
C.flyTo = (pt) => {
  const F = frame, dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(controls.minDistance * 1.05, F.len * .85);
  const tgt = new T.Vector3(pt.x * .6, Math.max(F.hgt * .3, pt.y), pt.z * .6);
  const pos = tgt.clone().addScaledVector(dir, dist);
  pos.y = Math.max(pos.y, F.hgt * .5);
  tween(tgt, pos);
};
C.resetView = () => { if (C.state === "ready") tween(C.home.tgt.clone(), C.home.pos.clone()); };
function tween(tgt, pos) {
  const gs = Motion.gsap;
  if (!gs || Motion.reduced()) { controls.target.copy(tgt); camera.position.copy(pos); controls.update(); dirty = true; return; }
  gs.to(controls.target, { x: tgt.x, y: tgt.y, z: tgt.z, duration: .9, ease: "power2.inOut", onUpdate: () => { dirty = true; } });
  gs.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: .9, ease: "power2.inOut", onUpdate: () => { controls.update(); dirty = true; } });
}

/* ---------- hotspot pins (real buttons over the canvas) ---------- */
function pins() {
  if (!C.el || C.state !== "ready") return;
  const box = C.el.querySelector(".x3dpins");
  const vis = C.parts.filter(p => anchors[p.id] && (V_group() === "all" || p.group === V_group()));
  box.innerHTML = vis.map(p => `<button class="x3dpin g-${p.group} ${p.id === C.sel ? "on" : ""}" data-x3d="pin" data-id="${p.id}" aria-pressed="${p.id === C.sel}" aria-label="${I18n.esc(I18n.one(p.name))}"><i></i><span>${I18n.esc(I18n.one(p.name))}</span></button>`).join("");
  place();
}
const V_group = () => (window.Vehicle && Vehicle.group) || "all";
const v3 = () => new T.Vector3();
function place() {
  if (!C.el || C.state !== "ready") return;
  const w = C.el.clientWidth, h = C.el.querySelector(".x3dstage").clientHeight;
  C.el.querySelectorAll(".x3dpin").forEach(b => {
    const a = anchors[b.dataset.id];
    if (!a) return;
    const p = v3().copy(a).project(camera);
    const behind = p.z > 1;
    const inner = INNER.has(b.dataset.id);
    b.style.transform = `translate(${((p.x + 1) / 2 * w).toFixed(1)}px,${((1 - p.y) / 2 * h).toFixed(1)}px)`;
    b.classList.toggle("hid", behind);
    b.classList.toggle("ghost", inner && !C.xray);
  });
}

/* ---------- picking meshes directly ---------- */
let downAt = null;
function onDown(e) { downAt = [e.clientX, e.clientY]; }
function onUp(e) {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  const ray = new T.Raycaster();
  ray.setFromCamera(new T.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
  const cands = Object.entries(meshesFor).flatMap(([pid, ms]) => ms.filter(m => m.visible).map(m => (m.userData.pick = pid, m)));
  const hit = ray.intersectObjects(cands, false)[0];
  if (hit && C.onPick) C.onPick(hit.object.userData.pick);
}

/* ---------- loop (only while the viewer is on screen) ---------- */
function resize() {
  if (!renderer) return;
  const st = C.el.querySelector(".x3dstage"), w = st.clientWidth, h = st.clientHeight || Math.round(w * .62);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  dirty = true;
}
function start() { if (!raf) raf = requestAnimationFrame(loop); }
function loop() {
  raf = 0;
  if (!C.el || !C.el.isConnected || document.hidden) return;   // stops itself off-screen
  controls.update();
  if (C.sel) {
    const t = clock.getElapsedTime(), k = 0.65 + Math.sin(t * 4) * 0.35;
    (meshesFor[C.sel] || []).forEach(o => { if (o.userData.synthetic) o.material.emissiveIntensity = k; });
    dirty = true;
  }
  if (dirty) { renderer.render(scene, camera); place(); dirty = false; }
  raf = requestAnimationFrame(loop);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && C.state === "ready" && C.el && C.el.isConnected) { dirty = true; start(); } });

window.Car3D = C;
})();
