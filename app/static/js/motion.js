/* IDrive motion.js — micro-interaction helpers over GSAP (vendored).
   Views call these; they never touch GSAP directly. Every set piece has a
   reduced-motion path and animates transforms/opacity only. */
(() => {
"use strict";
const M = {};
const G = window.gsap || null;
if (G) {
  const plugs = [];
  if (window.Flip) plugs.push(window.Flip);
  if (window.ScrollTrigger) plugs.push(window.ScrollTrigger);
  if (window.DrawSVGPlugin) plugs.push(window.DrawSVGPlugin);
  if (window.MotionPathPlugin) plugs.push(window.MotionPathPlugin);
  if (window.CustomEase) plugs.push(window.CustomEase);
  if (plugs.length) G.registerPlugin(...plugs);
}
M.gsap = G;
M.reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* per-view animation context, reverted on route change */
let ctx = null;
M.enterView = (fn) => {
  if (ctx) ctx.revert();
  ctx = G ? G.context(fn) : null;
  return ctx;
};
M.leaveView = () => { if (ctx) { ctx.revert(); ctx = null; } };

/* small primitives */
M.pop = (el) => { if (!el) return; if (M.reduced() || !G) return; G.fromTo(el, { scale: .92 }, { scale: 1, duration: .3, ease: "back.out(2.2)" }); };
M.shake = (el) => { if (!el) return; if (M.reduced()) { el.classList.add("shake"); setTimeout(() => el.classList.remove("shake"), 360); return; } if (G) G.fromTo(el, { x: 0 }, { x: -6, duration: .07, repeat: 4, yoyo: true, ease: "power1.inOut", onComplete: () => G.set(el, { x: 0 }) }); };
M.rise = (els) => {
  if (M.reduced() || !G) return;
  const list = els && els.length ? els : (els ? [els] : []);
  if (list.length) G.fromTo(list, { y: 10, opacity: 0, scale: .98 }, { y: 0, opacity: 1, scale: 1, duration: .42, ease: "back.out(1.4)", stagger: .03, overwrite: true });
};
M.countTo = (el, to, suffix = "") => {
  if (!el) return;
  if (M.reduced() || !G) { el.textContent = to + suffix; return; }
  const o = { v: 0 };
  G.to(o, { v: to, duration: .9, ease: "power2.out", snap: { v: 1 }, onUpdate: () => { el.textContent = Math.round(o.v) + suffix; } });
};
M.barTo = (el, pct) => {
  if (!el) return;
  if (M.reduced() || !G) { el.style.width = pct + "%"; return; }
  G.to(el, { width: pct + "%", duration: .8, ease: "elastic.out(1,.7)" });
};

/* jelly indicator inside a tab strip / dock */
M.jelly = (container, sel = 'a[aria-current="page"]', cls = "jelly") => {
  if (!container) return;
  let j = container.querySelector("." + cls);
  if (!j) { j = document.createElement("i"); j.className = cls; j.setAttribute("aria-hidden", "true"); container.prepend(j); }
  const cur = container.querySelector(sel);
  if (!cur) { j.style.width = "0"; return; }
  const cr = container.getBoundingClientRect(), r = cur.getBoundingClientRect();
  const x = r.left - cr.left, w = r.width;
  if (M.reduced() || !G || container._jellyInit === undefined) {
    j.style.transform = `translateX(${x}px)`; j.style.width = w + "px";
  } else {
    G.to(j, { x, width: w, duration: .42, ease: "back.out(1.6)", overwrite: true });
  }
  container._jellyInit = true;
};

/* language liquid pill */
M.langPill = (container) => {
  if (!container) return;
  let p = container.querySelector(".lpill");
  if (!p) { p = document.createElement("i"); p.className = "lpill"; p.setAttribute("aria-hidden", "true"); container.prepend(p); }
  const cur = container.querySelector(".lg.on");
  if (!cur) { p.style.width = "0"; return; }
  const cr = container.getBoundingClientRect(), r = cur.getBoundingClientRect();
  const x = r.left - cr.left, w = r.width;
  if (M.reduced() || !G || container._pillInit === undefined) {
    p.style.transform = `translateX(${x}px)`; p.style.width = w + "px";
  } else {
    G.to(p, { x, width: w, duration: .42, ease: "back.out(1.6)", overwrite: true });
  }
  container._pillInit = true;
};

/* grid reorder via Flip */
M.flipGrid = (grid, mutate) => {
  if (M.reduced() || !G || !window.Flip || !grid) { mutate(); return; }
  const state = window.Flip.getState(grid.children);
  mutate();
  window.Flip.from(state, { duration: .45, ease: "power2.inOut", stagger: .008, absolute: true });
};

/* toasts */
M.toast = (msg, kind = "") => {
  const root = document.getElementById("toasts");
  if (!root) return;
  while (root.children.length >= 3) root.firstChild.remove();
  const t = document.createElement("div");
  t.className = "toast" + (kind === "err" ? " err" : "");
  t.setAttribute("role", "status");
  t.textContent = msg;
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 300); }, 2600);
};

