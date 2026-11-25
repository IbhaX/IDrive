/* set theme before first paint to avoid a flash (CSP-safe: no inline JS) */
try {
  if (localStorage.getItem("idrive-theme") === "light") document.documentElement.dataset.theme = "light";
} catch (e) {}
