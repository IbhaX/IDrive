/* IDrive auth.js — sign-in modal, token handling, progress sync.
   Progress blob merge rules (documented):
   - seen: union; box/wrong: per-key max; best/played/mock fields: max;
   - tq: per-topic [max correct, max total]; lang: local wins; v: bumped.
   Max-based counters avoid double-counting the same attempts on two devices. */
(() => {
"use strict";
const A = { user: null, syncing: false, putTimer: null, version: 0 };

A.signedIn = () => !!A.user;

A.chipHtml = () => {
  if (A.user) {
    const init = (A.user.name || A.user.email || "?").trim()[0].toUpperCase();
    return `<button class="authchip" data-act="account"><span class="dotu">${esc(init)}</span><span>${esc(A.user.name || A.user.email)}</span></button>`;
  }
  return `<button class="authchip" data-act="signin">${esc(I18n.u("signIn"))}</button>`;
};

A.renderChip = () => { const s = document.getElementById("authSlot"); if (s) s.innerHTML = A.chipHtml(); };

A.openModal = (mode) => {
  const m = document.getElementById("amodal"), card = document.getElementById("acard");
  mode = mode || "login";
  const isLogin = mode === "login";
  card.innerHTML = `
    <div class="atabs" role="tablist">
      <button class="${isLogin ? "on" : ""}" data-amode="login" role="tab">${esc(I18n.u("signIn"))}</button>
      <button class="${!isLogin ? "on" : ""}" data-amode="register" role="tab">${esc(I18n.u("signUp"))}</button>
    </div>
    <h2>${esc(isLogin ? I18n.u("signIn") : I18n.u("createAcct"))}</h2>
    ${!isLogin ? `<div class="afield"><label for="aname">${esc(I18n.u("yourName"))}</label><input id="aname" autocomplete="name" maxlength="128"></div>` : ""}
    <div class="afield"><label for="aemail">${esc(I18n.u("email"))}</label><input id="aemail" type="email" autocomplete="email" maxlength="254"></div>
    <div class="afield"><label for="apw">${esc(I18n.u("password"))}</label>
      <div class="pwrow"><input id="apw" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}"><button type="button" class="pwreveal" id="pwrev">${esc(I18n.u("show"))}</button></div>
      ${!isLogin ? `<div class="pwmeter"><i id="pwm"></i></div>` : ""}
    </div>
    <div class="aerr" id="aerr" role="alert"></div>
    <div class="row"><button class="btn primary big" id="ago">${esc(isLogin ? I18n.u("signIn") : I18n.u("createAcct"))}</button><button class="btn" id="aclose">${esc(I18n.u("close"))}</button></div>
    <div class="gzone" id="gzone"><div class="adiv"><span>${esc(I18n.u("or"))}</span></div><div class="gbtn" id="gbtn"></div></div>
    <p class="muted">${esc(I18n.u("authNote"))}</p>`;
  m.hidden = false;
  m.classList.add("opening");
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.remove("opening")));
  const pw = card.querySelector("#apw");
  card.querySelector("#pwrev").onclick = () => { pw.type = pw.type === "password" ? "text" : "password"; };
  if (!isLogin) {
    pw.oninput = () => {
      const meter = card.querySelector("#pwm");
      const v = pw.value;
      let s = 0;
      if (v.length >= 8) s++;
      if (v.length >= 12) s++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
      if (/\d/.test(v)) s++;
      if (/[^A-Za-z0-9]/.test(v)) s++;
      meter.style.width = (s / 5 * 100) + "%";
      meter.style.background = s <= 1 ? "var(--bad)" : s <= 3 ? "var(--signal)" : "var(--good)";
    };
  }
  card.querySelector("#aclose").onclick = A.closeModal;
  card.querySelector("#ago").onclick = () => A.submit(isLogin);
  card.onkeydown = (e) => { if (e.key === "Enter") A.submit(isLogin); };
  A.mountGoogle(card);
  setTimeout(() => { const f = card.querySelector(isLogin ? "#aemail" : "#aname") || pw; f && f.focus(); }, 60);
};

/* shared post-signin path for email/password and Google */
A.finishAuth = async (r) => {
  Api.setToken(r.token);
  A.user = r.user;
  A.closeModal();
  A.renderChip();
  Motion.toast(I18n.u("welcome") + (r.user.name ? ", " + r.user.name : ""));
  await A.syncFromServer();
  render();
};

/* ---------- Google sign-in (GIS button → POST /api/auth/google) ---------- */
let gcfgPromise = null;
A.gconfig = () => {
  if (!gcfgPromise) gcfgPromise = Api.get("/api/auth/config").catch(() => ({ google_client_id: "" }));
  return gcfgPromise;
};

A.onGoogle = async (resp) => {
  const err = document.querySelector("#acard .aerr");
  try {
    const r = await Api.post("/api/auth/google", { credential: resp.credential });
    await A.finishAuth(r);
  } catch (e) {
    if (err) err.textContent = I18n.u("networkErr");
  }
};