/* confetti — pooled particles on one canvas, removed after use */
M.confetti = () => {
  const cv = document.getElementById("confetti");
  if (!cv || M.reduced()) return;
  cv.hidden = false;
  const ctx2 = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const colors = ["#7c6cff", "#38bdf8", "#34d399", "#fbbf24", "#e8ecf6"];
  const N = Math.min(90, Math.floor(innerWidth / 9));
  const parts = Array.from({ length: N }, () => ({
    x: innerWidth / 2, y: innerHeight * .38,
    vx: (Math.random() - .5) * 13, vy: -Math.random() * 12 - 4,
    s: Math.random() * 7 + 4, r: Math.random() * Math.PI,
    vr: (Math.random() - .5) * .3, c: colors[(Math.random() * colors.length) | 0],
    ttl: 90 + Math.random() * 40,
  }));
  let frames = 0;
  const tick = () => {
    ctx2.clearRect(0, 0, cv.width, cv.height);
    let alive = 0;
    for (const p of parts) {
      p.ttl--; if (p.ttl <= 0) continue;
      alive++;
      p.vy += .28; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx2.save(); ctx2.translate(p.x, p.y); ctx2.rotate(p.r);
      ctx2.globalAlpha = Math.min(1, p.ttl / 30);
      ctx2.fillStyle = p.c; ctx2.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx2.restore();
    }
    frames++;
    if (alive > 0 && frames < 300) requestAnimationFrame(tick);
    else { ctx2.clearRect(0, 0, cv.width, cv.height); cv.hidden = true; }
  };
  requestAnimationFrame(tick);
};

/* sign draw-in: stroke paths draw themselves (DrawSVG when possible) */
M.drawSign = (scope) => {
  if (!scope || M.reduced() || !G || !window.DrawSVGPlugin) return;
  const strokes = scope.querySelectorAll("path[stroke],circle[stroke],line[stroke],polyline[stroke],polygon[stroke]");
  if (!strokes.length || strokes.length > 40) return;
  try {
    G.fromTo(strokes, { drawSVG: "0%" }, { drawSVG: "100%", duration: .9, ease: "power2.inOut", stagger: .06 });
  } catch (e) { /* non-stroke geometry — skip silently */ }
};

/* press-and-hold to confirm */
M.holdToConfirm = (btn, onDone, ms = 1200) => {
  if (!btn) return;
  let t = null, started = null;
  const end = (ok) => {
    btn.classList.remove("holding");
    if (t) { clearTimeout(t); t = null; }
    if (ok && onDone) onDone();
  };
  btn.addEventListener("pointerdown", (e) => {
    btn.classList.add("holding"); started = Date.now();
    t = setTimeout(() => end(true), ms);
    btn.setPointerCapture && btn.setPointerCapture(e.pointerId);
  });
  ["pointerup", "pointercancel", "pointerleave"].forEach(ev =>
    btn.addEventListener(ev, () => { if (Date.now() - (started || 0) < ms) end(false); }));
  btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") end(true); });
};

/* pointer tilt: 3D card response on tiles (delegated — tiles re-render) */
let tiltBound = false;
M.bindTilt = () => {
  if (tiltBound) return;
  tiltBound = true;
  if (M.reduced() || !window.matchMedia("(pointer:fine)").matches) return;
  let cur = null;
  const clear = () => { if (cur) { cur.style.setProperty("--rx", "0deg"); cur.style.setProperty("--ry", "0deg"); cur = null; } };
  document.addEventListener("pointermove", (e) => {
    const t = e.target.closest && e.target.closest(".tile,.tiltc");
    if (t !== cur) { clear(); if (!t) return; cur = t; }
    if (!cur) return;
    cur.classList.add("tilt");
    const r = cur.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - .5, dy = (e.clientY - r.top) / r.height - .5;
    cur.style.setProperty("--ry", (dx * 10).toFixed(2) + "deg");
    cur.style.setProperty("--rx", (-dy * 10).toFixed(2) + "deg");
  });
  document.addEventListener("pointerleave", clear, true);
};

