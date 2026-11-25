/* iDrive instructor.js — AI driving instructor chat (grounded, cited) with a
   search-only fallback for guests and keyless deployments. */
(() => {
"use strict";
const A = {};
const u = (k, o) => I18n.u(k, o);
const e = (s) => esc(s == null ? "" : s);

A.log = [];        // {role, content, sources?, mode?}
A.busy = false;
A.cfg = null;

/* minimal, safe markdown: escape first, then bold, lists, paragraphs, [n] citations */
A.md = (text, sources) => {
  const lines = e(text).split(/\n/);
  let html = "", list = null;
  const inline = (s) => s
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\[(\d{1,2})\]/g, (m, n) => {
      const src = (sources || []).find(x => x.n === +n);
      return src ? `<a class="cite" href="${e(src.href)}" title="${e(src.title)}">${n}</a>` : m;
    });
  for (const ln of lines) {
    const li = ln.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (li) { if (!list) { list = /^\s*\d/.test(ln) ? "ol" : "ul"; html += `<${list}>`; } html += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { html += `</${list}>`; list = null; }
    if (ln.trim()) html += `<p>${inline(ln)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
};

A.view = async (app) => {
  if (!A.cfg) { try { A.cfg = await Api.get("/api/instructor/config"); } catch (err) { A.cfg = { ai: false, signedIn: false }; } }
  if (S.view !== "ask") return;
  const signed = Auth.signedIn();
  const mode = A.cfg.ai && signed ? "ai" : "search";
  const sugg = ["askS1", "askS2", "askS3", "askS4", "askS5"];
  app.innerHTML = `${Course.crumbs([[u("home"), "#home"], [u("tAsk"), "#ask"]])}
  <section class="panel askhead rvl"><span class="fi">${Course.icon("brain")}</span><div><h2>${e(u("askTitle"))}</h2><p class="lede">${e(u(mode === "ai" ? "askLedeAi" : "askLedeSearch"))}</p>
  ${mode === "search" ? `<p class="muted">${A.cfg.ai ? `<button class="btn small" data-act="signin">${e(u("signIn"))}</button> ${e(u("askSignin"))}` : e(u("askDisabled"))}</p>` : ""}</div></section>
  <section class="panel chat"><div class="chatlog" id="chatLog" aria-live="polite">${A.log.length ? A.log.map(A.msgHtml).join("") : `<div class="sugg">${sugg.map(k => `<button class="chip" data-ask="${e(u(k))}">${e(u(k))}</button>`).join("")}</div>`}</div>
  <form class="chatin" id="chatForm"><label class="sr" for="chatQ">${e(u("askPlaceholder"))}</label><textarea id="chatQ" rows="2" maxlength="600" placeholder="${e(u("askPlaceholder"))}"></textarea><button class="btn primary" type="submit" ${A.busy ? "disabled" : ""}>${e(u("send"))}</button></form>
  <p class="muted fine">${e(u("askSafety"))}</p></section>`;
  const f = document.getElementById("chatForm"), q = document.getElementById("chatQ");
  f.addEventListener("submit", (ev) => { ev.preventDefault(); A.send(q.value); });
  q.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); A.send(q.value); } });
  A.scroll();
};
A.msgHtml = (m) => {
  if (m.role === "user") return `<div class="msg me"><p>${e(m.content)}</p></div>`;
  if (m.pending) return `<div class="msg bot"><div class="typing"><i></i><i></i><i></i></div></div>`;
  if (m.error) return `<div class="msg bot err"><p>${e(m.content)}</p></div>`;
  const srcs = (m.sources || []);
  const body = m.mode === "ai" ? A.md(m.content, srcs) : `<p>${e(u(srcs.length ? "askFound" : "askNothing"))}</p>`;
  const shown = m.mode === "ai" ? srcs.filter(s => s.cited).concat(srcs.filter(s => !s.cited).slice(0, 2)) : srcs;
  return `<div class="msg bot">${body}${shown.length ? `<div class="srcs"><h4 class="lab">${e(u("sources"))}</h4>${shown.map(s => `<a class="src" href="${e(s.href)}"><span class="sn">${s.n}</span><span><b>${e(s.title)}</b><small>${e(s.group)}</small>${m.mode === "search" ? `<em>${e(s.snippet)}</em>` : ""}</span></a>`).join("")}</div>` : ""}</div>`;
};
A.scroll = () => { const l = document.getElementById("chatLog"); if (l) l.scrollTop = l.scrollHeight; };
A.redraw = () => { const l = document.getElementById("chatLog"); if (l) { l.innerHTML = A.log.map(A.msgHtml).join(""); A.scroll(); } };
A.send = async (text) => {
  const q = (text || "").trim();
  if (q.length < 2 || A.busy) return;
  const inp = document.getElementById("chatQ"); if (inp) inp.value = "";
  const history = A.log.filter(m => !m.pending && !m.error && m.content).slice(-6).map(m => ({ role: m.role, content: m.content.slice(0, 1200) }));
  A.log.push({ role: "user", content: q }, { role: "assistant", pending: true });
  A.busy = true; A.redraw();
  try {
    const r = await Api.post("/api/instructor/ask", { question: q, history });
    A.log[A.log.length - 1] = { role: "assistant", content: r.answer || "", mode: r.mode, sources: r.sources };
  } catch (err) {
    A.log[A.log.length - 1] = { role: "assistant", error: true, content: u(err.status === 429 ? "tooMany" : "networkErr") };
  }
  A.busy = false;
  if (S.view === "ask") { A.redraw(); const b = document.querySelector("#chatForm button"); if (b) b.disabled = false; }
};

window.Instructor = A;
})();
