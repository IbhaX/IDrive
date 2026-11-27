/* iDrive startup modal: show on every document load; app.js dismisses it after boot. */
(function () {
  var el = document.getElementById("splash");
  if (!el) return;
  document.documentElement.classList.add("splashing");
  window.__splashT0 = Date.now();
  var fit = function () {
    try { var b = document.getElementById("sword").getBBox(); var L = 18, R = b.x + b.width + 4;
      document.getElementById("slock").setAttribute("viewBox", L + " 4 " + (R - L) + " 142"); } catch (e) {}
  };
  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  setTimeout(function () { window.hideSplash && window.hideSplash(); }, 8000);
})();