/* immersive night drive: parallax layers, glowing skyline, streaming
   dashes, car with headlight beam, floating signs. Light-theme keeps
   the same scene (it reads as dusk) — surfaces adapt via CSS. */
M.roadScene = (host) => {
  if (!host) return;
  const dashX = [0, 80, 160, 240, 320, 400, 480, 560, 640];
  const stars = [[60, 22], [140, 12], [230, 30], [330, 16], [420, 26], [520, 14], [610, 24], [690, 10]];
  host.innerHTML = `<svg viewBox="0 0 720 190" role="img" aria-label="Animated night road">
    <defs>
      <linearGradient id="hs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0e24"/><stop offset=".7" stop-color="#141a3e"/><stop offset="1" stop-color="#0a0d20"/></linearGradient>
      <linearGradient id="rd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151a30"/><stop offset="1" stop-color="#0b0e1c"/></linearGradient>
      <radialGradient id="mg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#a5b4ff" stop-opacity=".9"/><stop offset=".45" stop-color="#7c6cff" stop-opacity=".35"/><stop offset="1" stop-color="#7c6cff" stop-opacity="0"/></radialGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbbf24" stop-opacity=".5"/><stop offset="1" stop-color="#fbbf24" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="720" height="190" fill="url(#hs)"/>
    <g class="stars">${stars.map(s => `<circle cx="${s[0]}" cy="${s[1]}" r="1.4" fill="#c7d2fe" opacity=".8"/>`).join("")}</g>
    <circle cx="600" cy="52" r="30" fill="url(#mg)"/><circle cx="600" cy="52" r="13" fill="#dbe2ff"/>
    <g class="skyline" fill="#0e1330">
      <rect x="20" y="82" width="34" height="52"/><rect x="66" y="96" width="24" height="38"/><rect x="104" y="74" width="40" height="60"/>
      <rect x="470" y="88" width="30" height="46"/><rect x="516" y="72" width="38" height="62"/><rect x="566" y="94" width="26" height="40"/>
      <rect x="640" y="80" width="36" height="54"/><rect x="688" y="98" width="24" height="36"/>
    </g>
    <g class="citylights" fill="#38bdf8">${[30, 78, 118, 130, 482, 530, 548, 576, 654, 696].map((x, i) => `<rect x="${x}" y="${88 + (i % 3) * 12}" width="4" height="5" opacity=".85"/>`).join("")}</g>
    <rect x="0" y="132" width="720" height="58" fill="url(#rd)"/>
    <rect x="0" y="132" width="720" height="3" fill="#1e2650"/>
    <g class="dashes">${dashX.map(x => `<rect x="${x}" y="158" width="40" height="6" rx="3" fill="#7c6cff" opacity=".85"/>`).join("")}</g>
    <g class="car">
      <path d="M54 128 L96 120 L96 142 L54 146 Z" fill="url(#beam)"/>
      <rect x="0" y="126" width="54" height="22" rx="8" fill="#7c6cff"/>
      <rect x="9" y="115" width="32" height="16" rx="6" fill="#5b48f2"/>
      <rect x="14" y="118" width="10" height="8" rx="2" fill="#38bdf8" opacity=".85"/>
      <rect x="27" y="118" width="10" height="8" rx="2" fill="#38bdf8" opacity=".85"/>
      <circle cx="14" cy="149" r="7" fill="#05060d"/><circle cx="41" cy="149" r="7" fill="#05060d"/>
      <circle cx="14" cy="149" r="3" fill="#1e2650"/><circle cx="41" cy="149" r="3" fill="#1e2650"/>
    </g>
    <g class="signs">
      <g class="fsign" transform="translate(300,84) scale(.42)"><rect x="46" y="88" width="8" height="46" fill="#232a4a"/><circle cx="50" cy="50" r="44" fill="#0d1120" stroke="#fbbf24" stroke-width="7"/><circle cx="50" cy="50" r="38" fill="#f8fafc"/><rect x="18" y="42" width="64" height="16" rx="3" fill="#d4202c"/></g>
      <g class="fsign" transform="translate(430,96) scale(.34)"><rect x="46" y="86" width="8" height="48" fill="#232a4a"/><path d="M8 16H92L50 92Z" fill="#f8fafc" stroke="#d4202c" stroke-width="9" stroke-linejoin="round"/></g>
    </g>
  </svg>`;
  if (M.reduced() || !G) return;
  const car = host.querySelector(".car"), dashes = host.querySelectorAll(".dashes rect"),
        stars2 = host.querySelectorAll(".stars circle");
  G.to(dashes, { x: -80, duration: .9, ease: "none", repeat: -1 });
  G.fromTo(car, { x: -140 }, { x: 820, duration: 8, ease: "none", repeat: -1, repeatDelay: 2.2 });
  G.to(stars2, { opacity: .3, duration: 1.6, ease: "sine.inOut", repeat: -1, yoyo: true, stagger: { each: .3, from: "random" } });
};

