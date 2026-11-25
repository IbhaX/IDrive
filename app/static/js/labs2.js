/* iDrive labs2.js — more driving-science labs:
   following distance (+ gap-counting drill), cornering grip (friction circle),
   crash energy (equivalent fall height), headlight reach, mirrors & blind spots.
   Every number comes from a simplified, labelled educational model. */
(() => {
"use strict";
const Lb = window.Labs;
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);
const G = () => Motion.gsap;
const g = 9.81;
const MU = { dry: .7, wet: .4, gravel: .35 };
const $ = (id) => document.getElementById(id);
const fx = (n, d = 1) => (+n).toFixed(d);
const t1 = (k, o) => I18n.esc(I18n.one(u(k, o)));   // plain text for SVG <text> and attributes

/* shared bits */
const rng = (id, key, val, min, max, step, unit, dec = 0) =>
  `<label class="ctl"><span>${e(u(key))} <b id="${id}V">${fx(val, dec)}</b> ${unit}</span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"></label>`;
const pick = (id, key, cur, opts) =>
  `<div class="ctl"><span>${e(u(key))}</span><div class="pills" role="radiogroup" aria-label="${I18n.esc(I18n.one(u(key)))}">${opts.map(([v, lk]) =>
    `<button type="button" role="radio" aria-checked="${cur === v}" class="pill${cur === v ? " on" : ""}" data-act="lab.pick" data-g="${id}" data-v="${v}">${e(u(lk))}</button>`).join("")}</div></div>`;
const note = (k) => `<aside class="lnote n-model"><b>${e(u("noteModel"))}</b><p>${e(u(k))}</p></aside>`;
const shell = (controls, viz, noteKey, extra = "") =>
  `<section class="panel lab rvl"><div class="labgrid"><div class="controls">${controls}</div><div class="labviz">${viz}</div></div>${extra}${note(noteKey)}</section>`;
const bindRange = (id, obj, key, dec, after) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("input", () => { obj[key] = +el.value; const v = $(id + "V"); if (v) v.textContent = fx(el.value, dec); after(); });
};
const myRt = () => (P.lab && P.lab.rt ? Math.min(2.5, Math.max(0.5, Math.round(P.lab.rt / 100) / 10 + 0.5)) : null);
const stopDist = (v, rt, mu) => v * rt + v * v / (2 * mu * g);

