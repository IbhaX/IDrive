/* PWA: service-worker registration and "install the app" flows.
   - Chrome/Edge/Samsung (Android, desktop): the native install prompt,
     captured from `beforeinstallprompt` and fired from our own buttons.
   - iPhone/iPad Safari: no prompt API exists, so a sheet shows the
     Share → "Add to Home Screen" steps.
   - macOS Safari 17+: File → "Add to Dock".
   Buttons only appear when installing is actually possible and the app is
   not already running installed. */
const Pwa = (() => {
  const P = {};
  let deferred = null;
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|FxiOS|EdgiOS|Edg\//.test(ua);
  const isMacSafari = !isIOS && isSafari && /Macintosh/.test(ua);
  const DKEY = "idrive-install-dismissed";

  P.installed = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    navigator.standalone === true;

  /* "prompt" (native), "ios", "mac" or "" */
  P.mode = () => {
    if (P.installed()) return "";
    if (deferred) return "prompt";
    if (isIOS && isSafari) return "ios";
    if (isMacSafari) return "mac";
    return "";
  };
  P.can = () => !!P.mode();

  P.dismissed = () => { try { return +localStorage.getItem(DKEY) > Date.now() - 1000 * 60 * 60 * 24 * 14; } catch (e) { return false; } };
  P.dismiss = () => { try { localStorage.setItem(DKEY, String(Date.now())); } catch (e) {} refresh(); };

  const u = (k) => I18n.esc(I18n.u(k));
  const svg = (d, cls = "") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = '<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>';

  /* home-screen card (mobile-first; also shown on desktop when a prompt is available) */
  P.cardHtml = () => {
    if (!P.can() || P.dismissed()) return "";
    return `<section class="pwacard rvl" id="pwaCard">
      <img src="/static/img/icon-192.png" alt="" width="56" height="56">
      <div class="pwatxt"><b>${u("installTitle")}</b><small>${u("installSub")}</small></div>
      <div class="pwaact">
        <button class="btn primary" data-act="install">${svg(ICON)}<span>${u("install")}</span></button>
        <button class="btn ghost" data-act="installLater">${u("notNow")}</button>
      </div>
    </section>`;
  };

  /* compact entry for the More menu / top bar */
  P.menuHtml = () => P.can() ? `<button data-act="install">${svg(ICON)}<span>${u("install")}</span></button>` : "";

  function refresh() {
    const b = document.getElementById("installBtn");
    if (b) b.hidden = !P.can();
    const c = document.getElementById("pwaCard");
    if (c && (!P.can() || P.dismissed())) c.remove();
  }

  P.install = async () => {
    const m = P.mode();
    if (m === "prompt" && deferred) {
      const ev = deferred; deferred = null;
      ev.prompt();
      try { await ev.userChoice; } catch (e) {}
      refresh();
      return;
    }
    if (m === "ios" || m === "mac") P.openHelp(m);
  };

  P.openHelp = (m) => {
    const ov = document.getElementById("pwaSheet");
    if (!ov) return;
    const share = svg('<path d="M12 3v13"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>', "inl");
    const plus = svg('<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/>', "inl");
    const steps = m === "ios"
      ? [u("iosStep1").replace("{share}", share), u("iosStep2").replace("{add}", plus), u("iosStep3")]
      : [u("macStep1"), u("macStep2")];
    ov.innerHTML = `<div class="pwasheet" role="document">
      <div class="pwahead"><img src="/static/img/icon-192.png" alt="" width="48" height="48"><div><b>${u("installTitle")}</b><small>${u(m === "ios" ? "iosHint" : "macHint")}</small></div></div>
      <ol class="pwasteps">${steps.map((s) => `<li>${s}</li>`).join("")}</ol>
      <button class="btn primary" data-act="pwaClose">${u("gotIt")}</button>
    </div>`;
    ov.hidden = false;
    Motion.rise(ov.querySelector(".pwasheet"));
    ov.querySelector("[data-act=pwaClose]").focus();
  };
  P.closeHelp = () => { const ov = document.getElementById("pwaSheet"); if (ov) ov.hidden = true; };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();          // we show our own button instead of the mini-infobar
    deferred = e;
    refresh();
    // the home card is rendered by the view; re-render once if it is missing
    if (typeof S !== "undefined" && S.view === "home" && !document.getElementById("pwaCard") && !P.dismissed()) window.render && render();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    refresh();
    if (window.Motion) Motion.toast(I18n.u("installDone"));
  });

  window.addEventListener("offline", () => window.Motion && Motion.toast(I18n.u("offlineNow")));
  window.addEventListener("online", () => window.Motion && Motion.toast(I18n.u("onlineAgain")));

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    });
  }

  P.refresh = refresh;
  return P;
})();
window.Pwa = Pwa;