/* ---------- view-scoped animation (ScrollTriggers, timelines) ----------
   Everything created through M.scoped() lives in the current view context
   and is reverted by M.resetView() on every route change — no leaks. */
M.resetView = () => {
  if (ctx) { ctx.revert(); ctx = null; }
  if (G) ctx = G.context(() => {});
};
M.scoped = (fn) => { if (ctx) ctx.add(fn); else fn(); };

/* staggered scroll reveals for `.rv` blocks in a scope */
M.reveal = (scope) => {
  if (!scope) return;
  const els = [...scope.querySelectorAll(".rvl")];
  if (!els.length) return;
  if (M.reduced() || !G || !window.ScrollTrigger) { els.forEach(el => el.classList.add("in")); return; }
  M.scoped(() => {
    G.set(els, { y: 18, opacity: 0 });
    window.ScrollTrigger.batch(els, {
      start: "top 92%",
      once: true,
      onEnter: (batch) => G.to(batch, { y: 0, opacity: 1, duration: .55, ease: "power3.out", stagger: .06, overwrite: true, onComplete: () => batch.forEach(b => b.classList.add("in")) }),
    });
    window.ScrollTrigger.refresh();
  });
};

/* progress rings fill from empty */
M.rings = (scope) => {
  if (!scope) return;
  const rings = scope.querySelectorAll(".ringfg[data-c]");
  if (M.reduced() || !G) return;
  M.scoped(() => {
    rings.forEach(r => {
      const c = +r.dataset.c, pct = +r.dataset.pct;
      G.fromTo(r, { strokeDashoffset: c }, { strokeDashoffset: c * (1 - pct / 100), duration: 1.1, ease: "power3.out", delay: .15 });
    });
  });
};

/* table-of-contents scroll spy for the lesson reader */
M.tocSpy = (scope) => {
  const links = scope ? [...scope.querySelectorAll("[data-toc]")] : [];
  if (!links.length) return;
  const set = (id) => links.forEach(a => a.classList.toggle("on", a.dataset.toc === id));
  if (!G || !window.ScrollTrigger) return;
  M.scoped(() => {
    links.forEach(a => {
      const target = document.getElementById(a.dataset.toc);
      if (!target) return;
      window.ScrollTrigger.create({ trigger: target, start: "top 45%", end: "bottom 45%", onToggle: (self) => { if (self.isActive) set(a.dataset.toc); } });
    });
  });
};

/* magnetic hover on primary calls to action (fine pointers only) */
let magBound = false;
M.bindMagnetic = () => {
  if (magBound || M.reduced() || !G || !window.matchMedia("(pointer:fine)").matches) return;
  magBound = true;
  let cur = null;
  document.addEventListener("pointermove", (e) => {
    const m = e.target.closest && e.target.closest(".mag");
    if (cur && m !== cur) { G.to(cur, { x: 0, y: 0, duration: .5, ease: "elastic.out(1,.5)" }); cur = null; }
    if (!m) return;
    cur = m;
    const r = m.getBoundingClientRect();
    G.to(m, { x: (e.clientX - r.left - r.width / 2) * .18, y: (e.clientY - r.top - r.height / 2) * .28, duration: .3, ease: "power2.out" });
  });
};

/* timeline helper that respects reduced motion (returns null when reduced) */
M.timeline = (opts) => (G && !M.reduced() ? G.timeline(opts) : null);

window.Motion = M;
})();
