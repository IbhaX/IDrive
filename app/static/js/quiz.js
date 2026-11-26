/* IDrive quiz.js — sign quiz (server-built sets, instant feedback) and
   Leitner flashcards. Markup mirrors the source app. */
(() => {
"use strict";
const Q = {};

/* ---------- sign quiz ---------- */
Q.view = (app) => {
  const q = S.quiz;
  if (!q || q.stage === "setup") {
    const n = Data.D.filter(d => S.quizCat === "all" || d.cat === S.quizCat).length;
    const cta = Auth.signedIn()
      ? `<button class="btn primary big" data-act="startquiz">${esc(I18n.u("start", { n: Math.min(S.quizLen, n) }))}</button>`
      : `<p class="muted">${esc(I18n.u("testsNeedAcct"))}</p><button class="btn primary big" data-act="signin">${esc(I18n.u("signIn"))}</button>`;
    app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("qTitle"))}</h2><p class="lede">${esc(I18n.u("qLede"))}</p>
    <div><h3 class="lab">${esc(I18n.u("topic"))}</h3><div class="chips">${Learn.chipHtml(S.quizCat, "qcat", true)}</div></div>
    <div><h3 class="lab">${esc(I18n.u("qs"))}</h3><div class="chips">${[10, 20, 30].map(k => `<button class="chip ${S.quizLen === k ? "on" : ""}" data-qlen="${k}">${k}</button>`).join("")}</div></div>
    ${cta}
    ${P.played ? `<p class="muted">${esc(I18n.u("played", { p: P.played, b: P.best }))}</p>` : ""}<div class="row"><button class="btn" data-go="#cards">${esc(I18n.u("flashLink"))}</button></div></section>`;
    return;
  }
  if (q.stage === "done") {
    const pct = Math.round(q.score / q.qs.length * 100);
    app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("done"))}</h2><div><div class="score" id="scoreNum">0<span class="muted" style="font-size:28px"> / ${q.qs.length}</span></div><p class="lede">${esc(pct >= 90 ? I18n.u("great") : pct >= 70 ? I18n.u("good") : I18n.u("keep"))}</p></div>
    ${q.missed.length ? `<div><h3 class="lab">${esc(I18n.u("revise"))}</h3><div class="missed">${q.missed.map(id => { const d = Data.byId[id]; return `<button class="mrow" data-open="${id}" data-solo="1">${Learn.plate(d)}<span><b>${I18n.T(d, "name")}</b><br><span class="muted">${I18n.T(d, "meaning")}</span></span></button>`; }).join("")}</div></div>` : `<p>${esc(I18n.u("nomiss"))}</p>`}
    <div class="row">${q.missed.length ? `<button class="btn primary" data-act="reviseMissed">${esc(I18n.u("reviseCards"))}</button>` : ""}<button class="btn" data-act="startquiz">${esc(I18n.u("again"))}</button><button class="btn" data-act="quizsetup">${esc(I18n.u("chTopic"))}</button></div></section>`;
    Motion.countTo(document.getElementById("scoreNum"), q.score);
    if (pct === 100) Motion.confetti();
    return;
  }
  const it = q.qs[q.i], t = it.target, answered = q.picked !== null;
  const bar = `<div class="qhead"><span>${esc(I18n.u("qn", { i: q.i + 1, n: q.qs.length }))}</span><div class="bar"><i style="width:${Math.round(q.i / q.qs.length * 100)}%"></i></div></div>`;
  let body;
  if (it.type === "s2n") {
    body = `<span class="plate mid">${it.svg || ""}</span><h2 class="qtext">${esc(I18n.u("qmean"))}</h2><div class="opts">${it.o.map((o, j) => {
      const cls = answered ? (j === it.a ? "right" : (j === q.picked ? "wrong" : "")) : "";
      return `<button class="opt ${cls}" data-opt="${j}" ${answered ? "disabled" : ""}><span>${I18n.BP(o)}</span></button>`;
    }).join("")}</div>`;
  } else {
    body = `<h2 class="qtext">${I18n.BP(it.q)}</h2><div class="signopts">${it.o.map((o, j) => {
      const cls = answered ? (j === it.a ? "right" : (j === q.picked ? "wrong" : "")) : "";
      return `<button class="opt ${cls}" data-opt="${j}" aria-label="${I18n.attr(I18n.u("option"))}" ${answered ? "disabled" : ""}>${`<span class="plate">${o.svg}</span>`}${answered ? `<span class="tname">${I18n.BP(o.n)}</span>` : ""}</button>`;
    }).join("")}</div>`;
  }
  const ok = q.picked === it.a;
  const fb = answered ? `<div class="fb ${ok ? "ok" : "no"}"><b>${ok ? esc(I18n.u("right")) : esc(I18n.u("wrong1")) + I18n.T(t, "name") + esc(I18n.u("wrong2"))}</b><span>${I18n.T(t, "meaning")}</span><span class="muted">${I18n.T(t, "action")}</span><button class="btn primary" data-act="qnext">${esc(q.i === q.qs.length - 1 ? I18n.u("seeRes") : I18n.u("nextQ"))}</button></div>` : "";
  app.innerHTML = `<section class="panel">${bar}${body}${fb}</section>`;
};

