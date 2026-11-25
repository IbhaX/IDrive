/* IDrive exam.js — mock exam (server-built paper + server scoring) and
   per-topic practice. Markup mirrors the source app. */
(() => {
"use strict";
const E = {};
const LET = "ABCD";
let tmr = null;

E.stopTimer = () => { if (tmr) { clearInterval(tmr); tmr = null; } };
E.startTimer = () => {
  E.stopTimer();
  const ex = S.exam;
  if (!ex || ex.mode !== "mock" || ex.stage !== "play") return;
  tmr = setInterval(() => {
    const left = Math.max(0, Math.ceil((ex.deadline - Date.now()) / 1000));
    const el = document.getElementById("tleft"), b = document.getElementById("tbar");
    if (el) el.textContent = left;
    if (b) {
      b.style.width = (left / 30 * 100) + "%";
      b.classList.toggle("warn", left <= 10 && left > 5);
      b.classList.toggle("danger", left <= 5);
    }
    if (left <= 0) E.advance();
  }, 250);
};

E.optHtml = (q, ex) => {
  const a = ex.ans[ex.i];
  const reveal = ex.mode === "practice" && ex.shown;
  const btn = (o, j) => {
    let cls = "";
    if (reveal) cls = j === q.a ? "right" : (j === a ? "wrong" : "");
    else if (a === j) cls = "sel";
    return `<button class="opt ${cls}" data-ans="${j}" ${reveal ? "disabled" : ""}><b class="lt">${LET[j]}</b>${q.io ? `<span class="plate">${o.svg}</span>${reveal ? `<span class="tname">${I18n.BP(o.n)}</span>` : ""}` : `<span>${I18n.BP(o)}</span>`}</button>`;
  };
  return `<div class="${q.io ? "signopts" : "opts"}">${q.o.map(btn).join("")}</div>`;
};

E.view = (app) => {
  const ex = S.exam;
  if (!ex || ex.stage === "menu") {
    E.stopTimer();
    const chips = [{ id: "signs" }, ...Data.CATS.map(c => ({ id: "sg:" + c.id })), ...Data.TOP]
      .map(t => {
        const n = t.id === "signs" ? Math.min(15, Data.D.length)
          : t.id.startsWith("sg:") ? Math.min(15, (Data.catOf(t.id.slice(3)) || { count: 0 }).count)
          : (Data.questionCounts[t.id] || 0);
        return `<button class="chip" data-etopic="${t.id}"><i style="background:${I18n.topDot(t.id)}"></i>${esc(I18n.BPP(I18n.topN(t.id)))} <small>${n}</small></button>`;
      }).join("");
    app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("exTitle"))}</h2><p class="lede">${esc(I18n.u("exLede"))}</p></section>
    <section class="panel"><h3 class="lab">${esc(I18n.u("mockTitle"))}</h3><p>${esc(I18n.u("mockInfo"))}</p><div class="row"><button class="btn primary big" data-act="startmock">${esc(I18n.u("mockStart"))}</button></div>${P.mock.taken ? `<p class="muted">${esc(I18n.u("mTaken"))}: ${P.mock.taken} · ${esc(I18n.u("mPassed"))}: ${P.mock.passed} · ${esc(I18n.u("mBest"))}: ${P.mock.best}/30</p>` : ""}<p class="muted">${esc(I18n.u("procNote"))}</p></section>
    <section class="panel"><h3 class="lab">${esc(I18n.u("topicPr"))}</h3><p class="muted">${esc(I18n.u("topicPrNote"))}</p><div class="chips">${chips}</div></section>`;
    return;
  }
  if (ex.stage === "done") { E.doneView(app); return; }
  if (ex.mode === "mock" && ex.pausedLeft != null) {
    ex.deadline = Date.now() + ex.pausedLeft;
    ex.pausedLeft = null;
  }
  const q = ex.qs[ex.i], n = ex.qs.length, a = ex.ans[ex.i];
  const reveal = ex.mode === "practice" && ex.shown;
  const left = ex.mode === "mock" ? Math.max(0, Math.ceil((ex.deadline - Date.now()) / 1000)) : 0;
  const head = `<div class="qhead"><span>${esc(I18n.u("qn", { i: ex.i + 1, n }))}</span><div class="bar"><i style="width:${Math.round(ex.i / n * 100)}%"></i></div><button class="btn small" data-act="equit">${esc(I18n.u("quit"))}</button></div>` +
    (ex.mode === "mock" ? `<div class="timer"><span>${esc(I18n.u("tleft"))}: <b id="tleft">${left}</b></span><div class="bar"><i id="tbar" style="width:${left / 30 * 100}%"></i></div></div>` : "");
  const tag = `<span class="cat"><i style="background:${I18n.topDot(q.t)}"></i>${esc(I18n.BPP(I18n.topN(q.t)))}</span>`;
  const fb = reveal ? `<div class="fb ${a === q.a ? "ok" : "no"}"><b>${esc(a === q.a ? I18n.u("right") : I18n.u("corrAns"))}${a === q.a ? "" : ": "}${a === q.a ? "" : I18n.BP(q.o[q.a])}</b><span>${I18n.BP(q.r)}</span></div>` : "";
  const nextBtn = (ex.mode === "mock" || reveal)
    ? `<button class="btn primary" data-act="enext">${esc(ex.i === n - 1 ? I18n.u("fin") : I18n.u("next"))}</button>` : "";
  app.innerHTML = `<section class="panel">${head}${tag}${q.svg ? `<span class="plate mid">${q.svg}</span>` : ""}<h2 class="qq">${I18n.BP(q.q)}</h2>${E.optHtml(q, ex)}${fb}<div class="row">${nextBtn}</div></section>`;
  E.startTimer();
};

E.doneView = (app) => {
  E.stopTimer();
  const ex = S.exam;
  const n = ex.qs.length, c = ex.score;
  const pass = ex.mode === "mock" ? c >= 18 : null;
  const wrongIdx = ex.qs.map((q, i) => i).filter(i => ex.ans[i] !== ex.qs[i].a);
  const show = ex.rv === "wrong" ? wrongIdx : ex.qs.map((q, i) => i);
  app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("done"))}</h2><div><div class="score" id="scoreNum">0<span class="muted" style="font-size:28px"> / ${n}</span></div>
    ${pass === null ? `<p class="lede">${esc(I18n.u("scoreLine", { c, n }))}</p>` : `<p class="verdict ${pass ? "ok" : "no"}">${esc(pass ? I18n.u("passed") : I18n.u("failed"))}</p><p class="muted">${esc(I18n.u("passNote"))}</p>${ex.late ? `<p class="muted">${esc(I18n.u("skipped"))}</p>` : ""}`}</div>
    <div class="row"><button class="btn primary" data-act="ebackmenu">${esc(I18n.u("backMenu"))}</button>${ex.mode === "mock" ? `<button class="btn" data-act="startmock">${esc(I18n.u("mockStart"))}</button>` : `<button class="btn" data-etopic="${ex.topic}">${esc(I18n.u("again"))}</button>`}</div></section>
  <div class="chips"><button class="chip ${ex.rv === "all" ? "on" : ""}" data-act="rvall">${esc(I18n.u("rvAll"))}</button><button class="chip ${ex.rv === "wrong" ? "on" : ""}" data-act="rvwrong">${esc(I18n.u("rvWrong"))} <small>${wrongIdx.length}</small></button></div>
  ${show.length ? show.map(i => {
    const q = ex.qs[i], a = ex.ans[i], ok = a === q.a;
    return `<details class="rv ${ok ? "ok" : "no"}"><summary><span class="mk">${ok ? "✓" : "✗"}</span><span class="rq">${i + 1}. ${I18n.BP(q.q)}</span></summary><div class="rvb">${q.svg ? `<span class="plate mid">${q.svg}</span>` : ""}
    <p><b>${esc(I18n.u("yourAns"))}:</b> ${a == null ? esc(I18n.u("skipped")) : I18n.BP(q.o[a])}</p><p><b>${esc(I18n.u("corrAns"))}:</b> ${I18n.BP(q.o[q.a])}</p><div class="do"><b>${esc(I18n.u("why"))}</b>${I18n.BP(q.r)}</div></div></details>`;
  }).join("") : `<p class="empty">${esc(I18n.u("allRight"))}</p>`}`;
  Motion.countTo(document.getElementById("scoreNum"), c);
  if (pass === true) Motion.confetti();
};

/* ---------- flows ---------- */
E.startMock = async () => {
  try {
    const r = await Api.post("/api/exam/mock", {});
    S.exam = {
      mode: "mock", examId: r.exam_id, qs: r.questions, i: 0, ans: [],
      stage: "play", deadline: Date.now() + r.seconds_per_question * 1000,
      serverDeadline: new Date(r.deadline_at).getTime(), perQ: r.seconds_per_question,
      pausedLeft: null, rv: "all", score: 0, late: false,
    };
    if (S.view !== "exam") { S.view = "exam"; setHash("exam"); }
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    Motion.toast(I18n.u("networkErr"), "err");
  }
};

E.startPractice = async (t) => {
  try {
    const r = await Api.post("/api/exam/practice", { topic: t });
    if (!r.questions.length) { Motion.toast(I18n.u("nothing"), "err"); return; }
    S.exam = { mode: "practice", topic: t, qs: r.questions, i: 0, ans: [], stage: "play", shown: false, rv: "all", score: 0 };
    if (S.view !== "exam") { S.view = "exam"; setHash("exam"); }
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    Motion.toast(I18n.u("networkErr"), "err");
  }
};

E.select = (j) => {
  const ex = S.exam, q = ex.qs[ex.i];
  if (ex.mode === "practice") {
    if (ex.shown) return;
    ex.ans[ex.i] = j;
    ex.shown = true;
  } else {
    ex.ans[ex.i] = j;
  }
  E.view(document.getElementById("app"));
  if (ex.mode === "practice") {
    const opts = document.querySelectorAll(".opt");
    if (j === q.a) Motion.pop(opts[j]); else Motion.shake(opts[j]);
  } else {
    const opt = document.querySelectorAll(".opt")[j];
    if (opt) Motion.pop(opt);
  }
};

E.advance = () => {
  const ex = S.exam;
  ex.i++;
  ex.shown = false;
  if (ex.i >= ex.qs.length) { E.finish(); return; }
  if (ex.mode === "mock") ex.deadline = Date.now() + ex.perQ * 1000;
  E.view(document.getElementById("app"));
  window.scrollTo(0, 0);
};

E.finish = async () => {
  const ex = S.exam;
  E.stopTimer();
  if (ex.mode === "mock") {
    ex.stage = "scoring";
    try {
      const r = await Api.post("/api/exam/" + encodeURIComponent(ex.examId) + "/submit", { answers: ex.ans.map(a => a === undefined ? null : a) });
      ex.score = r.score;
      ex.late = r.late;
      // server review becomes the question list (now with a/r)
      ex.qs = r.review.map(rv => ({ id: rv.id, t: rv.t, q: rv.q, o: rv.o, a: rv.a, r: rv.r, svg: rv.svg, io: rv.io }));
      ex.ans = r.review.map(rv => rv.picked);
      P.mock.taken++;
      if (r.passed) P.mock.passed++;
      P.mock.best = Math.max(P.mock.best || 0, r.score);
      for (const rv of r.review) {
        const s = P.tq[rv.t] || (P.tq[rv.t] = [0, 0]);
        s[1]++;
        if (rv.correct) s[0]++;
        if (rv.t === "signs" && !rv.correct && rv.id.startsWith("sg_")) {
          const sid = rv.id.split("_").slice(2).join("_");
          P.wrong[sid] = (P.wrong[sid] || 0) + 1;
          setBox(sid, 0);
        }
      }
      save();
    } catch (e) {
      ex.stage = "play";
      Motion.toast(I18n.u("networkErr"), "err");
      E.view(document.getElementById("app"));
      return;
    }
  } else {
    // practice: score + fold into per-topic stats like the source
    let c = 0;
    ex.qs.forEach((q, i) => {
      const ok = ex.ans[i] === q.a;
      if (ok) c++;
      const s = P.tq[q.t] || (P.tq[q.t] = [0, 0]);
      s[1]++;
      if (ok) s[0]++;
      if (q.t === "signs" && !ok && q.id && q.id.startsWith("sg_")) {
        const sid = q.id.split("_").slice(2).join("_");
        P.wrong[sid] = (P.wrong[sid] || 0) + 1;
        setBox(sid, 0);
      }
    });
    ex.score = c;
    save();
  }
  ex.stage = "done";
  render();
  window.scrollTo(0, 0);
};

E.quit = () => {
  E.stopTimer();
  S.exam = null;
  E.view(document.getElementById("app"));
};

window.Exam = E;
})();
