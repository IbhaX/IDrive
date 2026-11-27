/* IDrive i18n.js - English, Malayalam, Tamil and bilingual helpers.
   Sign Malayalam lives on each sign as d.ml=[name,meaning,action];
   category Malayalam on each category as c.ml=[name,blurb]. */
(() => {
"use strict";
const I = {};
const escP = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
/* In "both" mode a UI string is a Bi: it behaves as the plain text "ml / en"
   (titles, toasts, string ops) but renders as Malayalam with English beneath
   when it goes through esc() or X() into HTML. The span class is unquoted so
   even a stray use inside an attribute cannot break the markup. */
class Bi extends String {
  constructor(en, ml, lang = "ml") { super(ml + " / " + en); this.en = en; this.ml = ml; this.lang = lang; }
}
I.Bi = Bi;
const biHtml = (b) => escP(b.ml) + `<span class=en>${escP(b.en)}</span>`;
I.esc = s => (s instanceof Bi ? biHtml(s) : escP(s));
/* plain text for attributes: one language (Malayalam in ml/both modes) */
I.attr = s => escP(s instanceof Bi ? s.ml : s);
I.FI = { name: 0, meaning: 1, action: 2 };

I.lang = () => (["en", "ml", "ta", "both", "ta-en"].includes(window.P && P.lang) ? P.lang : "both");

const fill = (s, o) => { if (o) for (const x in o) s = s.split("{" + x + "}").join(String(o[x] instanceof Bi ? o[x].ml : o[x])); return s; };
const fillEn = (s, o) => { if (o) for (const x in o) s = s.split("{" + x + "}").join(String(o[x] instanceof Bi ? o[x].en : o[x])); return s; };
I.u = (k, o) => {
  const pair = Data.UI[k], L = I.lang();
  if (!pair) return fill(k, o);
  if ((L === "both" || L === "ta-en") && pair[L === "ta-en" ? 2 : 1] && pair[L === "ta-en" ? 2 : 1] !== pair[0]) return new Bi(fillEn(pair[0], o), fill(pair[L === "ta-en" ? 2 : 1], o), L === "ta-en" ? "ta" : "ml");
  return fill(pair[L === "ml" ? 1 : L === "ta" ? 2 : 0] || pair[0], o);
};

/* sign field as HTML: bilingual modes show selected local language, English beneath */
I.T = (d, f) => {
  const en = d[f], ml = (d.ml || [])[I.FI[f]], ta = (d.ta || [])[I.FI[f]], L = I.lang();
  if (L === "en") return I.esc(en);
  if (L === "ta") return I.esc(ta || en);
  if (L === "ml") return I.esc(ml || en);
  return I.esc(L === "ta-en" ? (ta || en) : (ml || en)) + `<span class="en">${I.esc(en)}</span>`;
};

/* sign name as plain text */
I.TP = (d) => {
  const ml = (d.ml || [])[0], ta = (d.ta || [])[0], L = I.lang();
  return L === "en" ? d.name : L === "ta" ? (ta || d.name) : (L === "ml" ? (ml || d.name) : (ml || d.name) + " / " + d.name);
};

/* category name per language */
I.cn = (c) => {
  const ml = c.id === "all" ? (Data.UI.all || [])[1] : (c.ml || [])[0];
  const ta = c.id === "all" ? (Data.UI.all || [])[2] : (c.ta || [])[0];
  const en = c.id === "all" ? (Data.UI.all || ["Everything"])[0] : c.name;
  const L = I.lang();
  if (L === "en") return en;
  if (L === "ta") return ta || en;
  if (L === "ml") return ml || en;
  return L === "ta-en" ? (ta || en) + " · " + en : (ml || en) + " · " + en;
};

/* category blurb */
I.cb = (c) => {
  const m = (c.ml || [])[1], ta = (c.ta || [])[1], L = I.lang();
  if (L === "en") return I.esc(c.blurb);
  if (L === "ta") return I.esc(ta || c.blurb);
  if (L === "ml") return I.esc(m || c.blurb);
  return I.esc(L === "ta-en" ? (ta || "") : (m || "")) + `<span class="en">${I.esc(c.blurb)}</span>`;
};

/* bilingual part: [en,ml,ta] | "str" | {svg,n:[en,ml,ta]} -> HTML */
I.BP = (p) => {
  if (p instanceof Bi) return biHtml(p);
  if (typeof p === "string") return I.esc(p);
  if (p && p.svg) return `<span class="optimg"><span class="plate mini">${p.svg}</span><span>${I.BP(p.n)}</span></span>`;
  const L = I.lang();
  return L === "en" ? I.esc(p[0]) : L === "ta" ? I.esc(p[2] || p[0]) : L === "ml" ? I.esc(p[1]) : I.esc(L === "ta-en" ? (p[2] || p[0]) : p[1]) + `<span class="en">${I.esc(p[0])}</span>`;
};

/* bilingual part -> plain text */
I.BPP = (p) => {
  if (p instanceof Bi) return String(p);
  if (typeof p === "string") return p;
  if (p && p.svg) return I.BPP(p.n);
  const L = I.lang();
  return L === "en" ? p[0] : L === "ta" ? (p[2] || p[0]) : L === "ml" ? p[1] : (L === "ta-en" ? (p[2] || p[0]) : p[1]) + " / " + p[0];
};

/* bilingual part -> one language only (crumbs, attributes) */
I.one = (p) => {
  if (p == null) return "";
  if (p instanceof Bi) return p.ml;
  if (typeof p === "string") return p;
  if (p && p.svg) return I.one(p.n);
  return I.lang() === "en" ? p[0] : ["ta", "ta-en"].includes(I.lang()) ? (p[2] || p[0]) : (p[1] || p[0]);
};
/* HTML for a value that may be a plain string or an [en, ml] pair */
I.X = (p) => (p == null ? "" : (Array.isArray(p) || p instanceof Bi ? I.BP(p) : I.esc(p)));

/* topic/chip helpers */
I.topN = (id) => {
  if (id === "signs") return Data.UI.signsTopic;
  if (id.startsWith("sg:")) { const c = Data.catOf(id.slice(3)); return [c.name, (c.ml || [])[0] || c.name, (c.ta || [])[0] || c.name]; }
  const n = Data.topicById[id].name; return Array.isArray(n) ? n : [n, n, Data.topicById[id].ta_name || n];
};
I.topDot = (id) => {
  if (id === "signs") return "#1b5aa6";
  if (id.startsWith("sg:")) return Data.catOf(id.slice(3)).dot;
  return Data.topicById[id].dot;
};

window.I18n = I;
window.esc = I.esc;
})();
