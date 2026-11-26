/* iDrive car3d.js — real 3D car for the vehicle explorer.

   Model: "Car Concept" by Eric Chadwick (Darmstadt Graphics Group), from a
   CC0 model by Unity Fan — CC BY 4.0, Khronos glTF Sample Assets. Khronos
   logos are not covered by that licence, so badge/plate meshes are hidden.
   three.js (MIT, via the import map) and the model (our own server) load on demand and
   cached by the service worker.

   The WebP variant of the model is used: plain geometry and WebP images, so
   no Draco/Basis decoders (WebAssembly in blob: workers) are involved.

   The car body is the real model. Tyres and brakes highlight the model's own
   meshes; inner parts (engine, gearbox, …) are simplified shapes placed in a
   typical front-engine layout and revealed with X-ray mode. */
(() => {
"use strict";
const MODEL_URLS = ["/models/carconcept-webp-e124e8d8/CarConcept.gltf"];   // path = variant + pinned commit (model_mirror.MODEL_KEY), served by our own server; new version ⇒ new path
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
  const step = (pr) => pr.then((m) => { libs++; pct(libs / 4 * 15); return m; });
  try {
    const [three, gltf, orbit, room] = await Promise.all([
      step(import("three")),
      step(import("three/addons/loaders/GLTFLoader.js")),
      step(import("three/addons/controls/OrbitControls.js")),
      step(import("three/addons/environments/RoomEnvironment.js")),]);
    T = three;
    pct(15);
    setup(orbit.OrbitControls, room.RoomEnvironment);
    const manager = new T.LoadingManager();
    // track which files are still in flight so a stall can say what it is waiting for
    // (the same URL can be open twice: once for the download, once while GLTFLoader parses it)
    const open = new Map(); let lastTick = Date.now(), counts = "";
    const pend = { get size() { return open.size; }, [Symbol.iterator]: () => open.keys() };
    const s0 = manager.itemStart.bind(manager), e0 = manager.itemEnd.bind(manager);
    manager.itemStart = (url) => { open.set(url, (open.get(url) || 0) + 1); s0(url); };
    manager.itemEnd = (url) => { const n = (open.get(url) || 1) - 1; n ? open.set(url, n) : open.delete(url); e0(url); };
    const fileLine = () => {
      const f = C.el && C.el.querySelector(".x3dfile");
      if (!f) return;
      const stalled = Date.now() - lastTick > 6000;
      const names = [...pend].map(x => x.split("/").pop().split("?")[0]).filter(n => !/\.gltf$/i.test(n)).slice(0, 2).join(", ");
      f.textContent = counts + (stalled && names ? ` · ${u("v3dWaiting")} ${names}` : stalled && counts ? ` · ${u("v3dPreparing")}` : "");
    };
    manager.onProgress = (url, done, total) => { lastTick = Date.now(); if (total) { pct(15 + done / total * 85); counts = `${done} / ${total}`; fileLine(); } };
    const ticker = setInterval(() => { if (C.state !== "loading") { clearInterval(ticker); return; } fileLine(); }, 1000);
    C.pending = () => [...pend].map(x => x.split("/").pop());
    const loader = new gltf.GLTFLoader(manager);
    let res = null, lastErr = null;
    for (const url of MODEL_URLS) {
      try {
        // never spin forever: give up after 90 s and offer a retry
        res = await Promise.race([loader.loadAsync(url), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 75000))]);
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
  /* ---- the inner parts: mechanical shapes built from three.js primitives ----
     Each part is a Group in its own local frame (x = forward, y = up,
     z = driver's right), sized in metres for a ~4.4 m car and scaled to the
     model. Real-looking materials; the system colour is only used as the
     selection glow (emissive). */
  const S = len / 4.4, half = wid / 2;
  const KIND = {
    steel: [0x8f979f, .85, .35], dark: [0x30353d, .6, .55], alu: [0xb9c0c8, .9, .28], rubber: [0x141619, 0, .9],
    plastic: [0x1f2329, .05, .6], red: [0xb32630, .3, .45], chrome: [0xe5e9ee, 1, .12], rust: [0x6e4a39, .6, .65],
    copper: [0xb87333, .9, .35], fabric: [0xeae6dc, 0, .95], friction: [0x4d3d30, .1, .9], blue: [0x2b4c7e, .3, .5],
  };
  const matCache = {};
  const mat = (pid, kind) => {
    const key = pid + ":" + kind;
    if (matCache[key]) return matCache[key];
    const p = C.parts.find(x => x.id === pid), glow = GROUP_COL[p ? p.group : "chassis"] || 0x38bdf8, k = KIND[kind] || KIND.steel;
    return (matCache[key] = new T.MeshStandardMaterial({ color: k[0], metalness: k[1], roughness: k[2], emissive: glow, emissiveIntensity: 0, transparent: true, opacity: 1 }));
  };
  const HALF = Math.PI / 2;
  // add a mesh to a part group: position (x,y,z) and rotation (rx,ry,rz) in the part's frame
  const mk = (g, pid, geo, kind, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new T.Mesh(geo, mat(pid, kind));
    m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
    m.userData.part = pid; m.userData.synthetic = true; m.renderOrder = 2;
    g.add(m);
    (meshesFor[pid] = meshesFor[pid] || []).push(m);
    return m;
  };
  const part = (pid, pos, scale = S) => {
    const g = new T.Group();
    g.position.copy(pos); orient(g); g.scale.setScalar(scale);
    car.add(g);
    return g;
  };
  const cylX = (r1, r2, l, seg = 20) => new T.CylinderGeometry(r1, r2, l, seg);   // rotate rz = -HALF to lie along x
  const tube = (pts, r, closed = false, seg = 64) => new T.TubeGeometry(new T.CatmullRomCurve3(pts, closed), seg, r, 8, closed);
  const V = (x, y, z) => new T.Vector3(x, y, z);
  const roundRect = (w, d, r) => {
    const sh = new T.Shape(), x = -w / 2, y = -d / 2;
    sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
    sh.lineTo(x + w, y + d - r); sh.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
    sh.lineTo(x + r, y + d); sh.quadraticCurveTo(x, y + d, x, y + d - r);
    sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
    return sh;
  };
  const bay = fa + (len / 2 - fa) * 0.15;

  // ENGINE — inline-four, mounted lengthways: block, head, red cam cover with
  // coil packs, intake runners + plenum, exhaust manifold, belt drive, flywheel
  {
    const g = part("engine", P(bay, R * 1.3, 0)), e = "engine";
    mk(g, e, new T.BoxGeometry(.56, .36, .40), "alu");
    mk(g, e, new T.BoxGeometry(.50, .10, .32), "dark", 0, -.23, 0);
    mk(g, e, new T.BoxGeometry(.56, .12, .36), "alu", 0, .24, 0);
    mk(g, e, new T.BoxGeometry(.52, .07, .26), "red", 0, .335, 0);
    [-.18, -.06, .06, .18].forEach(x => {
      mk(g, e, new T.CylinderGeometry(.028, .028, .07, 12), "plastic", x, .39, 0);
      mk(g, e, tube([V(x, .29, -.18), V(x, .30, -.30), V(x, .2, -.36)], .024, false, 16), "alu");
      mk(g, e, tube([V(x, .2, .2), V(x, .15, .27), V(x * .5, -.02, .3)], .022, false, 16), "rust");
    });
    mk(g, e, new T.CapsuleGeometry(.05, .44, 6, 12), "alu", 0, .2, -.38, 0, 0, HALF);
    mk(g, e, new T.CylinderGeometry(.035, .03, .16, 12), "rust", -.05, -.06, .32, HALF, 0, 0);
    mk(g, e, cylX(.085, .085, .04), "steel", .30, -.12, 0, 0, 0, -HALF);       // crank pulley
    mk(g, e, cylX(.05, .05, .04), "steel", .30, .07, .07, 0, 0, -HALF);        // water pump
    mk(g, e, cylX(.045, .045, .05), "steel", .30, .14, -.16, 0, 0, -HALF);     // alternator pulley
    mk(g, e, new T.CylinderGeometry(.06, .06, .12, 16), "alu", .26, .14, -.16, 0, 0, -HALF);
    mk(g, e, tube([V(.33, -.2, 0), V(.33, -.05, .1), V(.33, .12, .12), V(.33, .19, -.16), V(.33, .07, -.22), V(.33, -.12, -.09)], .008, true, 48), "rubber");
    mk(g, e, cylX(.15, .15, .03, 32), "steel", -.31, -.05, 0, 0, 0, -HALF);    // flywheel
  }

  // RADIATOR — core with fins, side tanks, fan and shroud, hoses
  {
    const g = part("radiator", P(fa + (len / 2 - fa) * .62, R * 1.2, 0)), r = "radiator";
    mk(g, r, new T.BoxGeometry(.04, .36, .62), "dark");
    for (let i = -6; i <= 6; i++) mk(g, r, new T.BoxGeometry(.046, .006, .6), "alu", 0, i * .026, 0);
    mk(g, r, new T.BoxGeometry(.06, .40, .05), "plastic", 0, 0, -.335);
    mk(g, r, new T.BoxGeometry(.06, .40, .05), "plastic", 0, 0, .335);
    mk(g, r, new T.CylinderGeometry(.16, .16, .05, 32, 1, true), "plastic", -.06, 0, 0, 0, 0, -HALF);
    mk(g, r, cylX(.035, .035, .05), "plastic", -.07, 0, 0, 0, 0, -HALF);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      mk(g, r, new T.BoxGeometry(.012, .11, .045), "plastic", -.07, Math.sin(a) * .08, Math.cos(a) * .08, a, 0, 0);
    }
    mk(g, r, tube([V(-.02, .16, -.3), V(-.12, .17, -.3), V(-.25, .1, -.2)], .022, false, 16), "rubber");
  }

  // BATTERY — case, lid, red (+) and black (−) terminals with cables
  {
    const g = part("battery", P(fa - len * .01, R * 1.75, -half * .55)), b = "battery";
    mk(g, b, new T.BoxGeometry(.26, .18, .17), "plastic");
    mk(g, b, new T.BoxGeometry(.25, .025, .16), "dark", 0, .1, 0);
    mk(g, b, new T.CylinderGeometry(.016, .018, .035, 12), "red", .085, .13, .045);
    mk(g, b, new T.CylinderGeometry(.016, .018, .035, 12), "plastic", -.085, .13, .045);
    mk(g, b, tube([V(.085, .15, .045), V(.12, .2, .1), V(.25, .15, .25)], .012, false, 12), "red");
    mk(g, b, tube([V(-.085, .15, .045), V(-.12, .19, .1), V(-.25, .05, .2)], .012, false, 12), "plastic");
  }

  // ABS / ESC — hydraulic block with pump motor, brake-line ports and the ECU connector
  {
    const g = part("abs", P(fa - len * .05, R * 1.75, half * .55)), a = "abs";
    mk(g, a, new T.BoxGeometry(.12, .08, .10), "alu");
    mk(g, a, new T.CylinderGeometry(.035, .035, .08, 16), "plastic", 0, 0, -.09, HALF, 0, 0);
    mk(g, a, new T.BoxGeometry(.11, .07, .03), "plastic", 0, 0, .065);
    [-.035, 0, .035].forEach(x => [-.02, .02].forEach(z => mk(g, a, new T.CylinderGeometry(.007, .007, .03, 8), "copper", x, .055, z)));
  }

  // CLUTCH — flywheel side: pressure plate with diaphragm fingers and the friction disc
  {
    const g = part("clutch", P(fa - len * .1, R * 1.1, 0)), c = "clutch";
    mk(g, c, cylX(.13, .13, .035, 32), "steel", 0, 0, 0, 0, 0, -HALF);
    mk(g, c, cylX(.12, .12, .012, 32), "friction", .028, 0, 0, 0, 0, -HALF);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      mk(g, c, new T.BoxGeometry(.01, .07, .018), "chrome", -.024, Math.sin(a) * .06, Math.cos(a) * .06, a, 0, 0);
    }
    mk(g, c, new T.TorusGeometry(.13, .008, 6, 40), "dark", -.018, 0, 0, 0, HALF, 0);
  }

  // GEARBOX — bell housing, ribbed case, tail housing and the gear lever
  {
    const g = part("gearbox", P(fa - len * .19, R * 1.0, 0)), x = "gearbox";
    mk(g, x, cylX(.11, .17, .16, 28), "alu", .2, .02, 0, 0, 0, -HALF);
    mk(g, x, new T.BoxGeometry(.32, .19, .2), "alu");
    [-.1, 0, .1].forEach(dx => mk(g, x, new T.BoxGeometry(.012, .2, .21), "dark", dx, 0, 0));
    mk(g, x, cylX(.05, .065, .22, 20), "alu", -.26, -.02, 0, 0, 0, -HALF);
    mk(g, x, new T.CylinderGeometry(.012, .012, .3, 10), "chrome", -.08, .24, 0, 0, 0, .25);
    mk(g, x, new T.SphereGeometry(.035, 16, 12), "plastic", -.12, .39, 0);
  }

  // DRIVESHAFT — tube between the gearbox and the differential with universal joints
  {
    const start = fa - len * .19 - .37 * S, end = ra + .16 * S, mid = (start + end) / 2, L0 = (start - end) / S;
    const g = part("driveshaft", P(mid, R * .78, 0)), d = "driveshaft";
    mk(g, d, cylX(.033, .033, L0 - .08, 20), "steel", 0, 0, 0, 0, 0, -HALF);
    [L0 / 2 - .03, -L0 / 2 + .03].forEach(x0 => {
      mk(g, d, new T.TorusGeometry(.03, .009, 8, 20), "dark", x0, 0, 0, 0, HALF, 0);
      mk(g, d, new T.BoxGeometry(.012, .08, .012), "chrome", x0, 0, 0);
      mk(g, d, new T.BoxGeometry(.012, .012, .08), "chrome", x0, 0, 0);
    });
  }

  // DIFFERENTIAL — the "pumpkin", rear cover, pinion nose and axle tubes to both wheels
  {
    const g = part("differential", P(ra, R, 0)), d = "differential", ax = half / S * .82;
    mk(g, d, new T.SphereGeometry(.14, 28, 20), "dark");
    mk(g, d, cylX(.12, .12, .03, 28), "steel", -.12, 0, 0, 0, 0, -HALF);
    mk(g, d, cylX(.05, .07, .14, 18), "dark", .15, 0, 0, 0, 0, -HALF);
    mk(g, d, new T.CylinderGeometry(.04, .045, ax * 2, 16), "dark", 0, 0, 0, HALF, 0, 0);
  }

  // FUEL TANK — moulded tank under the rear seat, filler neck to the side, pump flange on top
  {
    const g = part("fuel", P(ra + len * .14, R * .75, 0)), f = "fuel";
    const geo = new T.ExtrudeGeometry(roundRect(.55, 1.0, .12), { depth: .2, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 3, curveSegments: 8 });
    geo.translate(0, 0, -.1);
    mk(g, f, geo, "plastic", 0, 0, 0, -HALF, 0, 0);
    mk(g, f, new T.CylinderGeometry(.07, .07, .03, 24), "steel", .05, .14, -.15);
    mk(g, f, tube([V(-.1, .08, .45), V(-.2, .25, .6), V(-.35, .45, .82)], .03, false, 20), "rubber");
  }

  // EXHAUST — down-pipe, catalytic converter, middle pipe, silencer and tailpipe
  {
    const g = part("exhaust", P(0, 0, 0), 1), x = "exhaust", wE = half * .3;
    const pts = [P(bay, R * 1.05, half * .16), P(bay - len * .06, R * .5, wE), P(bay - len * .2, R * .42, wE), P(ra + len * .2, R * .45, wE), P(ra - len * .12, R * .5, wE), P(-len / 2 + len * .02, R * .55, wE * 1.2)];
    // the group is in car space here (scale 1), so points are converted back to its local frame
    const toLocal = (v) => V(v.dot(L), v.y, v.dot(Rt));
    mk(g, x, tube(pts.map(toLocal), .025 * S, false, 80), "rust");
    const at = (u, y) => [u, y, wE];
    const cat = mk(g, x, new T.CapsuleGeometry(.07 * S, .22 * S, 6, 16), "steel", ...at(bay - len * .13, R * .43), 0, 0, HALF);
    cat.scale.set(1, 1, .8);
    const muf = mk(g, x, new T.CapsuleGeometry(.11 * S, .3 * S, 6, 20), "steel", ...at(ra - len * .06, R * .5), 0, 0, HALF);
    muf.scale.set(1, .7, 1.25);
    mk(g, x, cylX(.035 * S, .035 * S, .1 * S, 16), "chrome", -len / 2 + len * .01, R * .55, wE * 1.2, 0, 0, -HALF);
  }

  // STEERING — wheel (three spokes) in front of the driver on the right, column, rack and tie rods
  {
    const drvU = fa - (fa - ra) * .42, drvW = half * .42;
    const g = part("steering", P(drvU, hgt * .62, drvW)), s = "steering";
    const w = new T.Group(); w.rotation.set(0, 0, .4); g.add(w);
    const wm = (geo, kind, x, y, z, rx, ry, rz) => mk(w, s, geo, kind, x, y, z, rx, ry, rz);
    wm(new T.TorusGeometry(.19, .018, 12, 48), "rubber", 0, 0, 0, 0, HALF, 0);
    wm(new T.CylinderGeometry(.065, .065, .05, 24), "plastic", 0, 0, 0, 0, 0, HALF);
    [HALF, HALF + 2.2, HALF - 2.2].forEach(a => wm(new T.BoxGeometry(.02, .17, .04), "plastic", 0, Math.sin(a) * .09, Math.cos(a) * .09, a - HALF, 0, 0));
    mk(g, s, new T.CylinderGeometry(.022, .022, .62, 12), "steel", .27, -.2, 0, 0, 0, HALF + .4);
    const rack = part("steering", P(fa - len * .04, R * 1.05, 0)), rw = half / S * .62;
    mk(rack, s, new T.CylinderGeometry(.03, .03, rw * 2, 16), "alu", 0, 0, 0, HALF, 0, 0);
    [-1, 1].forEach(k => {
      mk(rack, s, new T.CylinderGeometry(.012, .012, .25, 8), "steel", 0, 0, k * (rw + .12), HALF, 0, 0);
      mk(rack, s, new T.CylinderGeometry(.03, .022, .07, 12), "rubber", 0, 0, k * (rw - .02), HALF, 0, 0);
    });
  }

  // AIRBAGS — inflated cushions: steering wheel, passenger dashboard and side curtains
  {
    const drvU = fa - (fa - ra) * .42, drvW = half * .42;
    const g = part("airbags", P(drvU - len * .03, hgt * .64, drvW)), a = "airbags";
    mk(g, a, new T.SphereGeometry(.2, 24, 16), "fabric").scale.set(.45, 1, 1);
    const pg = part("airbags", P(drvU + len * .01, hgt * .62, -drvW));
    mk(pg, a, new T.SphereGeometry(.26, 24, 16), "fabric").scale.set(.7, .8, 1.1);
    [-1, 1].forEach(k => {
      const cg = part("airbags", P(fa - (fa - ra) * .6, hgt * .7, k * half * .88));
      mk(cg, a, new T.BoxGeometry(1.4, .3, .03), "fabric");
    });
  }

  // SUSPENSION — at each corner: coil spring around a damper, top mount and a lower arm
  {
    const coil = () => {
      const pts = [];
      for (let i = 0; i <= 140; i++) { const t = i / 140, an = t * 6.5 * Math.PI * 2; pts.push(V(Math.cos(an) * .075, t * .32, Math.sin(an) * .075)); }
      return new T.TubeGeometry(new T.CatmullRomCurve3(pts), 180, .011, 6, false);
    };
    [fa, ra].forEach(ax => [-1, 1].forEach(k => {
      const g = part("suspension", P(ax, R * .95, k * (half - wid * .2))), s = "suspension";
      mk(g, s, coil(), "red");
      mk(g, s, new T.CylinderGeometry(.03, .03, .3, 14), "dark", 0, .15, 0);
      mk(g, s, new T.CylinderGeometry(.011, .011, .18, 10), "chrome", 0, .38, 0);
      mk(g, s, new T.CylinderGeometry(.075, .075, .03, 20), "rubber", 0, .46, 0);
      mk(g, s, new T.BoxGeometry(.06, .025, .34), "steel", 0, -.04, -k * .14);
    }));
  }

  // anchors (hotspot positions)
  car.updateMatrixWorld(true);
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
      if (o.userData.synthetic) { mm.opacity = C.sel && !on ? 0.3 : 1; mm.emissiveIntensity = on ? 0.5 : 0; }
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
    const t = clock.getElapsedTime(), k = 0.3 + (Math.sin(t * 4) + 1) * 0.2;
    (meshesFor[C.sel] || []).forEach(o => { if (o.userData.synthetic) o.material.emissiveIntensity = k; });
    dirty = true;
  }
  if (dirty) { renderer.render(scene, camera); place(); dirty = false; }
  raf = requestAnimationFrame(loop);
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && C.state === "ready" && C.el && C.el.isConnected) { dirty = true; start(); } });

window.Car3D = C;
})();
