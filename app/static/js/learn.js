/* IDrive learn.js — Learn view: today card, primer, chips, search, grid,
   detail sheet. Markup mirrors the source app so the original CSS applies. */
(() => {
"use strict";
const L = {};

L.dayIdx = () => {
  const n = new Date();
  return Math.floor((Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) - Date.UTC(n.getFullYear(), 0, 0)) / 864e5);
};

L.haystack = (d) =>
  (d.name + " " + d.meaning + " " + (d.ml || []).join(" ") + " " +
    (Data.catOf(d.cat) || {}).name + " " + ((Data.catOf(d.cat) || {}).ml || [])[0]).toLowerCase();

L.filtered = () => {
  const q = (S.q || "").trim().toLowerCase();
  return Data.D.filter(d => (S.cat === "all" || d.cat === S.cat) && (!q || L.haystack(d).includes(q)));
};

L.plate = (d, c) => `<span class="plate ${c || ""}">${Data.SVG[d.id] || ""}</span>`;
L.known = (d) => box(d.id) >= 3;

L.tile = (d, i) =>
  `<button class="tile rise" style="animation-delay:${Math.min(i * 18, 300)}ms" data-open="${d.id}" aria-label="${esc(I18n.TP(d))}">${L.plate(d)}<span class="tname">${I18n.T(d, "name")}</span>${L.known(d) ? '<i class="tick" aria-hidden="true"></i>' : ""}</button>`;

L.chipHtml = (sel, attr, withCount) =>
  [{ id: "all", name: "Everything", ml: [], dot: "var(--ink)" }, ...Data.CATS]
    .map(c => {
      const n = c.id === "all" ? Data.D.length : c.count;
      return `<button class="chip ${sel === c.id ? "on" : ""}" data-${attr}="${c.id}"><i style="background:${c.dot}"></i>${esc(I18n.cn(c))}${withCount ? ` <small>${n}</small>` : ""}</button>`;
    }).join("");

L.renderGrid = () => {
  const l = L.filtered();
  S.list = l.map(d => d.id);
  const grid = document.getElementById("grid");
  if (!grid) return;
  grid.innerHTML = l.length ? l.map(L.tile).join("") : `<p class="empty" style="grid-column:1/-1">${esc(I18n.u("nomatch"))}</p>`;
  const blurb = document.getElementById("blurb");
  if (blurb) blurb.innerHTML = S.cat === "all"
    ? esc(I18n.u("shown", { n: l.length, t: Data.D.length }))
    : `${I18n.cb(Data.catOf(S.cat))}<span class="en">${esc(I18n.u("shown", { n: l.length, t: Data.D.length }))}</span>`;
  const ch = document.getElementById("chips");
  if (ch) ch.innerHTML = L.chipHtml(S.cat, "cat", true);
};

L.renderGridKeep = () => {
  const g = document.getElementById("grid");
  if (!g) return;
  g.innerHTML = L.filtered().map(L.tile).join("");
};

L.view = (app) => {
  const t = Data.D[L.dayIdx() % Data.D.length];
  const prim = (Data.PRIMER || []).map((svg, i) => `<div class="prow"><span class="plate">${svg}</span><p>${esc(I18n.u("p" + (i + 1)))}</p></div>`);
  app.innerHTML = `
  <section class="heroAnim" id="heroAnim" aria-hidden="true"></section>
  <button class="today" data-open="${t.id}" data-today="1"><span class="plate">${Data.SVG[t.id] || ""}</span><span><span class="eyebrow">${esc(I18n.u("today"))}</span><h2>${I18n.T(t, "name")}</h2><p>${I18n.T(t, "meaning")}</p></span></button>
  <details class="primer"><summary>${esc(I18n.u("primer"))}</summary><div class="rows">${prim.join("")}</div></details>
  <div class="tools"><label class="sr" for="q">${esc(I18n.u("searchLab"))}</label><input id="q" type="search" placeholder="${esc(I18n.u("searchPh", { t: Data.D.length }))}" value="${esc(S.q || "")}" autocomplete="off"><div class="chips" id="chips"></div></div>
  <p class="blurb" id="blurb"></p><div class="grid" id="grid"></div>`;
  L.renderGrid();
  Motion.roadScene(document.getElementById("heroAnim"));
  const qInput = document.getElementById("q");
  if (qInput) qInput.addEventListener("input", () => { S.q = qInput.value; L.renderGrid(); });
};

/* ---------- detail sheet ---------- */
let sList = [], sIdx = 0, lastFocus = null;

L.openSheet = async (id, list) => {
  lastFocus = document.activeElement;
  sList = list && list.length && list.includes(id) ? list : Data.D.map(d => d.id);
  sIdx = sList.indexOf(id);
  if (!Data.SVG[id]) await Data.ensureSvgIds([id]);
  L.renderSheet();
  const sheet = document.getElementById("sheet");
  sheet.hidden = false;
  document.body.style.overflow = "hidden";
  sheet.classList.add("opening");
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.remove("opening")));
  const c = document.getElementById("sClose");
  if (c) c.focus();
};

L.closeSheet = () => {
  const sheet = document.getElementById("sheet");
  sheet.classList.add("closing");
  setTimeout(() => { sheet.hidden = true; sheet.classList.remove("closing"); }, 240);
  document.body.style.overflow = "";
  if (S.view === "learn") L.renderGridKeep();
  if (lastFocus && document.body.contains(lastFocus)) { try { lastFocus.focus(); } catch (e) {} }
};

L.renderSheet = () => {
  const d = Data.byId[sList[sIdx]];
  P.seen[d.id] = 1;
  save();
  const c = Data.catOf(d.cat);
  document.getElementById("sheetCard").innerHTML = `
  <div class="shead"><span class="cat"><i style="background:${c.dot}"></i>${esc(I18n.cn(c))}</span><button class="x" id="sClose" aria-label="${esc(I18n.u("close"))}">✕</button></div>
  ${L.plate(d, "big")}<h2>${I18n.T(d, "name")}</h2><p>${I18n.T(d, "meaning")}</p>
  <div class="do"><b>${esc(I18n.u("do"))}</b>${I18n.T(d, "action")}</div>
  <div class="row"><button class="btn" data-act="sprev" ${sIdx === 0 ? "disabled" : ""}>${esc(I18n.u("prev"))}</button><button class="btn" data-act="snext" ${sIdx === sList.length - 1 ? "disabled" : ""}>${esc(I18n.u("next"))}</button><button class="btn ${L.known(d) ? "" : "primary"}" data-act="slearn">${esc(L.known(d) ? I18n.u("unknow") : I18n.u("know"))}</button></div>
  <p class="muted">${esc(I18n.u("pos", { i: sIdx + 1, n: sList.length }))}</p>`;
  Motion.drawSign(document.querySelector("#sheetCard .plate"));
};

L.sheetNav = (dir) => {
  const ni = sIdx + dir;
  if (ni < 0 || ni >= sList.length) return;
  sIdx = ni;
  L.renderSheet();
  const c = document.getElementById("sClose");
  if (c) c.focus();
};

L.sheetLearn = () => {
  const d = Data.byId[sList[sIdx]];
  setBox(d.id, L.known(d) ? 0 : 4);
  L.renderSheet();
};

L.sheetList = () => sList;
L.sheetIdx = () => sIdx;

window.Learn = L;
})();
