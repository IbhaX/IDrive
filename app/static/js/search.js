/* iDrive search.js — global search overlay (Ctrl/⌘+K or "/") across
   lessons, theory articles, signs, warning lights, vehicle parts, glossary. */
(() => {
"use strict";
const Q = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => esc(s == null ? "" : s);
let timer = null, lastFocus = null, results = [], active = -1;

Q.open = () => {
  const ov = document.getElementById("searchOv");
  if (!ov) return;
  lastFocus = document.activeElement;
  ov.hidden = false;
  ov.innerHTML = `<div class="sbox" role="dialog" aria-modal="true" aria-label="${e(u("searchAll"))}">
    <div class="sin"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
    <input id="sq" type="search" autocomplete="off" placeholder="${e(u("searchPh2"))}" aria-label="${e(u("searchAll"))}" aria-controls="sres"><kbd>Esc</kbd></div>
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
  let r;
  try { r = await Api.get("/api/curriculum/search?q=" + encodeURIComponent(q.trim().slice(0, 80))); }
  catch (err) { box.innerHTML = `<p class="muted">${e(u("networkErr"))}</p>`; return; }
  results = r.results; active = results.length ? 0 : -1;
  box.innerHTML = results.length
    ? results.map((x, i) => `<a class="sr-item k-${x.kind} ${i === active ? "on" : ""}" role="option" aria-selected="${i === active}" href="${e(x.href)}" data-sclose="1"><span class="sk">${e(u("k_" + x.kind))}</span><span><b>${e(x.title)}</b><small>${e(x.group)}</small><em>${e(x.snippet)}</em></span></a>`).join("")
      + `<a class="sr-item ask" href="#ask" data-sclose="1" data-askq="${e(q)}"><span class="sk">AI</span><span><b>${e(u("askAbout", { q }))}</b></span></a>`
    : `<p class="muted">${e(u("nomatch"))}</p><a class="btn" href="#ask" data-sclose="1" data-askq="${e(q)}">${e(u("askAbout", { q }))}</a>`;
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