A.mountGoogle = async (card) => {
  const holder = card.querySelector("#gbtn"), zone = card.querySelector("#gzone");
  if (!holder || !zone) return;
  const cfg = await A.gconfig();
  const g = window.google && window.google.accounts && window.google.accounts.id;
  if (!cfg.google_client_id || !g || !card.isConnected) { zone.hidden = true; return; }
  g.initialize({ client_id: cfg.google_client_id, callback: A.onGoogle });
  holder.innerHTML = "";
  g.renderButton(holder, {
    type: "standard",
    theme: document.documentElement.dataset.theme === "light" ? "outline" : "filled_black",
    size: "large",
    text: "continue_with",
    shape: "pill",
    width: Math.min(holder.clientWidth || 320, 400),
  });
};

A.closeModal = () => {
  const m = document.getElementById("amodal");
  m.classList.add("closing");
  setTimeout(() => { m.hidden = true; m.classList.remove("closing"); }, 240);
};

A.submit = async (isLogin) => {
  const card = document.getElementById("acard"), err = card.querySelector("#aerr");
  const email = card.querySelector("#aemail").value.trim();
  const password = card.querySelector("#apw").value;
  const nameEl = card.querySelector("#aname");
  err.textContent = "";
  if (!email || !password) { err.textContent = I18n.u("fillAll"); return; }
  try {
    const r = isLogin
      ? await Api.post("/api/auth/login", { email, password })
      : await Api.post("/api/auth/register", { email, password, name: nameEl ? nameEl.value.trim() : "" });
    await A.finishAuth(r);
  } catch (e) {
    err.textContent = e.code === "rate_limited" ? I18n.u("tooMany") : (e.code === "email_taken" ? I18n.u("emailTaken") : I18n.u("badLogin"));
  }
};

A.signOut = async () => {
  try { await Api.post("/api/auth/logout"); } catch (e) {}
  Api.setToken("");
  A.user = null;
  A.version = 0;
  A.renderChip();
  Motion.toast(I18n.u("signedOut"));
  render();
};

A.restore = async () => {
  if (!Api.token()) { A.renderChip(); return; }
  try {
    A.user = await Api.get("/api/auth/me");
    await A.syncFromServer();
  } catch (e) {
    Api.setToken("");
    A.user = null;
  }
  A.renderChip();
};

/* ---------- progress sync ---------- */
A.mergeProgress = (local, server) => {
  const l = local || {}, s = server || {};
  const union = (a, b) => Object.assign({}, a, b);
  const maxMap = (a, b) => {
    const o = Object.assign({}, a);
    for (const k in b) o[k] = Math.max(o[k] || 0, b[k] || 0);
    return o;
  };
  const tq = Object.assign({}, l.tq || {});
  for (const k in (s.tq || {})) {
    const lv = tq[k] || [0, 0], sv = s.tq[k];
    tq[k] = [Math.max(lv[0], sv[0]), Math.max(lv[1], sv[1])];
  }
  const mock = Object.assign({ taken: 0, passed: 0, best: 0 }, l.mock || {});
  for (const k of ["taken", "passed", "best"]) mock[k] = Math.max(mock[k] || 0, ((s.mock || {})[k]) || 0);
  return {
    seen: union(s.seen, l.seen),
    box: maxMap(l.box, s.box),
    wrong: maxMap(l.wrong, s.wrong),
    best: Math.max(l.best || 0, s.best || 0),
    played: Math.max(l.played || 0, s.played || 0),
    lang: l.lang || s.lang || "both",
    mock, tq,
    v: Math.max(l.v || 1, s.v || 1),
  };
};

A.syncFromServer = async () => {
  if (!A.user) return;
  try {
    const r = await Api.get("/api/progress");
    A.version = r.version;
    const server = r.data || {};
    if (!Object.keys(server).length) {
      // server empty → push local
      await A.putToServer();
    } else {
      const merged = A.mergeProgress(P, server);
      Object.assign(P, merged);
      saveLocal();
      await A.putToServer();
    }
  } catch (e) { /* offline: stay local */ }
};

A.putToServer = async () => {
  if (!A.user) return;
  try {
    const r = await Api.put("/api/progress", { data: blobOf(P), version: A.version });
    A.version = r.version;
  } catch (e) {
    if (e.status === 409 && e.data && e.data.server) {
      // another device wrote meanwhile — re-merge and retry once
      const merged = A.mergeProgress(P, e.data.server.data);
      Object.assign(P, merged);
      saveLocal();
      A.version = e.data.server.version;
      try {
        const r2 = await Api.put("/api/progress", { data: blobOf(P), version: A.version });
        A.version = r2.version;
      } catch (e2) {}
    }
  }
};

A.queuePut = () => {
  if (!A.user) return;
  if (A.putTimer) clearTimeout(A.putTimer);
  A.putTimer = setTimeout(() => A.putToServer(), 1500);
};

A.resetServer = async () => {
  if (!A.user) return;
  try { const r = await Api.post("/api/progress/reset"); A.version = r.version; } catch (e) {}
};

/* progress blob to send — P minus nothing (same shape as source) */
function blobOf(p) {
  return { seen: p.seen || {}, box: p.box || {}, wrong: p.wrong || {}, best: p.best || 0, played: p.played || 0, lang: p.lang || "both", mock: p.mock || { taken: 0, passed: 0, best: 0 }, tq: p.tq || {}, v: p.v || 1 };
}

window.Auth = A;
})();
