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
  const colors = ["#0b6b3b", "#f4c20d", "#1b5aa6", "#d4202c", "#ffffff"];
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

/* sign-of-the-day hero road scene: dashes streaming, car gliding */
M.roadScene = (host) => {
  if (!host) return;
  host.innerHTML = `<svg viewBox="0 0 720 150" role="img" aria-label="Animated road">
    <rect x="0" y="86" width="720" height="46" fill="#3a4046" rx="6"/>
    <g class="dashes">${[0, 60, 120, 180, 240, 300, 360, 420, 480, 540, 600, 660].map(x => `<rect x="${x}" y="106" width="34" height="5" rx="2.5" fill="#f4c20d"/>`).join("")}</g>
    <g class="car"><rect x="0" y="78" width="52" height="22" rx="7" fill="#0b6b3b"/><rect x="10" y="68" width="30" height="16" rx="5" fill="#14633a"/><circle cx="13" cy="102" r="6" fill="#15181b"/><circle cx="40" cy="102" r="6" fill="#15181b"/></g>
    <g class="signs"><g transform="translate(560,30) scale(.45)"><circle cx="50" cy="50" r="44" fill="#fff" stroke="#d4202c" stroke-width="9"/><rect x="18" y="42" width="64" height="16" rx="2" fill="#d4202c"/></g>
    <g transform="translate(635,40) scale(.4)"><path d="M8 14H92L50 89Z" fill="#fff" stroke="#d4202c" stroke-width="9" stroke-linejoin="round"/></g></g>
  </svg>`;
  if (M.reduced() || !G) return;
  const car = host.querySelector(".car"), dashes = host.querySelectorAll(".dashes rect"), signs = host.querySelectorAll(".signs > g");
  G.to(dashes, { x: -60, duration: 1.1, ease: "none", repeat: -1 });
  G.fromTo(car, { x: -80 }, { x: 780, duration: 7, ease: "none", repeat: -1, repeatDelay: 2.4 });
  G.fromTo(signs, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .5, ease: "back.out(2)", stagger: .2, delay: .3 });
};

window.Motion = M;
})();
