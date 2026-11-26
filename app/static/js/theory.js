/* IDrive theory.js - theory topics, deep articles, glossary.
   Markup mirrors the source app. */
(() => {
"use strict";
const Th = {};

Th.view = (app) => {
  if (S.art === "gloss") { Th.glossView(app); return; }
  if (S.art) { Th.artView(app); return; }
  const proc = ["proc1", "proc2", "proc3", "proc4", "proc5"].map(k => `<li>${esc(I18n.u(k))}</li>`).join("");
  app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("thTitle"))}</h2><p class="lede">${esc(I18n.u("thLede"))}</p></section>
  <details class="primer"><summary>${esc(I18n.u("procTitle"))}</summary><div class="lbody"><ol class="pts">${proc}</ol><p class="muted">${esc(I18n.u("procNote"))}</p></div></details>
  <details class="primer"><summary><span class="dot" style="background:#1b5aa6"></span>${esc(I18n.u("thSigns"))}</summary><div class="lbody"><p>${esc(I18n.u("thSignsNote"))}</p><div class="row"><button class="btn primary" data-go="#learn">${esc(I18n.u("thSignsBtn"))}</button></div></div></details>
  <h3 class="lab">${esc(I18n.u("artLessons"))}</h3>
  <div class="tgrid">${Data.TOP.map(t => `<button class="tcard" data-art="${t.id}"><i style="background:${t.dot}"></i><span><b>${I18n.BPP(t.name)}</b><small>${t.hasArticle ? esc(I18n.u("artRead")) : ""}</small></span></button>`).join("")}
  <button class="tcard" data-art="gloss"><i style="background:#555"></i><span><b>${esc(I18n.u("glTitle"))}</b><small>${Data.glossaryCount} · ${esc(I18n.u("glSub"))}</small></span></button></div>`;
};

Th.artView = async (app) => {
  const t = Data.topicById[S.art];
  if (!t) { S.art = null; render(); return; }
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:22px;width:40%"></i><i style="height:14px"></i><i style="height:14px"></i><i style="height:14px;width:70%"></i></div></section>`;
  let a;
  try { a = await Data.article(S.art); }
  catch (e) { app.innerHTML = `<p class="empty">${esc(I18n.u("networkErr"))}</p>`; return; }
  if (S.art !== t.id || S.view !== "theory") return;
  const li = arr => (arr || []).map(p => `<li>${I18n.BP(p)}</li>`).join("");
  const ids = Data.TOP.filter(x => x.hasArticle).map(x => x.id);
  const i = ids.indexOf(S.art);
  const pv = i > 0 ? Data.topicById[ids[i - 1]] : null;
  const nx = i < ids.length - 1 ? Data.topicById[ids[i + 1]] : null;
  app.innerHTML = `<div class="art"><div class="row"><button class="btn" data-art="">← ${esc(I18n.u("artBack"))}</button></div>
  <section class="panel"><h2><span class="dot" style="background:${t.dot}"></span> ${I18n.BP(t.name)}</h2>${t.lessons && t.lessons.length ? `<ol class="pts">${li(t.lessons)}</ol>` : ""}<p>${I18n.BP(a.intro)}</p></section>
  ${(a.sections || []).map(s => `<section class="panel sec"><h3 class="sh">${I18n.BP(s.h)}</h3>${(s.p || []).map(p => `<p>${I18n.BP(p)}</p>`).join("")}</section>`).join("")}
  ${(a.dos || []).length ? `<div class="dd"><div class="do"><h4>✓ ${esc(I18n.u("artDos"))}</h4><ul>${li(a.dos)}</ul></div><div class="dont"><h4>✗ ${esc(I18n.u("artDonts"))}</h4><ul>${li(a.donts)}</ul></div></div>` : ""}
  ${(a.myths || []).length ? a.myths.map(m => `<div class="myth"><div><span class="tag">${esc(I18n.u("artMyth"))}</span><div class="m">${I18n.BP(m.m)}</div></div><div><span class="tag">${esc(I18n.u("artFact"))}</span><div class="f">${I18n.BP(m.f)}</div></div></div>`).join("") : ""}
  ${(a.stories || []).map(s => `<div class="story"><span class="tag">${esc(I18n.u("artStory"))} · ${esc(I18n.u("artStoryNote"))}</span><b>${I18n.BP(s.t)}</b><p>${I18n.BP(s.s)}</p><div class="les">${esc(I18n.u("artLesson"))}: ${I18n.BP(s.lesson)}</div></div>`).join("")}
  ${(a.recap || []).length ? `<div class="recap"><h3 class="lab">${esc(I18n.u("artRecap"))}</h3><ul>${li(a.recap)}</ul></div>` : ""}
  <p class="muted">${esc(I18n.u("artCheck"))}</p>
  <div class="row"><button class="btn primary" data-etopic="${t.id}">${esc(I18n.u("thPractise"))}</button></div>
  <div class="pn">${pv ? `<button class="btn" data-art="${pv.id}">← ${esc(I18n.u("artPrev"))}: ${I18n.BPP(pv.name)}</button>` : ""}${nx ? `<button class="btn" data-art="${nx.id}">${esc(I18n.u("artNext"))}: ${I18n.BPP(nx.name)} →</button>` : ""}</div></div>`;
};

Th.glossView = async (app) => {
  app.innerHTML = `<section class="panel"><div class="skel"><i style="height:22px;width:30%"></i><i style="height:14px"></i></div></section>`;
  let entries;
  try { entries = await Data.glossary(); }
  catch (e) { app.innerHTML = `<p class="empty">${esc(I18n.u("networkErr"))}</p>`; return; }
  if (S.art !== "gloss") return;
  const list = () => {
    const q = (S.gq || "").trim().toLowerCase();
    const L = entries.filter(g => !q || (g.term.join(" ") + " " + g.definition.join(" ")).toLowerCase().includes(q))
      .sort((a, b) => a.term[0].localeCompare(b.term[0]));
    return L.length
      ? L.map(g => `<div class="g"><b>${I18n.BP(g.term)}</b><div>${I18n.BP(g.definition)}</div></div>`).join("")
      : `<p class="muted">${esc(I18n.u("glNone"))}</p>`;
  };
  app.innerHTML = `<div class="art"><div class="row"><button class="btn" data-art="">← ${esc(I18n.u("artBack"))}</button></div><section class="panel"><h2>${esc(I18n.u("glTitle"))}</h2><p class="lede">${esc(I18n.u("glSub"))} · ${entries.length}</p><input id="gq" class="gsearch" type="search" placeholder="${I18n.attr(I18n.u("glSearch"))}" value="${esc(S.gq || "")}"></section><div class="gl" id="glist">${list()}</div></div>`;
  const inp = document.getElementById("gq");
  if (inp) inp.addEventListener("input", () => {
    S.gq = inp.value;
    document.getElementById("glist").innerHTML = list();
  });
};

window.Theory = Th;
})();
