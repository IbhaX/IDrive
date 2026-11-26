/* IDrive progress.js - dashboard: learned/viewed stats, per-category bars,
   hardest signs, exam stats, reset. Markup mirrors the source app. */
(() => {
"use strict";
const Pr = {};

Pr.view = async (app) => {
  const total = Data.D.length;
  const k = Data.D.filter(Learn.known).length;
  const s = Data.D.filter(d => P.seen[d.id]).length;
  const weak = Data.D.filter(d => P.wrong[d.id]).sort((a, b) => P.wrong[b.id] - P.wrong[a.id]).slice(0, 8);
  await Data.ensureSvgIds(weak.map(d => d.id));
  try { await Course.loadOutline(); } catch (e) {}
  if (S.view !== "progress") return;

  app.innerHTML = `${Pr.dashboard()}<section class="panel"><h2>${esc(I18n.u("pSigns"))}</h2><div class="stat"><div><b id="pvK">0</b><span class="muted">${esc(I18n.u("pLearned", { t: total }))}</span></div><div><b id="pvS">0</b><span class="muted">${esc(I18n.u("pViewed"))}</span></div><div><b id="pvB">0%</b><span class="muted">${esc(I18n.u("pBest"))}</span></div></div>
  <p class="muted">${esc(I18n.u("pNote"))}</p>
  ${Auth.signedIn()
    ? `<p class="muted">☁ ${esc(I18n.u("synced"))}</p>`
    : `<p class="muted"><button class="btn small" data-act="signin">${esc(I18n.u("signIn"))}</button> ${esc(I18n.u("authNote"))}</p>`}</section>
  <section class="panel"><h3 class="lab">${esc(I18n.u("byTopic"))}</h3>${Data.CATS.map(c => {
    const l = Data.D.filter(d => d.cat === c.id);
    const kk = l.filter(Learn.known).length;
    const ss = l.filter(d => P.seen[d.id]).length;
    return `<div class="crow"><span>${esc(I18n.cn(c))}</span><div class="bar"><i class="seen" style="width:${Math.round(ss / l.length * 100)}%"></i><i class="known" style="width:${Math.round(kk / l.length * 100)}%;background:${c.dot}"></i></div><span class="num">${kk}/${l.length}</span></div>`;
  }).join("")}
  <p class="muted">${esc(I18n.u("legend"))}</p></section>
  <section class="panel"><h3 class="lab">${esc(I18n.u("hardest"))}</h3>${weak.length ? `<div class="missed">${weak.map(d => `<button class="mrow" data-open="${d.id}" data-solo="1">${Learn.plate(d)}<span><b>${I18n.T(d, "name")}</b><br><span class="muted">${esc(I18n.u("missedN", { n: P.wrong[d.id] }))}</span></span></button>`).join("")}</div><div class="row"><button class="btn primary" data-act="reviseWeak">${esc(I18n.u("reviseWeak"))}</button></div>` : `<p class="muted">${esc(I18n.u("nothing"))}</p>`}</section>
  ${Pr.examProgress()}
  <section class="panel"><h3 class="lab">${esc(I18n.u("reset"))}</h3><div id="resetbox"><button class="btn" data-act="reset1">${esc(I18n.u("resetBtn"))}</button></div></section>
  ${Auth.signedIn() ? `<section class="panel"><h3 class="lab">${esc(I18n.u("delAcct"))}</h3><p class="muted">${esc(I18n.u("delAcctNote"))} <a href="/privacy">${esc(I18n.u("ftPrivacy"))}</a></p><div id="delbox"><button class="btn danger" data-act="del1">${esc(I18n.u("delAcct"))}</button></div></section>` : ""}`;

  Motion.rings(app);
  Motion.reveal(app);
  Motion.countTo(document.getElementById("pvK"), k);
  Motion.countTo(document.getElementById("pvS"), s);
  Motion.countTo(document.getElementById("pvB"), P.best || 0, "%");
};

/* learning dashboard: curriculum progress, level, streak, readiness,
   strengths/weaknesses, bookmarks, recommendations, achievements */
Pr.readiness = () => {
  const o = Course.outline;
  const lesPct = o && o.lessonOrder.length ? o.lessonOrder.filter(Course.done).length / o.lessonOrder.length : 0;
  const mock = ((P.mock || {}).best || 0) / 30;
  const hzN = Object.keys(P.hz || {}).length ? Object.values(P.hz).filter(v => v > 0).length / 6 : 0;
  const signs = Data.D.length ? Data.D.filter(Learn.known).length / Data.D.length : 0;
  return Math.round(100 * (lesPct * .35 + mock * .35 + Math.min(1, hzN) * .1 + signs * .2));
};
Pr.achievements = () => {
  const o = Course.outline || { lessonOrder: [], modules: [] };
  const done = o.lessonOrder.filter(Course.done).length;
  const modDone = o.modules.filter(m => { const st = Course.moduleStats(m); return st.total && st.done === st.total; }).length;
  const hz = Object.values(P.hz || {});
  return [
    ["achFirst", done >= 1],
    ["achFive", done >= 5],
    ["achModule", modDone >= 1],
    ["achHalf", o.lessonOrder.length && done >= o.lessonOrder.length / 2],
    ["achStreak3", Course.streak() >= 3],
    ["achStreak7", Course.streak() >= 7],
    ["achMock", ((P.mock || {}).passed || 0) >= 1],
    ["achHazard", hz.some(v => v >= 2)],
    ["achSigns", Data.D.filter(Learn.known).length >= 50],
    ["achReflex", ((P.lab || {}).rt || 9999) < 300],
  ];
};
Pr.dashboard = () => {
  const o = Course.outline;
  if (!o) return "";
  const u = (k, x) => esc(I18n.u(k, x));
  const done = o.lessonOrder.filter(Course.done).length, total = o.lessonOrder.length;
  const pct = total ? Math.round(done / total * 100) : 0;
  const lv = Course.level(), rd = Pr.readiness();
  const mods = o.modules.map(m => ({ m, st: Course.moduleStats(m), avg: (() => { const sc = Course.moduleStats(m).ids.map(Course.score).filter(Boolean); return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null; })() }));
  const scored = mods.filter(x => x.avg !== null).sort((a, b) => b.avg - a.avg);
  const strong = scored.slice(0, 3), weak = scored.slice(-3).reverse().filter(x => x.avg < 100);
  const bms = Object.keys(P.bm || {}).filter(id => P.bm[id] > 0 && Course.lessonMeta[id]).sort((a, b) => P.bm[b] - P.bm[a]);
  const pending = o.lessonOrder.filter(id => !Course.done(id)).slice(0, 4);
  const rq = Object.keys(P.rq || {}).length;
  const mins = Math.round((P.secs || 0) / 60);
  const ach = Pr.achievements();
  const row = (id) => Course.itemRow({ type: "lesson", ...Course.lessonMeta[id] });
  return `<section class="panel dash rvl"><h2>${u("pTitle")}</h2>
  <div class="dashtop">
    <div class="dring">${Course.ring(pct, "var(--acc2)", 120)}<div class="dlab"><b>${pct}%</b><span>${u("curriculumDone")}</span></div></div>
    <div class="dstats">
      <div><b>${done}/${total}</b><span>${u("lessonsDone")}</span></div>
      <div><b>${Course.streak()}</b><span>${u("dayStreak")}</span></div>
      <div><b>${mins}</b><span>${u("minutesLearning")}</span></div>
      <div><b>${rd}%</b><span>${u("examReady")}</span></div>
    </div>
  </div>
  <div class="levels">${Course.LEVELS.map((k, i) => `<span class="lvl ${i <= lv ? "on" : ""} ${i === lv ? "cur" : ""}">${u(k)}</span>`).join('<i aria-hidden="true">→</i>')}</div>
  <p class="muted">${u("levelHow")}</p></section>
  <section class="panel rvl"><h3 class="lab">${u("byModule")}</h3>${mods.map(x => `<a class="crow" href="#course/${x.m.id}"><span>${x.m.n}. ${I18n.X(x.m.title)}</span><div class="bar"><i class="known" style="width:${x.st.pct}%;background:${x.m.accent}"></i></div><span class="num">${x.st.done}/${x.st.total}</span></a>`).join("")}</section>
  <div class="two rvl">
    <section class="panel"><h3 class="lab">${u("strongest")}</h3>${strong.length ? strong.map(x => `<p>✓ ${I18n.X(x.m.title)} <span class="muted">${Math.round(x.avg)}%</span></p>`).join("") : `<p class="muted">${u("needData")}</p>`}</section>
    <section class="panel"><h3 class="lab">${u("weakest")}</h3>${weak.length ? weak.map(x => `<p><a href="#course/${x.m.id}">${I18n.X(x.m.title)}</a> <span class="muted">${Math.round(x.avg)}%</span></p>`).join("") : `<p class="muted">${u("needData")}</p>`}${rq ? `<div class="row"><a class="btn" href="#course/review">↻ ${u("reviewN", { n: rq })}</a></div>` : ""}</section>
  </div>
  <section class="panel rvl"><h3 class="lab">${u("recommended")}</h3><div class="ilist">${pending.map(row).join("") || `<p class="muted">${u("allDone")}</p>`}</div></section>
  ${bms.length ? `<section class="panel rvl"><h3 class="lab">${u("bookmarks")}</h3><div class="ilist">${bms.map(row).join("")}</div></section>` : ""}
  <section class="panel rvl"><h3 class="lab">${u("achievements")}</h3><div class="achs">${ach.map(a => `<span class="ach ${a[1] ? "on" : ""}" title="${I18n.attr(I18n.u(a[0] + "Sub"))}"><i aria-hidden="true">${a[1] ? "★" : "☆"}</i>${u(a[0])}</span>`).join("")}</div></section>`;
};

Pr.examProgress = () => {
  const rows = [{ id: "signs" }, ...Data.TOP].map(t => {
    const st = P.tq[t.id];
    if (!st || !st[1]) return "";
    const pct = Math.round(st[0] / st[1] * 100);
    return `<div class="crow"><span>${esc(I18n.BPP(I18n.topN(t.id)))}</span><div class="bar"><i class="known" style="width:${pct}%;background:${I18n.topDot(t.id)}"></i></div><span class="num">${pct}%</span></div>`;
  }).join("");
  return `<section class="panel"><h3 class="lab">${esc(I18n.u("exStats"))}</h3>${P.mock.taken ? `<div class="stat"><div><b>${P.mock.taken}</b><span class="muted">${esc(I18n.u("mTaken"))}</span></div><div><b>${P.mock.passed}</b><span class="muted">${esc(I18n.u("mPassed"))}</span></div><div><b>${P.mock.best}/30</b><span class="muted">${esc(I18n.u("mBest"))}</span></div></div>` : ""}
  ${rows ? `<h3 class="lab">${esc(I18n.u("topicAcc"))}</h3>${rows}` : `<p class="muted">${esc(I18n.u("noEx"))}</p>`}</section>`;
};

Pr.resetAsk = () => {
  const box2 = document.getElementById("resetbox");
  if (!box2) return;
  box2.innerHTML = `<p>${esc(I18n.u("resetAsk"))}</p><div class="row" style="margin-top:10px"><button class="holdbtn danger" id="holdReset"><i class="fill"></i><span>${esc(I18n.u("resetYes"))} - hold</span></button><button class="btn" data-act="reset0">${esc(I18n.u("resetNo"))}</button></div>`;
  Motion.holdToConfirm(document.getElementById("holdReset"), Pr.resetNow);
};

Pr.deleteAsk = () => {
  const box = document.getElementById("delbox");
  if (!box) return;
  box.innerHTML = `<p>${esc(I18n.u("delAcctAsk"))}</p><div class="row" style="margin-top:10px"><button class="holdbtn danger" id="holdDel"><i class="fill"></i><span>${esc(I18n.u("delAcctYes"))} - ${esc(I18n.u("hold"))}</span></button><button class="btn" data-act="reset0">${esc(I18n.u("resetNo"))}</button></div>`;
  Motion.holdToConfirm(document.getElementById("holdDel"), Pr.deleteNow);
};

Pr.deleteNow = async () => {
  try { await Api.del("/api/auth/me"); }
  catch (e) { Motion.toast(I18n.u("delAcctFail")); return; }
  await Auth.forget();
  Motion.toast(I18n.u("delAcctDone"));
  render();
};

Pr.resetNow = async () => {
  const lang = P.lang;
  Object.assign(P, defaultProgress(), { lang });
  S.cards = null;
  save();
  await Auth.resetServer();
  Motion.toast(I18n.u("reset"));
  render();
};

window.Progress = Pr;
})();
