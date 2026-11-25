/* IDrive progress.js — dashboard: learned/viewed stats, per-category bars,
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
  if (S.view !== "progress") return;

  app.innerHTML = `<section class="panel"><h2>${esc(I18n.u("pTitle"))}</h2><div class="stat"><div><b id="pvK">0</b><span class="muted">${esc(I18n.u("pLearned", { t: total }))}</span></div><div><b id="pvS">0</b><span class="muted">${esc(I18n.u("pViewed"))}</span></div><div><b id="pvB">0%</b><span class="muted">${esc(I18n.u("pBest"))}</span></div></div>
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
  <section class="panel"><h3 class="lab">${esc(I18n.u("reset"))}</h3><div id="resetbox"><button class="btn" data-act="reset1">${esc(I18n.u("resetBtn"))}</button></div></section>`;

  Motion.countTo(document.getElementById("pvK"), k);
  Motion.countTo(document.getElementById("pvS"), s);
  Motion.countTo(document.getElementById("pvB"), P.best || 0, "%");
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
  box2.innerHTML = `<p>${esc(I18n.u("resetAsk"))}</p><div class="row" style="margin-top:10px"><button class="holdbtn danger" id="holdReset"><i class="fill"></i><span>${esc(I18n.u("resetYes"))} — hold</span></button><button class="btn" data-act="reset0">${esc(I18n.u("resetNo"))}</button></div>`;
  Motion.holdToConfirm(document.getElementById("holdReset"), Pr.resetNow);
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
