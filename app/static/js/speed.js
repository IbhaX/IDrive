/* iDrive speed.js — speed limits by vehicle and road (#limits).
   Data: /api/library/speed-limits (Kerala notification + central maximums),
   labels are [en, ml] pairs. Pick a vehicle and a road to see the limit. */
(() => {
"use strict";
const Sp = { region: "kerala", v: "m1", r: null, data: null };
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);

const sign = (n) => `<svg viewBox="0 0 120 120" class="spsign" role="img" aria-label="${n == null ? I18n.attr(u("spNA")) : n + " km/h"}">
  <circle cx="60" cy="60" r="56" fill="#fff"/><circle cx="60" cy="60" r="50" fill="none" stroke="#d4202c" stroke-width="12"/>
  ${n == null ? `<path d="M34 86L86 34" stroke="#d4202c" stroke-width="10" stroke-linecap="round"/>` : `<text x="60" y="${n >= 100 ? 74 : 76}" text-anchor="middle" class="spnum" font-size="${n >= 100 ? 40 : 46}">${n}</text>`}</svg>`;

Sp.view = async (app) => {
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:260px"></i></div></section>`;
  try { Sp.data = Sp.data || (await Api.get("/api/library/speed-limits")).limits; }
  catch (err) { app.innerHTML = `<p class="empty">${e(u("networkErr"))}</p>`; return; }
  if (S.view !== "limits") return;
  if (S.param === "india" || S.param === "kerala") Sp.region = S.param;
  Sp.render(app);
  Motion.reveal(app);
};

Sp.render = (app) => {
  app = app || document.getElementById("app");
  const R = Sp.data[Sp.region];
  if (!R.vehicles.some(v => v.id === Sp.v)) Sp.v = R.vehicles[0].id;
  if (!R.roads.some(r => r.id === Sp.r)) Sp.r = R.roads[0].id;
  const vi = R.vehicles.findIndex(v => v.id === Sp.v), ri = R.roads.findIndex(r => r.id === Sp.r);
  const veh = R.vehicles[vi], road = R.roads[ri], n = veh.lim[ri];
  const pill = (act, id, on, label) => `<button type="button" class="pill${on ? " on" : ""}" aria-pressed="${on}" data-act="${act}" data-k="${id}">${e(label)}</button>`;
  const seg = ["kerala", "india"].map(k => `<button type="button" role="tab" class="${Sp.region === k ? "on" : ""}" aria-selected="${Sp.region === k}" data-act="spRegion" data-k="${k}">${e(u(k === "kerala" ? "spKerala" : "spIndia"))}</button>`).join("");
  const table = `<div class="sptable" tabindex="0" role="region" aria-label="${I18n.attr(u("spTable"))}"><table>
    <thead><tr><th scope="col">${e(u("spVehicle"))}</th>${R.roads.map((r, j) => `<th scope="col" class="${j === ri ? "cur" : ""}">${e(r.t)}</th>`).join("")}</tr></thead>
    <tbody>${R.vehicles.map((v, i) => `<tr class="${i === vi ? "cur" : ""}"><th scope="row">${e(v.t)}<small>${e(v.sub)}</small></th>${v.lim.map((x, j) => `<td><button type="button" class="spcell${i === vi && j === ri ? " on" : ""}" data-act="spCell" data-k="${v.id}|${R.roads[j].id}" aria-label="${I18n.attr(v.t)} — ${I18n.attr(R.roads[j].t)}: ${x == null ? I18n.attr(u("spNA")) : x + " km/h"}">${x == null ? "—" : x}</button></td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  const notes = ["spN1", "spN2", Sp.region === "kerala" ? "spN3k" : "spN3i", "spN4", "spN5"];
  const refs = R.refs.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><small>${esc(r.publisher)} · ${e(u("spVerified", { d: r.verified }))}</small></li>`).join("");
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tLimits"), "#limits"]])}
  <section class="panel rvl"><h2>${e(u("spTitle"))}</h2><p class="lede">${e(u("spLede"))}</p>
    <div class="seg" role="tablist">${seg}</div></section>
  <div class="spgrid">
    <section class="panel rvl sppick">
      <h3 class="sh">${e(u("spVehicle"))}</h3><div class="pills">${R.vehicles.map(v => pill("spVeh", v.id, v.id === Sp.v, v.t)).join("")}</div>
      <h3 class="sh">${e(u("spRoad"))}</h3><div class="pills">${R.roads.map(r => pill("spRoad", r.id, r.id === Sp.r, r.t)).join("")}</div>
    </section>
    <section class="panel rvl spres" aria-live="polite">${sign(n)}
      <div><span class="eyebrow">${e(u("spMax"))}</span><p class="spbig">${n == null ? e(u("spNA")) : `${n} <small>km/h</small>`}</p>
      <p><b>${e(veh.t)}</b><span class="muted"> · ${e(veh.sub)}</span></p><p class="muted">${e(road.t)}</p></div></section>
  </div>
  <section class="panel rvl"><h3 class="sh">${e(u("spTable"))}</h3>${table}<p class="muted sphint">${e(u("spTapHint"))}</p></section>
  <section class="panel rvl"><h3 class="sh">${e(u("spNotes"))}</h3><ul class="spnotes">${notes.map(k => `<li>${e(u(k))}</li>`).join("")}</ul>
    <h3 class="sh">${e(u("spSources"))}</h3><ul class="sprefs">${refs}</ul></section>`;
};

Sp.act = (act, k) => {
  if (act === "spRegion") Sp.region = k;
  else if (act === "spVeh") Sp.v = k;
  else if (act === "spRoad") Sp.r = k;
  else if (act === "spCell") { const [v, r] = k.split("|"); Sp.v = v; Sp.r = r; }
  const y = window.scrollY;
  Sp.render();
  window.scrollTo(0, y);
  if (act === "spCell" || act === "spVeh" || act === "spRoad") { const res = document.querySelector(".spres"); if (res) Motion.pop(res); }
};

window.SpeedLimits = Sp;
})();