/* pill groups: data-g names the state object + key */
const GROUPS = {};
Lb.act = (name, el) => {
  if (name === "pick") {
    const grp = GROUPS[el.dataset.g];
    if (!grp) return;
    grp.obj[grp.key] = el.dataset.v;
    el.parentElement.querySelectorAll(".pill").forEach(b => { const on = b === el; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    grp.after();
    return;
  }
  const fn = ACT[name];
  if (fn) fn(el);
};
const ACT = {};

/* =====================================================================
   1. FOLLOWING DISTANCE — lead car brakes hard; do you stop in time?
   ===================================================================== */
const FOL = { kmh: 60, gap: 2, rt: 1.2, surf: "dry", lead: "same" };
Lb.folSim = (st) => {
  const v = st.kmh / 3.6, a = MU[st.surf] * g, al = a * (st.lead === "better" ? 1.2 : 1);
  const d = v * st.gap;
  let xl = d, vl = v, xy = 0, vy = v, t = 0, hit = false, impact = 0, minGap = d;
  const dt = 0.004, frames = [{ t: 0, xl, xy }];
  let nextF = 0.04;
  while (t < 20) {
    vl = Math.max(0, vl - al * dt); xl += vl * dt;
    if (t >= st.rt) vy = Math.max(0, vy - a * dt);
    xy += vy * dt; t += dt;
    const gap = xl - xy;
    minGap = Math.min(minGap, gap);
    if (gap <= 0) { hit = true; impact = (vy - vl) * 3.6; frames.push({ t, xl, xy: xl }); break; }
    if (t >= nextF) { frames.push({ t, xl, xy }); nextF += 0.04; }
    if (vl === 0 && vy === 0) break;
  }
  frames.push({ t, xl, xy: hit ? xl : xy });
  return { v, d, react: v * st.rt, hit, impact, minGap: Math.max(0, minGap), frames, safeGap: st.rt + 0.5 };
};
Lb.following = (host) => {
  const mine = myRt();
  GROUPS.folSurf = { obj: FOL, key: "surf", after: () => Lb.folDraw(false) };
  GROUPS.folLead = { obj: FOL, key: "lead", after: () => Lb.folDraw(false) };
  host.innerHTML = shell(
    rng("folKmh", "speed", FOL.kmh, 20, 120, 5, "km/h") +
    rng("folGap", "folGap", FOL.gap, 0.5, 4, 0.1, "s", 1) +
    rng("folRt", "reactionTime", FOL.rt, 0.5, 2.5, 0.1, "s", 1) +
    (mine ? `<button class="btn small" data-act="lab.folmine">${e(u("useMyRt", { s: fx(mine) }))}</button>` : `<a class="btn small" href="#science/reaction">${e(u("measureRt"))} →</a>`) +
    pick("folSurf", "roadSurface", FOL.surf, [["dry", "surf_dry"], ["wet", "surf_wet"]]) +
    pick("folLead", "folLeadCar", FOL.lead, [["same", "folSame"], ["better", "folBetter"]]) +
    `<button class="btn primary mag" data-act="lab.folrun">▶ ${e(u("folBrake"))}</button>`,
    `<svg id="folSvg" viewBox="0 0 720 190" role="img" aria-label="${I18n.esc(I18n.one(u("lab_following")))}"></svg><div class="readout" id="folOut" aria-live="polite"></div>`,
    "folModel",
    `<section class="drill" id="folDrill"><h3>${e(u("drillTitle"))}</h3><p class="muted">${e(u("drillLede"))}</p>
      <svg id="drSvg" viewBox="0 0 720 120" aria-hidden="true"></svg>
      <div class="row"><button class="btn primary" data-act="lab.drill" id="drBtn">${e(u("drillStart"))}</button><span id="drOut" class="drout" aria-live="polite"></span></div></section>`);
  const re = () => Lb.folDraw(false);
  bindRange("folKmh", FOL, "kmh", 0, re); bindRange("folGap", FOL, "gap", 1, re); bindRange("folRt", FOL, "rt", 1, re);
  Lb.folDraw(false);
  Lb.drillIdle();
  Motion.reveal(host);
};
ACT.folmine = () => { const m = myRt(); if (!m) return; FOL.rt = m; const el = $("folRt"); el.value = m; $("folRtV").textContent = fx(m); Lb.folDraw(false); };
ACT.folrun = () => Lb.folDraw(true);
const carSvg = (cls, label) => `<g class="${cls}"><rect x="-34" y="-14" width="34" height="28" rx="7"/><rect x="-12" y="-10" width="7" height="20" rx="2" class="win"/><rect x="-35" y="-11" width="3" height="6" rx="1" class="tail"/><rect x="-35" y="5" width="3" height="6" rx="1" class="tail"/>${label ? `<text x="-17" y="-20" text-anchor="middle" class="clab">${label}</text>` : ""}</g>`;
Lb.folDraw = (animate) => {
  const svg = $("folSvg");
  if (!svg) return;
  const r = Lb.folSim(FOL), last = r.frames[r.frames.length - 1];
  const span = Math.max(r.d + 15, last.xl + 12, 40);
  const X0 = 60, W = 630, sx = (m) => X0 + (m / span) * W, Y = 95;
  const tick = span > 200 ? 50 : span > 90 ? 20 : 10;
  let s = `<rect width="720" height="190" rx="14" class="labbg"/><rect x="0" y="62" width="720" height="66" class="road"/><line x1="0" y1="95" x2="720" y2="95" class="cl"/>`;
  for (let m = 0; m <= span; m += tick) s += `<line x1="${sx(m)}" y1="132" x2="${sx(m)}" y2="140" class="gridl"/><text x="${sx(m)}" y="156" class="axis" text-anchor="middle">${m} m</text>`;
  s += `<rect x="${sx(0)}" y="40" width="${sx(r.d) - sx(0)}" height="8" rx="4" class="gapbar"/><text x="${(sx(0) + sx(r.d)) / 2}" y="34" class="axis" text-anchor="middle">${t1("folGapM", { m: fx(r.d) })}</text>`;
  s += `<rect x="${sx(0)}" y="168" width="${sx(r.react) - sx(0)}" height="7" rx="3.5" class="seg-r"/>`;
  s += `<g id="folLeadG" transform="translate(${sx(r.d) + 34},${Y})">${carSvg("lead", t1("folLeadShort"))}</g><g id="folYouG" transform="translate(${sx(0)},${Y})">${carSvg("you", t1("you"))}</g>`;
  s += `<g id="folBang" opacity="0"><circle r="18" class="bang"/><text y="6" text-anchor="middle" class="hzt">!</text></g>`;
  svg.innerHTML = s;
  const out = $("folOut");
  out.innerHTML = `<div class="ro"><b>${e(u("folResult"))}</b>
    <span>${e(u("folGapM", { m: fx(r.d) }))}</span>
    <span><i class="sw r"></i>${e(u("reactionDist"))} ${fx(r.react)} m</span>
    <span class="${r.hit ? "bad" : "good"}">${r.hit ? e(u("folHit", { v: Math.max(1, Math.round(r.impact)) })) : e(u("folSafe", { m: fx(r.minGap) }))}</span></div>
    <div class="ro"><b>${e(u("folWhy"))}</b><span>${e(u("folWhy1", { s: fx(FOL.rt) }))}</span><span>${e(u(FOL.gap >= r.safeGap ? "folGood" : "folShort", { s: fx(r.safeGap) }))}</span></div>`;
  const place = (f) => {
    const L = $("folLeadG"), Yg = $("folYouG");
    if (!L) return;
    L.setAttribute("transform", `translate(${sx(f.xl) + 34},${Y})`);
    Yg.setAttribute("transform", `translate(${sx(f.xy)},${Y})`);
    L.classList.add("braking");
  };
  if (!animate) return;
  const gs = G();
  const finish = () => { place(last); if (r.hit) { const b = $("folBang"); b.setAttribute("transform", `translate(${sx(last.xl)},${Y})`); b.setAttribute("opacity", 1); Motion.pop(b); } };
  if (!gs || Motion.reduced()) { finish(); return; }
  const o = { i: 0 }, n = r.frames.length - 1;
  Motion.scoped(() => gs.to(o, { i: n, duration: Math.min(4, Math.max(1.4, last.t * 0.55)), ease: "none",
    onUpdate: () => place(r.frames[Math.round(o.i)]), onComplete: finish }));
};

/* gap-counting drill: both cars cruise; tap when YOU reach the post the lead car just passed */
const DR = { raf: 0, run: false };
Lb.drillIdle = () => {
  const svg = $("drSvg");
  if (!svg) return;
  svg.innerHTML = `<rect width="720" height="120" rx="12" class="labbg"/><rect y="30" width="720" height="60" class="road"/><line y1="60" x2="720" y2="60" class="cl"/><g transform="translate(250,60)">${carSvg("you", "")}</g><g transform="translate(520,60)">${carSvg("lead", "")}</g>`;
};
ACT.drill = () => {
  const btn = $("drBtn"), out = $("drOut");
  if (DR.run) { // the tap
    const t = (performance.now() - DR.tPass) / 1000;
    if (!DR.tPass) { out.textContent = u("drillTooEarly"); return; }
    DR.run = false; cancelAnimationFrame(DR.raf);
    const err = t - DR.gap;
    out.innerHTML = `${e(u("drillRes", { you: fx(t), real: fx(DR.gap) }))} <b class="${Math.abs(err) <= 0.3 ? "good" : "bad"}">${e(u(Math.abs(err) <= 0.3 ? "drillGood" : err < 0 ? "drillEarly" : "drillLate"))}</b> ${e(u(DR.gap >= 2 ? "drillWasSafe" : "drillWasClose"))}`;
    btn.textContent = u("drillAgain");
    return;
  }
  DR.gap = Math.round((0.9 + Math.random() * 2.4) * 10) / 10;
  DR.run = true; DR.tPass = 0; out.textContent = u("drillWatch");
  btn.textContent = u("drillTap");
  const svg = $("drSvg"), pxPerS = 270 / DR.gap; // lead car is 270px ahead
  const speed = pxPerS;                          // posts move at the cars' speed
  let posts = [760, 760 + 380], t0 = performance.now(), last = t0;
  const frame = (now) => {
    if (!DR.run || !document.getElementById("drSvg")) { DR.run = false; return; }
    const dt = (now - last) / 1000; last = now;
    posts = posts.map(p => p - speed * dt);
    if (posts[0] < -20) posts = [posts[1], posts[1] + 380];
    // the first post the lead car's front bumper (x=520) passes starts the clock
    if (!DR.tPass && posts[0] <= 520) DR.tPass = now - ((520 - posts[0]) / speed) * 1000;
    svg.innerHTML = `<rect width="720" height="120" rx="12" class="labbg"/><rect y="30" width="720" height="60" class="road"/>${posts.map(p => `<g transform="translate(${p.toFixed(1)},0)"><line x1="0" y1="10" x2="0" y2="30" class="post"/><circle cx="0" cy="9" r="5" class="postl"/></g>`).join("")}<line y1="60" x2="720" y2="60" class="cl" stroke-dashoffset="${((now - t0) / 1000 * speed) % 40}"/><g transform="translate(250,60)">${carSvg("you", "")}</g><g transform="translate(520,60)">${carSvg("lead", "")}</g>`;
    if (DR.tPass && (now - DR.tPass) / 1000 > DR.gap + 2.5) { DR.run = false; out.textContent = u("drillMissed"); $("drBtn").textContent = u("drillAgain"); return; }
    DR.raf = requestAnimationFrame(frame);
  };
  DR.raf = requestAnimationFrame(frame);
};

/* =====================================================================
   2. CORNERING — friction circle: steering + braking share one grip budget
   ===================================================================== */
const CO = { kmh: 50, r: 60, surf: "dry", brake: 0 };
Lb.coCalc = (st) => {
  const v = st.kmh / 3.6, mu = MU[st.surf], lim = mu * g;
  const lat = v * v / st.r, lon = st.brake / 100 * lim;
  const use = Math.hypot(lat, lon) / lim;
  const latLeft = Math.sqrt(Math.max(0, lim * lim - lon * lon));
  return { v, lim, lat, lon, use, vmax: Math.sqrt(latLeft * st.r) * 3.6, vmax0: Math.sqrt(lim * st.r) * 3.6 };
};
Lb.cornering = (host) => {
  GROUPS.coSurf = { obj: CO, key: "surf", after: () => Lb.coDraw(false) };
  host.innerHTML = shell(
    rng("coKmh", "speed", CO.kmh, 20, 120, 5, "km/h") +
    rng("coR", "coRadius", CO.r, 20, 300, 10, "m") +
    pick("coSurf", "roadSurface", CO.surf, [["dry", "surf_dry"], ["wet", "surf_wet"], ["gravel", "surf_gravel"]]) +
    rng("coBrake", "coBrake", CO.brake, 0, 100, 5, "%") +
    `<button class="btn primary mag" data-act="lab.corun">▶ ${e(u("coDrive"))}</button>`,
    `<div class="cowrap"><svg id="coSvg" viewBox="0 0 520 340" role="img" aria-label="${I18n.esc(I18n.one(u("lab_cornering")))}"></svg><svg id="coFc" viewBox="0 0 200 230" role="img" aria-label="${I18n.esc(I18n.one(u("coCircle")))}"></svg></div><div class="readout" id="coOut" aria-live="polite"></div>`,
    "coModel");
  const re = () => Lb.coDraw(false);
  bindRange("coKmh", CO, "kmh", 0, re); bindRange("coR", CO, "r", 0, re); bindRange("coBrake", CO, "brake", 0, re);
  Lb.coDraw(false);
  Motion.reveal(host);
};
ACT.corun = () => Lb.coDraw(true);
Lb.coDraw = (animate) => {
  const svg = $("coSvg"), fc = $("coFc");
  if (!svg) return;
  const c = Lb.coCalc(CO);
  const R = 70 + (CO.r - 20) / 280 * 150;        // drawn radius grows with the real one
  const Y0 = 300, Cx = 170, Cy = Y0 - R;           // left-hand bend
  const pt = (a) => [Cx + R * Math.cos(a), Cy + R * Math.sin(a)]; // a: π/2 → 0 sweeps up the bend
  const [ex, ey] = pt(0);
  const road = `M10 ${Y0} H${Cx} A${R} ${R} 0 0 0 ${ex} ${ey} V10`;
  const lvl = c.use <= .7 ? "ok" : c.use <= 1 ? "warn" : "bad";
  svg.innerHTML = `<rect width="520" height="340" rx="14" class="labbg"/>
    <path d="${road}" class="bendroad"/><path d="${road}" class="bendline"/>
    <text x="${Cx + 6}" y="${Cy + 18}" class="axis">r = ${CO.r} m</text>
    <g id="coCar">${carSvg("you", "")}</g><path id="coTrail" class="trail" d=""/>`;
  const used = Math.round(c.use * 100);
  // friction circle
  const FR = 78, fcx = 100, fcy = 104, k = FR / c.lim;
  const dx = Math.min(FR * 1.4, c.lat * k), dy = Math.min(FR * 1.4, c.lon * k);
  fc.innerHTML = `<circle cx="${fcx}" cy="${fcy}" r="${FR}" class="fcrim"/><circle cx="${fcx}" cy="${fcy}" r="${FR * .7}" class="fcsafe"/>
    <line x1="${fcx - FR - 8}" y1="${fcy}" x2="${fcx + FR + 8}" y2="${fcy}" class="gridl"/><line x1="${fcx}" y1="${fcy - FR - 8}" x2="${fcx}" y2="${fcy + FR + 8}" class="gridl"/>
    <text x="${fcx}" y="${fcy - FR - 12}" text-anchor="middle" class="tiny">${t1("coAccel")}</text><text x="${fcx}" y="${fcy + FR + 20}" text-anchor="middle" class="tiny">${t1("coBrakeAx")}</text><text x="${fcx + FR + 4}" y="${fcy - 6}" class="tiny" text-anchor="end">${t1("coTurn")}</text>
    <line x1="${fcx}" y1="${fcy}" x2="${fcx + dx}" y2="${fcy + dy}" class="fcvec ${lvl}"/><circle cx="${fcx + dx}" cy="${fcy + dy}" r="8" class="fcdot ${lvl}"/>
    <text x="${fcx}" y="226" text-anchor="middle" class="fcpct ${lvl}">${t1("coUsed", { p: used })}</text>`;
  $("coOut").innerHTML = `<div class="ro"><b>${e(u("coGrip"))}</b><span>${e(u("coSideways", { a: fx(c.lat / g, 2) }))}</span><span>${e(u("coLimit", { a: fx(c.lim / g, 2) }))}</span><span class="${lvl === "bad" ? "bad" : lvl === "warn" ? "warnt" : "good"}">${e(u(lvl === "bad" ? "coSlide" : lvl === "warn" ? "coEdge" : "coFine"))}</span></div>
    <div class="ro"><b>${e(u("coMax"))}</b><span>${e(u("coMaxV", { v: Math.round(c.vmax0) }))}</span>${CO.brake ? `<span>${e(u("coMaxBrake", { v: Math.round(c.vmax) }))}</span>` : ""}<span class="muted">${e(u("coReal"))}</span></div>`;
  // path for the car: straight → bend; if over the limit it slides wide along the tangent
  const car = $("coCar"), trail = $("coTrail");
  const slipA = c.use > 1 ? Math.PI / 2 - Math.min(Math.PI / 2 - .15, (Math.PI / 2) * (1 / c.use) * .6) : -1;
  const at = (p) => { // p in 0..1 over the whole run
    const L1 = Cx - 10, L2 = R * Math.PI / 2, L3 = ey - 10, tot = L1 + L2 + L3;
    let d = p * tot;
    if (d <= L1) return [10 + d, Y0, 0];
    d -= L1;
    if (d <= L2 || slipA >= 0) {
      const a = Math.PI / 2 - d / R;
      if (slipA >= 0 && a <= slipA) { // sliding: carry on along the tangent at slipA, rotating
        const [sx0, sy0] = pt(slipA), ang = -(Math.PI / 2 - slipA), extra = (slipA - a) * R * 1.1;
        return [sx0 + Math.cos(ang) * extra, sy0 + Math.sin(ang) * extra, ang * 180 / Math.PI + (slipA - a) * 40];
      }
      const [x, y] = pt(a);
      return [x, y, -(Math.PI / 2 - a) * 180 / Math.PI];
    }
    d -= L2;
    return [ex, ey - d, -90];
  };
  const put = (p) => { const [x, y, r] = at(p); car.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${r.toFixed(1)}) translate(17,0)`); return [x, y]; };
  put(0);
  if (!animate) return;
  const gs = G(), endP = slipA >= 0 ? 0.78 : 1;
  if (!gs || Motion.reduced()) { put(endP); return; }
  const o = { p: 0 }, pts = [];
  Motion.scoped(() => gs.to(o, { p: endP, duration: 2.6 * (55 / Math.max(25, CO.kmh)) ** .5, ease: "none",
    onUpdate: () => { pts.push(put(o.p)); trail.setAttribute("d", "M" + pts.map(q => q.map(n => n.toFixed(1)).join(" ")).join(" L")); } }));
};

/* =====================================================================
   3. CRASH ENERGY — hitting something at v is like falling v²/2g
   ===================================================================== */
const EN = { kmh: 50, veh: "car" };
const MASS = { scooter: 250, car: 1200, suv: 2200 };
Lb.energy = (host) => {
  GROUPS.enVeh = { obj: EN, key: "veh", after: () => Lb.enDraw(false) };
  host.innerHTML = shell(
    rng("enKmh", "speed", EN.kmh, 10, 120, 5, "km/h") +
    pick("enVeh", "enVehicle", EN.veh, [["scooter", "enScooter"], ["car", "enCar"], ["suv", "enSuv"]]) +
    `<button class="btn primary mag" data-act="lab.endrop">▼ ${e(u("enDrop"))}</button>`,
    `<div class="enwrap"><svg id="enSvg" viewBox="0 0 300 440" role="img" aria-label="${I18n.esc(I18n.one(u("lab_energy")))}"></svg><div id="enOut" class="readout one" aria-live="polite"></div></div>`,
    "enModel");
  bindRange("enKmh", EN, "kmh", 0, () => Lb.enDraw(false));
  Lb.enDraw(false);
  Motion.reveal(host);
};
ACT.endrop = () => Lb.enDraw(true);
Lb.enDraw = (animate) => {
  const svg = $("enSvg");
  if (!svg) return;
  const v = EN.kmh / 3.6, h = v * v / (2 * g), floors = h / 3, kj = 0.5 * MASS[EN.veh] * v * v / 1000;
  const top = 30, ground = 410, maxH = 60, py = (m) => ground - (m / maxH) * (ground - top);
  let s = `<rect width="300" height="440" rx="14" class="labbg"/><rect x="0" y="${ground}" width="300" height="30" class="groundr"/>`;
  s += `<rect x="150" y="${py(maxH)}" width="110" height="${ground - py(maxH)}" class="bldg"/>`;
  for (let f = 1; f * 3 <= maxH; f++) {
    const y = py(f * 3);
    s += `<line x1="150" y1="${y}" x2="260" y2="${y}" class="floorl"/>`;
    if (f % 2 === 0) s += `<text x="266" y="${y + 4}" class="tiny">${f}</text>`;
    s += `<rect x="160" y="${y + 4}" width="14" height="${(ground - top) / maxH * 3 - 8}" class="winb"/><rect x="186" y="${y + 4}" width="14" height="${(ground - top) / maxH * 3 - 8}" class="winb"/><rect x="212" y="${y + 4}" width="14" height="${(ground - top) / maxH * 3 - 8}" class="winb"/><rect x="238" y="${y + 4}" width="14" height="${(ground - top) / maxH * 3 - 8}" class="winb"/>`;
  }
  const hy = py(Math.min(h, maxH));
  s += `<line x1="20" y1="${hy}" x2="270" y2="${hy}" class="hline"/><text x="22" y="${hy - 8}" class="hlab">${fx(h)} m</text>`;
  s += `<g id="enCar" transform="translate(70,${hy - 14})"><rect x="-26" y="0" width="52" height="22" rx="6" class="carb"/><rect x="-14" y="-10" width="28" height="12" rx="4" class="carb"/><circle cx="-14" cy="22" r="6" class="wheel"/><circle cx="14" cy="22" r="6" class="wheel"/></g>`;
  s += `<g id="enBoom" opacity="0" transform="translate(70,${ground - 8})"><path d="M-30 6 L-14 -10 L-6 2 L4 -16 L10 0 L26 -8 L20 8 Z" class="boom"/></g>`;
  svg.innerHTML = s;
  const rel = (kmh) => ((kmh / EN.kmh) ** 2);
  $("enOut").innerHTML = `<div class="ro"><b>${e(u("enLike", { h: fx(h), f: fx(floors) }))}</b>
    <span>${e(u("enKj", { kj: Math.round(kj) }))}</span>
    <span>${e(u("enDouble"))}</span></div>
    <div class="ro"><b>${e(u("enCompare"))}</b>${[30, 50, 80, 100].map(k => `<span>${k} km/h · ${fx((k / 3.6) ** 2 / (2 * g))} m · ×${fx(rel(k), 2)}</span>`).join("")}<span class="muted">${e(u("enMassNote"))}</span></div>`;
  if (!animate) return;
  const car = $("enCar"), boom = $("enBoom"), gs = G();
  const land = () => { car.setAttribute("transform", `translate(70,${ground - 28})`); boom.setAttribute("opacity", 1); Motion.pop(boom); };
  if (!gs || Motion.reduced()) { land(); return; }
  const o = { y: hy - 14 };
  Motion.scoped(() => gs.to(o, { y: ground - 28, duration: Math.max(.35, Math.sqrt(2 * Math.min(h, maxH) / g) * .45), ease: "power2.in",
    onUpdate: () => car.setAttribute("transform", `translate(70,${o.y.toFixed(1)})`), onComplete: land }));
};

/* =====================================================================
   4. HEADLIGHTS — can you stop inside the distance you can see?
   ===================================================================== */
const HL = { kmh: 70, beam: "low", rt: 1.5, surf: "dry", clothes: "dark", glare: "no" };
const BEAM = { low: 50, high: 110 };
const CLOTH = { dark: .5, light: .75, reflective: 1 };
Lb.hlCalc = (st) => {
  const beam = st.glare === "yes" ? "low" : st.beam;
  const D = BEAM[beam] * CLOTH[st.clothes] * (st.glare === "yes" ? .6 : 1);
  const v = st.kmh / 3.6, mu = MU[st.surf], a = mu * g;
  const stop = stopDist(v, st.rt, mu);
  const vmax = a * (-st.rt + Math.sqrt(st.rt * st.rt + 2 * D / a)) * 3.6;
  return { D, v, stop, react: v * st.rt, vmax, beam, ok: stop <= D };
};
Lb.headlights = (host) => {
  const after = () => Lb.hlDraw(false);
  GROUPS.hlBeam = { obj: HL, key: "beam", after };
  GROUPS.hlCloth = { obj: HL, key: "clothes", after };
  GROUPS.hlGlare = { obj: HL, key: "glare", after };
  GROUPS.hlSurf = { obj: HL, key: "surf", after };
  host.innerHTML = shell(
    rng("hlKmh", "speed", HL.kmh, 20, 120, 5, "km/h") +
    pick("hlBeam", "hlBeam", HL.beam, [["low", "hlLow"], ["high", "hlHigh"]]) +
    pick("hlCloth", "hlClothes", HL.clothes, [["dark", "hlDark"], ["light", "hlLight"], ["reflective", "hlRefl"]]) +
    pick("hlGlare", "hlGlare", HL.glare, [["no", "no"], ["yes", "yes"]]) +
    pick("hlSurf", "roadSurface", HL.surf, [["dry", "surf_dry"], ["wet", "surf_wet"]]) +
    rng("hlRt", "reactionTime", HL.rt, 0.5, 2.5, 0.1, "s", 1) +
    `<button class="btn primary mag" data-act="lab.hlrun">▶ ${e(u("hlDrive"))}</button>`,
    `<svg id="hlSvg" viewBox="0 0 720 220" role="img" aria-label="${I18n.esc(I18n.one(u("lab_headlights")))}"></svg><div class="readout" id="hlOut" aria-live="polite"></div>`,
    "hlModel");
  bindRange("hlKmh", HL, "kmh", 0, after); bindRange("hlRt", HL, "rt", 1, after);
  Lb.hlDraw(false);
  Motion.reveal(host);
};
ACT.hlrun = () => Lb.hlDraw(true);
Lb.hlDraw = (animate) => {
  const svg = $("hlSvg");
  if (!svg) return;
  const c = Lb.hlCalc(HL);
  const span = Math.max(c.D, c.stop, 60) * 1.12, X0 = 70, W = 620, sx = (m) => X0 + (m / span) * W, Y = 120;
  const tick = span > 150 ? 25 : span > 80 ? 20 : 10;
  let s = `<defs><linearGradient id="beamG" x1="0" x2="1"><stop offset="0" stop-color="#fff6c8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient></defs>
    <rect width="720" height="220" rx="14" class="nightbg"/><rect x="0" y="80" width="720" height="80" class="nroad"/><line x1="0" y1="120" x2="720" y2="120" class="ncl"/>`;
  for (let m = 0; m <= span; m += tick) s += `<text x="${sx(m)}" y="186" class="naxis" text-anchor="middle">${m} m</text>`;
  s += `<path id="hlBeamP" d="M${sx(0)} ${Y - 8} L${sx(c.D * 1.15)} ${Y - 40} L${sx(c.D * 1.15)} ${Y + 40} L${sx(0)} ${Y + 8} Z" fill="url(#beamG)"/>`;
  s += `<line x1="${sx(c.D)}" y1="70" x2="${sx(c.D)}" y2="170" class="seeline"/><text x="${sx(c.D)}" y="62" text-anchor="middle" class="naxis">${t1("hlSee", { m: Math.round(c.D) })}</text>`;
  s += `<g transform="translate(${sx(c.D) + 6},${Y - 18})" class="ped ${HL.clothes}"><circle cx="0" cy="-6" r="5"/><rect x="-4" y="0" width="8" height="18" rx="3"/>${HL.clothes === "reflective" ? `<rect x="-4" y="6" width="8" height="3" class="refl"/>` : ""}</g>`;
  s += `<rect x="${sx(0)}" y="196" width="${sx(c.react) - sx(0)}" height="7" rx="3.5" class="seg-r"/><rect x="${sx(c.react)}" y="196" width="${sx(c.stop) - sx(c.react)}" height="7" rx="3.5" class="seg-b"/>`;
  s += `<g id="hlCar" transform="translate(${sx(0)},${Y})">${carSvg("you", "")}</g>`;
  svg.innerHTML = s;
  $("hlOut").innerHTML = `<div class="ro"><b>${e(u("hlResult"))}</b><span>${e(u("hlSee", { m: Math.round(c.D) }))}${HL.glare === "yes" && HL.beam === "high" ? " · " + e(u("hlDipped")) : ""}</span><span><i class="sw r"></i><i class="sw b"></i>${e(u("totalDist"))} <b>${fx(c.stop)} m</b></span><span class="${c.ok ? "good" : "bad"}">${e(u(c.ok ? "hlOk" : "hlOver", { m: fx(Math.abs(c.D - c.stop)) }))}</span></div>
    <div class="ro"><b>${e(u("hlMax"))}</b><span>${e(u("hlMaxV", { v: Math.floor(c.vmax) }))}</span><span class="muted">${e(u("hlTip"))}</span></div>`;
  if (!animate) return;
  const car = $("hlCar"), beam = $("hlBeamP"), gs = G();
  const end = Math.min(c.stop, c.D + 2);
  const put = (m) => { car.setAttribute("transform", `translate(${sx(m)},${Y})`); beam.setAttribute("transform", `translate(${sx(m) - sx(0)},0)`); };
  if (!gs || Motion.reduced()) { put(end); return; }
  const o = { m: 0 };
  Motion.scoped(() => gs.timeline()
    .to(o, { m: c.react, duration: 1, ease: "none", onUpdate: () => put(o.m) })
    .to(o, { m: end, duration: 1.4, ease: "power2.out", onUpdate: () => put(o.m),
      onComplete: () => { if (!c.ok) Motion.pop(svg.querySelector(".ped")); } }));
};

/* =====================================================================
   5. MIRRORS & BLIND SPOTS — top-down, right-hand drive (India)
   ===================================================================== */
const BS = { lane: "right", dist: -3, rAdj: 0, lAdj: 0, look: "none" };
const M2PX = 16, OX = 140, OY = 110; // metres → px; car centre at (OX, OY); forward = up
const BSG = {
  eye: [0.35, 0.3],
  rM: { at: [1.0, 0.9], base: 9, fov: 18 },     // flat driver-side mirror
  lM: { at: [-1.0, 0.9], base: 14, fov: 28 },   // convex passenger-side mirror
  iM: { at: [0, 0.9], fov: 22 },                // interior mirror, through the rear glass
};
const ang = (dx, dy) => Math.atan2(dx, dy) * 180 / Math.PI; // 0 = forward, ±180 = back, + = right
const within = (a, c, half) => { let d = ((a - c + 540) % 360) - 180; return Math.abs(d) <= half; };
Lb.bsSees = (x, y) => {
  const r = BSG.rM, l = BSG.lM, i = BSG.iM, ey = BSG.eye;
  const out = [];
  const rc = 180 - (r.base + 2 * BS.rAdj);   // pointing back, swung outward (right = +)
  if (x > r.at[0] - .2 && within(ang(x - r.at[0], y - r.at[1]), rc, r.fov / 2)) out.push("rm");
  const lc = -180 + (l.base + 2 * BS.lAdj);
  if (x < l.at[0] + .2 && within(ang(x - l.at[0], y - l.at[1]), lc, l.fov / 2)) out.push("lm");
  if (y < -2.4 && within(ang(x - i.at[0], y - i.at[1]), 180, i.fov / 2)) out.push("im");
  const fa = ang(x - ey[0], y - ey[1]);
  if (Math.abs(fa) <= 95) out.push("eye");
  if (BS.look === "right" && fa >= 60 && fa <= 165) out.push("look");
  if (BS.look === "left" && fa <= -60 && fa >= -165) out.push("look");
  return out;
};
Lb.blindspot = (host) => {
  const after = () => Lb.bsDraw();
  GROUPS.bsLane = { obj: BS, key: "lane", after };
  GROUPS.bsLook = { obj: BS, key: "look", after };
  host.innerHTML = shell(
    pick("bsLane", "bsLane", BS.lane, [["right", "bsRightLane"], ["left", "bsLeftLane"]]) +
    rng("bsDist", "bsDist", BS.dist, -18, 6, 0.5, "m", 1) +
    rng("bsR", "bsRAdj", BS.rAdj, 0, 15, 1, "°") +
    rng("bsL", "bsLAdj", BS.lAdj, 0, 15, 1, "°") +
    pick("bsLook", "bsLook", BS.look, [["none", "bsNoLook"], ["right", "bsLookR"], ["left", "bsLookL"]]),
    `<div class="bswrap"><svg id="bsSvg" viewBox="0 0 280 420" role="img" aria-label="${I18n.esc(I18n.one(u("lab_blindspot")))}"></svg><div id="bsOut" class="readout one" aria-live="polite"></div></div>`,
    "bsModel");
  bindRange("bsDist", BS, "dist", 1, after); bindRange("bsR", BS, "rAdj", 0, after); bindRange("bsL", BS, "lAdj", 0, after);
  Lb.bsDraw();
  Motion.reveal(host);
};
Lb.bsDraw = () => {
  const svg = $("bsSvg");
  if (!svg) return;
  const P2 = (x, y) => [OX + x * M2PX, OY - y * M2PX];
  const wedge = (at, centre, fov, len, cls) => {
    const [ax, ay] = P2(at[0], at[1]);
    const a1 = (centre - fov / 2) * Math.PI / 180, a2 = (centre + fov / 2) * Math.PI / 180;
    const p = (a) => P2(at[0] + Math.sin(a) * len, at[1] + Math.cos(a) * len);
    const [x1, y1] = p(a1), [x2, y2] = p(a2);
    return `<path d="M${ax} ${ay} L${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)} Z" class="wedge ${cls}"/>`;
  };
  let s = `<rect width="280" height="420" rx="14" class="labbg"/>`;
  [-1, 0, 1].forEach(k => { const [x] = P2(k * 3.5 - 1.75, 0); s += `<rect x="${x}" y="0" width="${3.5 * M2PX}" height="420" class="road${k ? "" : " own"}"/>`; });
  [-1, 0, 1, 2].forEach(k => { const [x] = P2(k * 3.5 - 1.75, 0); s += `<line x1="${x}" y1="0" x2="${x}" y2="420" class="${k === -1 || k === 2 ? "edgel" : "cl"}"/>`; });
  // blind-zone heat map (sampled)
  for (let x = -6.5; x <= 6.5; x += 0.5) for (let y = -17; y <= 3; y += 0.5) {
    if (Math.abs(x) < 1.1 && y > -2.5 && y < 2.4) continue;
    if (!Lb.bsSees(x, y).length) { const [px, py] = P2(x - .25, y + .25); s += `<rect x="${px.toFixed(1)}" y="${py.toFixed(1)}" width="${M2PX / 2}" height="${M2PX / 2}" class="blindc"/>`; }
  }
  s += wedge(BSG.rM.at, 180 - (BSG.rM.base + 2 * BS.rAdj), BSG.rM.fov, 22, "rm");
  s += wedge(BSG.lM.at, -180 + (BSG.lM.base + 2 * BS.lAdj), BSG.lM.fov, 22, "lm");
  s += wedge(BSG.iM.at, 180, BSG.iM.fov, 23, "im");
  if (BS.look !== "none") s += wedge(BSG.eye, BS.look === "right" ? 112 : -112, 105, 10, "look");
  // own car (driver on the right)
  const [cx, cy] = P2(-0.9, 2.25);
  s += `<g><rect x="${cx}" y="${cy}" width="${1.8 * M2PX}" height="${4.5 * M2PX}" rx="8" class="bscar"/><rect x="${cx + 4}" y="${cy + 14}" width="${1.8 * M2PX - 8}" height="12" rx="3" class="win"/>
    <circle cx="${P2(BSG.eye[0], 0)[0]}" cy="${P2(0, BSG.eye[1])[1]}" r="4" class="eyed"/>
    <rect x="${P2(1.0, 0)[0] - 2}" y="${P2(0, 0.9)[1] - 3}" width="6" height="5" rx="1" class="mir"/><rect x="${P2(-1.0, 0)[0] - 4}" y="${P2(0, 0.9)[1] - 3}" width="6" height="5" rx="1" class="mir"/></g>`;
  // the motorbike
  const bx = BS.lane === "right" ? 3.5 : -3.5;
  const pts = [[bx, BS.dist + 1], [bx, BS.dist], [bx, BS.dist - 1]];
  const seen = new Set(pts.flatMap(([x, y]) => Lb.bsSees(x, y)));
  const [bpx, bpy] = P2(bx, BS.dist);
  const hidden = !seen.size;
  s += `<g transform="translate(${bpx},${bpy})" class="bike ${hidden ? "hid" : ""}"><rect x="-5" y="-16" width="10" height="32" rx="5"/><circle cx="0" cy="-6" r="5" class="rider"/></g>`;
  svg.innerHTML = s;
  const names = { rm: "bsSeenR", lm: "bsSeenL", im: "bsSeenI", eye: "bsSeenEye", look: "bsSeenLook" };
  $("bsOut").innerHTML = `<div class="ro"><b class="${hidden ? "bad" : "good"}">${e(u(hidden ? "bsHidden" : "bsVisible"))}</b>${hidden ? `<span>${e(u("bsHiddenTip"))}</span>` : [...seen].map(k => `<span>✓ ${e(u(names[k]))}</span>`).join("")}</div>
    <div class="ro"><b>${e(u("bsLegend"))}</b><span><i class="sw rmk"></i>${e(u("bsSeenR"))}</span><span><i class="sw lmk"></i>${e(u("bsSeenL"))}</span><span><i class="sw imk"></i>${e(u("bsSeenI"))}</span><span><i class="sw blk"></i>${e(u("bsBlindZone"))}</span><span class="muted">${e(u("bsTip"))}</span></div>`;
};
})();