Q.start = async () => {
  if (!Auth.signedIn()) { Auth.openModal("login"); Motion.toast(I18n.u("testsNeedAcct")); return; }
  try {
    const r = await Api.post("/api/quiz/signs", { cat: S.quizCat, length: S.quizLen });
    if (!r.questions.length) { Motion.toast(I18n.u("nomatch"), "err"); return; }
    S.quiz = { stage: "play", qs: r.questions, i: 0, score: 0, picked: null, missed: [] };
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    if (e.code === "auth_required") { Auth.openModal("login"); Motion.toast(I18n.u("testsNeedAcct")); return; }
    Motion.toast(I18n.u(navigator.onLine === false ? "testsOffline" : "networkErr"), "err");
  }
};

Q.answer = (j) => {
  const q = S.quiz;
  if (!q || q.stage !== "play" || q.picked !== null) return;
  const it = q.qs[q.i];
  const ok = j === it.a;
  q.picked = j;
  const tid = it.target.id;
  if (ok) {
    q.score++;
    setBox(tid, box(tid) + 1);
    delete P.wrong[tid];
  } else {
    q.missed.push(tid);
    P.wrong[tid] = (P.wrong[tid] || 0) + 1;
    setBox(tid, 0);
  }
  save();
  Q.view(document.getElementById("app"));
  const optBtns = document.querySelectorAll(".opt");
  if (ok) Motion.pop(optBtns[it.a]); else Motion.shake(optBtns[j]);
};

Q.next = () => {
  const q = S.quiz;
  q.i++;
  q.picked = null;
  if (q.i >= q.qs.length) {
    q.stage = "done";
    P.played = (P.played || 0) + 1;
    P.best = Math.max(P.best || 0, Math.round(q.score / q.qs.length * 100));
    save();
  }
  render();
  window.scrollTo(0, 0);
};

/* ---------- flashcards (Leitner) ---------- */
Q.buildCards = (ids) => {
  const pool = ids ? ids.map(i => Data.byId[i]).filter(Boolean)
    : Data.D.filter(d => S.cardCat === "all" || d.cat === S.cardCat);
  const order = ids ? pool
    : shuffle(pool).sort((a, b) => box(a.id) - box(b.id)).slice(0, 12);
  S.cards = { q: order.map(d => d.id), i: 0, flip: false, knew: 0, re: {} };
};

Q.cardsView = async (app) => {
  if (!Auth.signedIn()) {
    app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("cTitle"))}</h2><p class="lede">${esc(I18n.u("testsNeedAcct"))}</p><div class="row"><button class="btn primary big" data-act="signin">${esc(I18n.u("signIn"))}</button></div></section>`;
    return;
  }
  if (!S.cards) {
    await Data.ensureSvgs(S.cardCat);
    if (S.view !== "cards") return;
    Q.buildCards();
  }
  const c = S.cards;
  const head = `<section class="panel"><h2>${esc(I18n.u("cTitle"))}</h2><p class="lede">${esc(I18n.u("cLede"))}</p><div class="chips">${Learn.chipHtml(S.cardCat, "ccat", false)}</div><div class="row"><button class="btn" data-go="#quiz">${esc(I18n.u("signQuizLink"))}</button></div></section>`;
  if (c.i >= c.q.length) {
    app.innerHTML = head + `<section class="panel"><h2>${esc(I18n.u("cFin"))}</h2><p class="lede">${esc(I18n.u("cKnew", { n: c.knew }))}</p><div class="row"><button class="btn primary" data-act="newcards">${esc(I18n.u("cAgain"))}</button></div></section>`;
    return;
  }
  const d = Data.byId[c.q[c.i]];
  if (!Data.SVG[d.id]) await Data.ensureSvgIds([d.id]);
  if (S.view !== "cards") return;
  const face = c.flip
    ? `<span class="cat"><i style="background:${Data.catOf(d.cat).dot}"></i>${esc(I18n.cn(Data.catOf(d.cat)))}</span><h2>${I18n.T(d, "name")}</h2><p>${I18n.T(d, "meaning")}</p><div class="do"><b>${esc(I18n.u("do"))}</b>${I18n.T(d, "action")}</div>`
    : `${Learn.plate(d, "mid")}<span class="hint">${esc(I18n.u("hint"))}</span>`;
  app.innerHTML = head + `<div class="qhead"><span>${esc(I18n.u("cardN", { i: c.i + 1, n: c.q.length }))}</span><div class="bar"><i style="width:${Math.round(c.i / c.q.length * 100)}%"></i></div></div>
  <button class="flip" data-act="flip" aria-label="${I18n.attr(I18n.u("showAns"))}">${face}</button>
  <div class="row" style="justify-content:center"><button class="btn" data-act="again" ${c.flip ? "" : "disabled"}>${esc(I18n.u("showAgain"))}</button><button class="btn primary" data-act="got" ${c.flip ? "" : "disabled"}>${esc(I18n.u("knewIt"))}</button></div>`;
  if (c.flip) Motion.pop(app.querySelector(".flip"));
};

Q.cardAgain = () => {
  const c = S.cards;
  const id = c.q[c.i];
  setBox(id, 0);
  if (!c.re[id]) { c.re[id] = 1; c.q.push(id); }
  c.i++;
  c.flip = false;
  Q.cardsView(document.getElementById("app"));
};

Q.cardGot = () => {
  const c = S.cards;
  const id = c.q[c.i];
  setBox(id, box(id) + 1);
  c.knew++;
  c.i++;
  c.flip = false;
  Q.cardsView(document.getElementById("app"));
};

window.Quiz = Q;
})();
