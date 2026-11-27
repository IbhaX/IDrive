/* IDrive static_page.js - About, Privacy, Terms, Install (route "page/<name>",
   address /<name>). The server renders these pages; the first visit reuses
   that HTML, later visits fetch the page and take its <main id="app">. */
(() => {
"use strict";
const SP = { cache: {} };
const key = (name, lang) => name + "|" + lang;
const langOf = () => (["ml","ta","ta-en","hi","hi-en","kn","kn-en","te","te-en"].includes(I18n.lang())?(I18n.lang().endsWith("-en")?I18n.lang().split("-")[0]:I18n.lang()):"en");

SP.keep = (path, html) => {
  const name = (path || "").replace(/^\/+|\/+$/g, "");
  if (document.querySelector('meta[name="app-notfound"]')) { SP.cache[key("notfound", "en")] = SP.cache[key("notfound", "ml")] = html; return; }
  const tagged = document.querySelector('meta[name="app-static"]');
  if (!tagged || !/^(about|privacy|terms|install)$/.test(name)) return;
  const pageLang = new URLSearchParams(location.search).get("lang");
  SP.cache[key(name, ["ml","ta","hi","kn","te"].includes(pageLang) ? pageLang : "en")] = html;
};

async function load(name, lang) {
  let html = SP.cache[key(name, lang)];
  if (html) return html;
  const res = await fetch("/" + name + (["ml","ta","hi","kn","te"].includes(lang) ? "?lang=" + lang : ""), { headers: { Accept: "text/html" } });
  if (!res.ok) throw new Error(String(res.status));
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");
  const main = doc.getElementById("app");
  html = main ? main.innerHTML : "";
  if (!html) throw new Error("empty");
  SP.cache[key(name, lang)] = html;
  return html;
}

SP.view = async (app) => {
  const p = S.param || "";
  const name = /^(about|privacy|terms|install)$/.test(p) || (p === "notfound" && SP.cache[key(p, "en")]) ? p : "about";
  // Bilingual modes show the selected local language, then English.
  const langs = name === "notfound" ? ["en"] : I18n.lang() === "both" ? ["ml", "en"] : I18n.lang() === "ta-en" ? ["ta", "en"] : I18n.lang()==="hi-en"?["hi","en"]:I18n.lang()==="kn-en"?["kn","en"]:I18n.lang()==="te-en"?["te","en"]:[langOf()];
  let html = langs.every((l) => SP.cache[key(name, l)]) ? langs.map((l) => SP.cache[key(name, l)]).join("") : "";
  if (!html) {
    app.innerHTML = `<section class="panel"><div class="skel"><i style="height:26px;width:34%"></i><i style="height:16px"></i><i style="height:16px;width:80%"></i></div></section>`;
    try {
      html = (await Promise.all(langs.map((l) => load(name, l)))).join("");
    } catch (e) {
      if (S.view !== "page") return;
      app.innerHTML = `<section class="panel"><p class="muted">${I18n.esc(I18n.u("pageLoadFail"))}</p></section>`;
      return;
    }
  }
  if (S.view !== "page" || S.param !== name) return;
  app.innerHTML = html;
};
window.StaticPage = SP;
})();
