/* iDrive admin.js - the admin panel (/admin): activity overview, user
   management (role, access, sign out everywhere, delete) and recent tests.
   Admins only; the server checks every call (api/admin_routes.py). Changes
   apply at once: a blocked user loses every session and cannot sign in. */
(() => {
"use strict";
const u = (k, o) => I18n.u(k, o), e = (s) => I18n.X(s), at = (s) => I18n.attr(s);
const Ad = { q: "", role: "", status: "", sort: "joined", page: 1, size: 25, arm: null };

const when = (iso, withTime) => {
  if (!iso) return e(u("adNever"));
  const d = new Date(iso), loc = I18n.lang() === "en" ? "en-IN" : "ml-IN";
  return d.toLocaleDateString(loc, { day: "numeric", month: "short", year: "numeric" }) + (withTime ? " " + d.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" }) : "");
};
const ago = (iso) => {
  if (!iso) return e(u("adNever"));
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 60) return e(u("adMinAgo", { n: Math.max(1, m) }));
  if (m < 60 * 48) return e(u("adHrAgo", { n: Math.round(m / 60) }));
  return e(u("adDayAgo", { n: Math.round(m / 1440) }));
};
const sel = (name, value, opts, dis, title) => `<select class="adsel" data-f="${name}" ${dis ? "disabled" : ""} ${title ? `title="${at(title)}"` : ""}>${opts.map(([v, k]) => `<option value="${v}" ${v === value ? "selected" : ""}>${e(u(k))}</option>`).join("")}</select>`;

Ad.view = async (app) => {
  if (!Auth.signedIn() || !Auth.isAdmin()) {
    app.innerHTML = `<section class="panel"><h2>${e(u("adTitle"))}</h2><p>${e(u("adOnly"))}</p>${Auth.signedIn() ? "" : `<button class="btn" data-act="signin">${e(u("signIn"))}</button>`}</section>`;
    return;
  }
  app.innerHTML = `<section class="panel adhead"><div><h2>${e(u("adTitle"))}</h2><p class="muted">${e(u("adSub"))}</p></div>
    <button class="btn small" type="button" id="adRefresh">↻ ${e(u("adRefresh"))}</button></section>
    <section class="panel" aria-labelledby="adStatsH"><h3 class="lab" id="adStatsH">${e(u("adOverview"))}</h3><div class="adstats" id="adStats"><p class="muted">…</p></div></section>
    <section class="panel" aria-labelledby="adUsersH"><h3 class="lab" id="adUsersH">${e(u("adUsers"))}</h3><p class="muted">${e(u("adNote"))}</p>
      <div class="adtools">
        <input type="search" id="adQ" placeholder="${at(u("adSearch"))}" aria-label="${at(u("adSearch"))}" value="${at(Ad.q)}">
        ${sel("role", Ad.role, [["", "adRoleAll"], ["user", "adRoleUser"], ["admin", "adRoleAdmin"]])}
        ${sel("status", Ad.status, [["", "adAccAll"], ["active", "adActive"], ["blocked", "adBlocked"]])}
        ${sel("sort", Ad.sort, [["joined", "adSortJoined"], ["last_login", "adSortLogin"], ["email", "adSortEmail"], ["name", "adSortName"]])}
      </div>
      <div class="adwrap" id="adUsers"><p class="muted">…</p></div><div class="adpager" id="adPager"></div></section>
    <section class="panel" aria-labelledby="adRecentH"><h3 class="lab" id="adRecentH">${e(u("adRecent"))}</h3><div class="adwrap" id="adRecent"><p class="muted">…</p></div></section>`;
  const qIn = app.querySelector("#adQ");
  let qt = 0;
  qIn.addEventListener("input", () => { clearTimeout(qt); qt = setTimeout(() => { Ad.q = qIn.value; Ad.page = 1; loadUsers(); }, 300); });
  app.querySelectorAll(".adtools .adsel").forEach((s) => s.addEventListener("change", () => { Ad[s.dataset.f] = s.value; Ad.page = 1; loadUsers(); }));
  app.querySelector("#adRefresh").addEventListener("click", () => { loadOverview(); loadUsers(); });
  app.querySelector("#adUsers").addEventListener("change", onRowChange);
  app.querySelector("#adUsers").addEventListener("click", onRowClick);
  app.querySelector("#adPager").addEventListener("click", (ev) => { const b = ev.target.closest("[data-pg]"); if (b) { Ad.page += +b.dataset.pg; loadUsers(); } });
  loadOverview(); loadUsers();
};

async function loadOverview() {
  const box = document.getElementById("adStats"), rec = document.getElementById("adRecent");
  if (!box) return;
  try {
    const { stats: s, recent } = await Api.get("/api/admin/overview");
    const card = (k, v, sub) => `<div class="adstat"><b>${v}</b><span>${e(u(k))}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    box.innerHTML = card("adStUsers", s.users) + card("adStActive", s.active7) + card("adStNew", s.new7) + card("adStAdmins", s.admins)
      + card("adStBlocked", s.blocked) + card("adStSessions", s.sessions) + card("adStMocks", s.mocks7, e(u("adStPassed", { n: s.passed7 })));
    rec.innerHTML = recent.length ? `<table class="adtable"><thead><tr><th scope="col">${e(u("adColTime"))}</th><th scope="col">${e(u("adColUser"))}</th><th scope="col">${e(u("adColTest"))}</th><th scope="col">${e(u("adColScore"))}</th><th scope="col">${e(u("adColResult"))}</th></tr></thead><tbody>${recent.map((a) => {
      const topic = a.mode === "mock" ? e(u("adMockTest")) : e(u("adPractice", { t: a.topic && Data.topicById && Data.topicById[a.topic] ? I18n.one(Data.topicById[a.topic].name) : a.topic || "-" }));
      return `<tr><td data-l="${at(u("adColTime"))}">${when(a.when, true)}</td><td data-l="${at(u("adColUser"))}">${a.email ? `${I18n.esc(a.name || "")}<br><small class="muted">${I18n.esc(a.email)}</small>` : `<span class="muted">${e(u("adDeleted"))}</span>`}</td><td data-l="${at(u("adColTest"))}">${topic}</td><td data-l="${at(u("adColScore"))}">${a.score}/${a.total}</td><td data-l="${at(u("adColResult"))}">${a.mode === "mock" ? `<span class="adpill ${a.passed ? "ok" : "no"}">${e(u(a.passed ? "adPass" : "adFail"))}</span>` : "-"}${a.late ? ` <small class="muted">${e(u("adLate"))}</small>` : ""}</td></tr>`;
    }).join("")}</tbody></table>` : `<p class="muted">${e(u("adNoTests"))}</p>`;
  } catch (err) { box.innerHTML = `<p class="muted">${e(u("networkErr"))}</p>`; }
}

async function loadUsers() {
  const box = document.getElementById("adUsers"), pager = document.getElementById("adPager");
  if (!box) return;
  const p = new URLSearchParams({ q: Ad.q, role: Ad.role, status: Ad.status, sort: Ad.sort, order: Ad.sort === "email" || Ad.sort === "name" ? "asc" : "desc", page: Ad.page, size: Ad.size });
  let r;
  try { r = await Api.get("/api/admin/users?" + p); }
  catch (err) { box.innerHTML = `<p class="muted">${e(err.status === 403 ? u("adOnly") : u("networkErr"))}</p>`; pager.innerHTML = ""; return; }
  const me = Auth.user && Auth.user.id;
  if (!r.users.length) { box.innerHTML = `<p class="muted">${e(u("adNoUsers"))}</p>`; pager.innerHTML = ""; return; }
  const th = ["adColUser", "adColEmail", "adColRole", "adColAccess", "adColProgress", "adColSignin", "adColJoined", "adColActions"].map((k) => `<th scope="col">${e(u(k))}</th>`).join("");
  box.innerHTML = `<table class="adtable adusers"><thead><tr>${th}</tr></thead><tbody>${r.users.map((x) => {
    const self = x.id === me, pr = x.progress;
    const roleLock = self || x.envAdmin, accLock = self || x.envAdmin;
    const lockWhy = self ? u("adSelfLock") : x.envAdmin ? u("adEnvAdmin") : "";
    return `<tr data-id="${x.id}" class="${x.status === "blocked" ? "blk" : ""}">
      <td data-l="${at(u("adColUser"))}"><b>${I18n.esc(x.name || "-")}</b>${self ? ` <span class="adpill">${e(u("adYou"))}</span>` : ""}</td>
      <td data-l="${at(u("adColEmail"))}"><span class="ademail">${I18n.esc(x.email)}</span></td>
      <td data-l="${at(u("adColRole"))}">${sel("role", x.role, [["user", "adRoleUser"], ["admin", "adRoleAdmin"]], roleLock, lockWhy)}</td>
      <td data-l="${at(u("adColAccess"))}">${sel("status", x.status, [["active", "adActive"], ["blocked", "adBlocked"]], accLock, lockWhy)}</td>
      <td data-l="${at(u("adColProgress"))}"><small>${e(u("adLessons", { n: pr.lessons }))} · ${e(u("adMockBest", { b: pr.mockBest, t: pr.mockTaken }))} · ${e(u("adDays", { n: pr.days }))}</small></td>
      <td data-l="${at(u("adColSignin"))}"><small>${e(u(x.provider === "google" ? "adGoogle" : "adPassword"))} · ${ago(x.lastLogin)}<br>${e(u("adSessions", { n: x.sessions }))}</small></td>
      <td data-l="${at(u("adColJoined"))}"><small>${when(x.joined)}</small></td>
      <td data-l="${at(u("adColActions"))}" class="adacts">${self ? "" : `<button type="button" class="btn small" data-a="signout" ${x.sessions ? "" : "disabled"}>${e(u("adSignOut"))}</button>${x.envAdmin ? "" : `<button type="button" class="btn small danger" data-a="delete">${e(u("adDelete"))}</button>`}`}</td></tr>`;
  }).join("")}</tbody></table>`;
  const a = (r.page - 1) * r.size + 1, b = Math.min(r.total, r.page * r.size);
  pager.innerHTML = `<span class="muted">${e(u("adShowing", { a, b, n: r.total }))}</span><span><button type="button" class="btn small" data-pg="-1" ${r.page > 1 ? "" : "disabled"}>‹ ${e(u("adPrev"))}</button><button type="button" class="btn small" data-pg="1" ${b < r.total ? "" : "disabled"}>${e(u("adNext"))} ›</button></span>`;
}

async function onRowChange(ev) {
  const s = ev.target.closest(".adsel"), tr = ev.target.closest("tr[data-id]");
  if (!s || !tr) return;
  s.disabled = true;
  try {
    await Api.patch(`/api/admin/users/${tr.dataset.id}`, { [s.dataset.f]: s.value });
    Motion.toast(I18n.u("adSaved"));
    loadUsers(); loadOverview();
  } catch (err) { Motion.toast(I18n.u("adErr", { e: err.message })); loadUsers(); }
}

async function onRowClick(ev) {
  const b = ev.target.closest("[data-a]"), tr = ev.target.closest("tr[data-id]");
  if (!b || !tr) return;
  const id = tr.dataset.id;
  if (b.dataset.a === "signout") {
    b.disabled = true;
    try { const r = await Api.post(`/api/admin/users/${id}/signout`); Motion.toast(I18n.u("adSignedOut", { n: r.sessions })); loadUsers(); loadOverview(); }
    catch (err) { Motion.toast(I18n.u("adErr", { e: err.message })); b.disabled = false; }
    return;
  }
  if (b.dataset.a === "delete") {
    /* two taps: the first arms the button for a few seconds */
    if (Ad.arm !== id) { Ad.arm = id; b.textContent = I18n.one(u("adConfirm")); b.classList.add("armed"); setTimeout(() => { if (Ad.arm === id) { Ad.arm = null; b.textContent = I18n.one(u("adDelete")); b.classList.remove("armed"); } }, 4000); return; }
    Ad.arm = null; b.disabled = true;
    try { await Api.del(`/api/admin/users/${id}`); Motion.toast(I18n.u("adDeletedOk")); loadUsers(); loadOverview(); }
    catch (err) { Motion.toast(I18n.u("adErr", { e: err.message })); b.disabled = false; }
  }
}

window.Admin = Ad;
})();
