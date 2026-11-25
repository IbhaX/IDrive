/* IDrive i18n.js — bilingual helpers, ported verbatim from the source app.
   Sign Malayalam lives on each sign as d.ml=[name,meaning,action];
   category Malayalam on each category as c.ml=[name,blurb]. */
(() => {
"use strict";
const I = {};
I.esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
I.FI = { name: 0, meaning: 1, action: 2 };

I.lang = () => (["en", "ml", "both"].includes(window.P && P.lang) ? P.lang : "both");

I.u = (k, o) => {
  const pair = Data.UI[k];
  let s = pair ? pair[I.lang() === "ml" ? 1 : 0] : k;
  if (o) for (const x in o) s = s.split("{" + x + "}").join(o[x]);
  return s;
};

/* sign field as HTML: both mode shows Malayalam first, English beneath */
I.T = (d, f) => {
  const en = d[f], ml = (d.ml || [])[I.FI[f]], L = I.lang();
  if (L === "en" || !ml) return I.esc(en);
  if (L === "ml") return I.esc(ml);
  return I.esc(ml) + `<span class="en">${I.esc(en)}</span>`;
};

/* sign name as plain text */
I.TP = (d) => {
  const ml = (d.ml || [])[0], L = I.lang();
  return L === "en" || !ml ? d.name : (L === "ml" ? ml : ml + " / " + d.name);
};

/* category name per language */
I.cn = (c) => {
  const ml = c.id === "all" ? I.u("all") : (c.ml || [])[0];
  const en = c.id === "all" ? (Data.UI.all || ["Everything"])[0] : c.name;
  const L = I.lang();
  if (L === "en") return en;
  if (L === "ml") return ml || en;
  return (ml || en) + " · " + en;
};

/* category blurb */
I.cb = (c) => {
  const m = (c.ml || [])[1], L = I.lang();
  if (L === "en") return I.esc(c.blurb);
  if (L === "ml") return I.esc(m || c.blurb);
  return I.esc(m || "") + `<span class="en">${I.esc(c.blurb)}</span>`;
};

/* bilingual part: [en,ml] | "str" | {svg,n:[en,ml]} -> HTML */
I.BP = (p) => {
  if (typeof p === "string") return I.esc(p);
  if (p && p.svg) return `<span class="optimg"><span class="plate mini">${p.svg}</span><span>${I.BP(p.n)}</span></span>`;
  const L = I.lang();
  return L === "en" ? I.esc(p[0]) : L === "ml" ? I.esc(p[1]) : I.esc(p[1]) + `<span class="en">${I.esc(p[0])}</span>`;
};

/* bilingual part -> plain text */
I.BPP = (p) => {
  if (typeof p === "string") return p;
  if (p && p.svg) return I.BPP(p.n);
  const L = I.lang();
  return L === "en" ? p[0] : L === "ml" ? p[1] : p[1] + " / " + p[0];
};

/* topic/chip helpers */
I.topN = (id) => {
  if (id === "signs") return Data.UI.signsTopic;
  if (id.startsWith("sg:")) { const c = Data.catOf(id.slice(3)); return [c.name, (c.ml || [])[0] || c.name]; }
  return Data.topicById[id].name;
};
I.topDot = (id) => {
  if (id === "signs") return "#1b5aa6";
  if (id.startsWith("sg:")) return Data.catOf(id.slice(3)).dot;
  return Data.topicById[id].dot;
};

window.I18n = I;
window.esc = I.esc;
})();
