/* iDrive vehicle.js — interactive vehicle explorer (clickable cut-away)
   and the dashboard warning-light encyclopedia. */
(() => {
"use strict";
const V = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => esc(s == null ? "" : s);

V.view = async (app) => {
  const tab = S.param === "lights" ? "lights" : "explore";
  const sel = S.param2 || null;
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tVehicle"), "#vehicle"]])}
  <div class="seg" role="tablist"><a role="tab" href="#vehicle/explore" class="${tab === "explore" ? "on" : ""}" aria-selected="${tab === "explore"}">${e(u("fVehicle"))}</a><a role="tab" href="#vehicle/lights" class="${tab === "lights" ? "on" : ""}" aria-selected="${tab === "lights"}">${e(u("fLights"))}</a></div>
  <div id="vHost"><section class="panel"><div class="skel"><i style="height:200px"></i></div></section></div>`;
  const host = document.getElementById("vHost");
  try {
    if (tab === "lights") {
      const [d] = await Promise.all([Course.library("lights"), Data.ensureSvgs("dash")]);
      if (S.view !== "vehicle") return;
      V.lights = d.lights; V.lightsView(host, sel);
    } else {
      const d = await Course.library("vehicle");
      if (S.view !== "vehicle") return;
      V.parts = d.parts; V.explore(host, sel);
    }
  } catch (err) { host.innerHTML = `<p class="empty">${e(u("networkErr"))}</p>`; }
};

/* ---------- explorer ---------- */
const GROUPS = ["all", "powertrain", "transmission", "chassis", "electrical", "safety"];
V.group = "all";
V.carSvg = (parts, sel) => `<svg viewBox="0 0 800 340" class="carx" role="group" aria-label="${e(u("fVehicle"))}">
  <defs>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acc)" stop-opacity=".22"/><stop offset="1" stop-color="var(--acc2)" stop-opacity=".08"/></linearGradient>
  </defs>
  <path class="cbody" d="M60 250 L60 200 Q64 172 100 166 L210 152 Q250 104 310 88 L520 84 Q580 88 630 150 L715 166 Q745 172 748 205 L748 250 Z" fill="url(#body)"/>
  <path class="cglass" d="M232 150 Q262 112 312 100 L420 98 L420 150 Z M432 98 L520 98 Q560 102 600 150 L432 150 Z"/>
  <line x1="60" y1="250" x2="748" y2="250" class="cfloor"/>
  <g class="comp">
    <rect x="140" y="140" width="100" height="62" rx="10" class="c-eng"/>
    <rect x="96" y="150" width="20" height="56" rx="4" class="c-rad"/>
    <rect x="244" y="138" width="38" height="26" rx="4" class="c-bat"/>
    <rect x="240" y="196" width="80" height="30" rx="8" class="c-gbx"/>
    <line x1="320" y1="246" x2="600" y2="246" class="c-shaft"/>
    <circle cx="616" cy="248" r="16" class="c-diff"/>
    <path d="M330 250 L470 266 L560 266" class="c-exh"/>
    <rect x="530" y="212" width="74" height="30" rx="8" class="c-fuel"/>
    <path d="M336 104 L356 150" class="c-steer"/><circle cx="332" cy="108" r="12" class="c-steer"/>
  </g>
  <g class="wheels"><circle cx="170" cy="262" r="40" class="tyre"/><circle cx="170" cy="262" r="20" class="disc"/><circle cx="620" cy="262" r="40" class="tyre"/><circle cx="620" cy="262" r="20" class="disc"/></g>
  ${parts.map(p => `<g class="hot ${p.id === sel ? "on" : ""} ${V.group !== "all" && p.group !== V.group ? "dim" : ""}" data-part="${p.id}" tabindex="0" role="button" aria-label="${e(p.name)}" aria-pressed="${p.id === sel}" transform="translate(${p.x},${p.y})"><circle r="15" class="hring"/><circle r="6" class="hdot"/></g>`).join("")}
</svg>`;
V.explore = (host, sel) => {
  const p = V.parts.find(x => x.id === sel) || null;
  host.innerHTML = `<section class="panel rvl"><h2>${e(u("fVehicle"))}</h2><p class="lede">${e(u("explorerLede"))}</p>
  <div class="chips" role="group">${GROUPS.map(g => `<button class="chip ${V.group === g ? "on" : ""}" data-vgroup="${g}">${e(u("grp_" + g))}</button>`).join("")}</div></section>
  <div class="xgrid"><section class="panel xviz rvl">${V.carSvg(V.parts, sel)}</section>
  <section class="panel xinfo rvl" id="xInfo" aria-live="polite">${p ? V.partHtml(p) : `<p class="muted">${e(u("pickPart"))}</p><div class="plist">${V.parts.filter(x => V.group === "all" || x.group === V.group).map(x => `<button class="chip" data-part="${x.id}">${e(x.name)}</button>`).join("")}</div>`}</section></div>`;
  Motion.reveal(host);
  if (p) Motion.pop(host.querySelector(`.hot[data-part="${p.id}"] .hring`));
};
V.partHtml = (p) => {
  const rel = p.related.map(id => V.parts.find(x => x.id === id)).filter(Boolean);
  const row = (k, v) => `<div class="kv"><h4>${e(u(k))}</h4><p>${e(v)}</p></div>`;
  return `<span class="eyebrow">${e(u("grp_" + p.group))}</span><h3 class="xh">${e(p.name)}</h3>
  ${row("pWhat", p.what)}${row("pHow", p.how)}${row("pWhen", p.when)}<div class="kv warn"><h4>${e(u("pFails"))}</h4><p>${e(p.fails)}</p></div>
  ${rel.length ? `<h4 class="lab">${e(u("relatedParts"))}</h4><div class="plist">${rel.map(r => `<button class="chip" data-part="${r.id}">${e(r.name)}</button>`).join("")}</div>` : ""}
  ${p.lessons.length ? `<h4 class="lab">${e(u("relatedLessons"))}</h4><div class="ilist">${p.lessons.map(id => Course.lessonMeta && Course.lessonMeta[id] ? Course.itemRow({ type: "lesson", ...Course.lessonMeta[id] }) : "").join("")}</div>` : ""}`;
};
V.selectPart = (id) => {
  S.param2 = id;
  setHash("vehicle/explore/" + id);
  const host = document.getElementById("vHost");
  if (host && V.parts) {
    Course.loadOutline().catch(() => {}).then(() => V.explore(host, id));
  }
};

/* ---------- warning lights ---------- */
V.sev = "all";
const SEV = ["all", "stop", "soon", "info"];
V.lightsView = (host, sel) => {
  const list = V.lights.filter(w => V.sev === "all" || w.severity === V.sev);
  const w = V.lights.find(x => x.id === sel);
  host.innerHTML = `<section class="panel rvl"><h2>${e(u("fLights"))}</h2><p class="lede">${e(u("lightsLede"))}</p>
  <div class="sevkey"><span class="sv stop">${e(u("sev_stop"))}</span><span class="sv soon">${e(u("sev_soon"))}</span><span class="sv info">${e(u("sev_info"))}</span></div>
  <div class="chips" role="group">${SEV.map(s => `<button class="chip ${V.sev === s ? "on" : ""}" data-vsev="${s}">${e(u("sevf_" + s))}</button>`).join("")}</div></section>
  ${w ? V.lightDetail(w) : ""}
  <div class="lgridw">${list.map(x => `<button class="lcard sev-${x.severity} ${x.id === sel ? "on" : ""}" data-light="${x.id}"><span class="dashico ${x.severity === "stop" ? "blink" : ""}">${Data.SVG[x.sign] || ""}</span><b>${e(x.name)}</b><small class="sv ${x.severity}">${e(u("sev_" + x.severity))}</small></button>`).join("")}</div>`;
  Motion.reveal(host);
  const d = document.getElementById("lightDetail");
  if (d) { d.scrollIntoView({ block: "nearest", behavior: Motion.reduced() ? "auto" : "smooth" }); Motion.rise(d); }
};
V.lightDetail = (w) => `<section class="panel ldetail sev-${w.severity}" id="lightDetail" aria-live="polite">
  <div class="ldh"><span class="dashico big ${w.severity === "stop" ? "blink" : ""}">${Data.SVG[w.sign] || ""}</span><div><span class="sv ${w.severity}">${e(u("sev_" + w.severity))}</span><h3 class="xh">${e(w.name)}</h3></div><a class="iconbtn" href="#vehicle/lights" aria-label="${e(u("close"))}">✕</a></div>
  <div class="lfields">
    <div class="kv"><h4>1 · ${e(u("lMeans"))}</h4><p>${e(w.means)}</p></div>
    <div class="kv"><h4>2 · ${e(u("lWhy"))}</h4><p>${e(w.why)}</p></div>
    <div class="kv ${w.severity === "stop" ? "warn" : ""}"><h4>3 · ${e(u("lDrive"))}</h4><p>${e(w.drive)}</p></div>
    <div class="kv"><h4>4 · ${e(u("lAction"))}</h4><ol class="steps">${w.action.map(a => `<li>${e(a)}</li>`).join("")}</ol></div>
    <div class="kv warn"><h4>5 · ${e(u("lIgnored"))}</h4><p>${e(w.ignored)}</p></div>
    <div class="kv"><h4>6 · ${e(u("lCauses"))}</h4><ul>${w.causes.map(c => `<li>${e(c)}</li>`).join("")}</ul></div>
    <div class="kv"><h4>7 · ${e(u("lPro"))}</h4><p>${e(w.pro)}</p></div>
  </div></section>`;

window.Vehicle = V;
})();
