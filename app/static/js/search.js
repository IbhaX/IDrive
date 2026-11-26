/* iDrive search.js - global search overlay (Ctrl/⌘+K or "/") across
   lessons, theory articles, signs, warning lights, vehicle parts, glossary. */
(() => {
"use strict";
const Q = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => I18n.X(s);   // strings are escaped; [en, ml] pairs render bilingually
let timer = null, lastFocus = null, results = [], active = -1;

Q.open = () => {
  const ov = document.getElementById("searchOv");
  if (!ov) return;
  lastFocus = document.activeElement;
  ov.hidden = false;
  ov.innerHTML = `<div class="sbox" role="dialog" aria-modal="true" aria-label="${I18n.attr(u("searchAll"))}">
    <div class="sin"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="sq" type="search" autocomplete="off" placeholder="${I18n.attr(u("searchPh2"))}" aria-label="${I18n.attr(u("searchAll"))}" aria-controls="sres"><kbd>Esc</kbd></div>
    <div class="sres" id="sres" role="listbox"><p class="muted">${e(u("searchHint"))}</p></div></div>`;
  const inp = document.getElementById("sq");
  inp.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => Q.run(inp.value), 140); });
  inp.addEventListener("keydown", Q.keys);
  inp.focus();
  Motion.pop(ov.querySelector(".sbox"));
};
Q.close = () => {
  const ov = document.getElementById("searchOv");
  if (!ov || ov.hidden) return;
  ov.hidden = true; ov.innerHTML = "";
  if (lastFocus && lastFocus.focus) lastFocus.focus();
};
Q.isOpen = () => { const ov = document.getElementById("searchOv"); return ov && !ov.hidden; };
Q.run = async (q) => {
  const box = document.getElementById("sres");
  if (!box) return;
  if (q.trim().length < 2) { box.innerHTML = `<p class="muted">${e(u("searchHint"))}</p>`; results = []; return; }
  let r, local = false;
  try {
    if (navigator.onLine === false) throw Object.assign(new Error("offline"), { code: "network" });
    r = await Api.get("/api/curriculum/search?q=" + encodeURIComponent(q.trim().slice(0, 80)));
  } catch (err) {
    try { r = { results: await Q.local(q) }; local = true; }
    catch (err2) { box.innerHTML = `<p class="muted">${e(u("networkErr"))}</p>`; return; }
  }
  results = r.results; active = results.length ? 0 : -1;
  box.innerHTML = (local ? `<p class="muted soff">${e(u("searchOffline"))}</p>` : "") + (results.length
    ? results.map((x, i) => `<a class="sr-item k-${x.kind} ${i === active ? "on" : ""}" role="option" aria-selected="${i === active}" href="${e(x.href)}" data-sclose="1"><span class="sk">${e(u("k_" + x.kind))}</span><span><b>${e(x.title)}</b><small>${e(x.group)}</small><em>${e(x.snippet)}</em></span></a>`).join("")
      + `<a class="sr-item ask" href="#ask" data-sclose="1" data-askq="${e(q)}"><span class="sk">AI</span><span><b>${e(u("askAbout", { q }))}</b></span></a>`
    : `<p class="muted">${e(u("nomatch"))}</p><a class="btn" href="#ask" data-sclose="1" data-askq="${e(q)}">${e(u("askAbout", { q }))}</a>`);
};

/* on-device search over the saved index (same scoring as the server) */
const STOP = new Set("a an and are as at be by can do does for from how i if in is it me my of on or should the this to what when where which who why will with you your".split(" "));
const KW = { lesson: 1.3, light: 1.2, part: 1.1, article: 1.0, sign: 0.9, term: 0.8 };
Q.local = async (q, limit = 30) => {
  if (!Q.idx) Q.idx = (await Api.get("/api/curriculum/search-index")).docs;
  const qn = q.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();
  if (qn.length < 2) return [];
  const words = (qn.match(/[a-z0-9\u0d00-\u0d7f]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
  if (!words.length) return [];
  const ml = /[\u0d00-\u0d7f]/.test(qn), out = [];
  for (const d of Q.idx) {
    const title = (ml ? d.title_ml : d.title).toLowerCase(), body = (ml ? d.body_ml : d.body).toLowerCase();
    let score = 0, matched = 0;
    if (qn && title.includes(qn)) score += 10 + (title.startsWith(qn) ? 5 : 0);
    if (body.includes(qn)) score += 4;
    for (const w of words) {
      if (title.includes(w) || body.includes(w)) matched++;
      if (title.includes(w)) score += 3;
      score += Math.min(body.split(w).length - 1, 5) * 0.6;
    }
    if (words.length > 1) score *= 0.4 + 0.6 * matched / words.length;
    if (score <= 0) continue;
    score *= KW[d.kind] || 1;
    const src = ml ? d.body_ml : d.body, at = Math.max(0, src.toLowerCase().indexOf(words[0]));
    const snip = (at > 60 ? "…" : "") + src.slice(Math.max(0, at - 60), at + 120).trim() + "…";
    out.push([score, { kind: d.kind, id: d.id, href: d.href, title: d.title_ml ? [d.title, d.title_ml] : d.title,
      group: d.group_ml ? [d.group, d.group_ml] : d.group, snippet: snip }]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map((x) => x[1]);
};
Q.keys = (ev) => {
  const items = [...document.querySelectorAll("#sres .sr-item")];
  if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
    ev.preventDefault();
    if (!items.length) return;
    active = (active + (ev.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((it, i) => { it.classList.toggle("on", i === active); it.setAttribute("aria-selected", i === active); });
    items[active].scrollIntoView({ block: "nearest" });
  } else if (ev.key === "Enter" && items[active]) {
    ev.preventDefault(); items[active].click();
  } else if (ev.key === "Escape") { Q.close(); }
};

window.Search = Q;
})();
