/* startup splash: once per browser session (every launch of the installed app),
   removed by app.js when the first screen is ready; never blocks for long. */
(function () {
  var el = document.getElementById("splash");
  try { if (sessionStorage.getItem("idrive-splash")) { el.remove(); return; } sessionStorage.setItem("idrive-splash", "1"); } catch (e) {}
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
