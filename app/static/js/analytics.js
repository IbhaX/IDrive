/* IDrive analytics.js — optional Google Analytics 4 / Google Ads.
   Does nothing unless the server put <meta name="ga-id"> or <meta name="ads-id">
   in the page (GA_MEASUREMENT_ID / ADS_ID settings). Then it loads gtag.js,
   sends a page_view per route, named events, and keeps first/last-touch ad
   click ids and UTM tags (localStorage "idrive-attr") so sign-ups can be
   attributed. No inline script: the CSP forbids it. */
(() => {
"use strict";
const meta = (n) => { const m = document.querySelector(`meta[name="${n}"]`); return m ? m.content : ""; };
const GA = meta("ga-id"), ADS = meta("ads-id"), SIGNUP = meta("ads-signup");
const ON = !!(GA || ADS);
const KEY = "idrive-attr";
const PARAMS = ["gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

function readAttr() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }

function captureAttr() {
  const q = new URLSearchParams(location.search);
  const touch = {};
  PARAMS.forEach((k) => { const v = q.get(k); if (v) touch[k] = v.slice(0, 200); });
  if (!Object.keys(touch).length) return;
  touch.landing = location.pathname.slice(0, 200);
  touch.ts = new Date().toISOString();
  const a = readAttr();
  if (!a.first) a.first = touch;
  a.last = touch;
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {}
}

let lastPath = "";
const Analytics = {
  on: ON,
  attribution() { if (!ON) return null; const a = readAttr(); return a.first || a.last ? a : null; },
  event(name, params) {
    if (!ON || !window.gtag) return;
    try {
      window.gtag("event", name, params || {});
      if (name === "sign_up" && ADS && SIGNUP) window.gtag("event", "conversion", { send_to: ADS + "/" + SIGNUP });
    } catch (e) {}
  },
  page() {
    if (!ON || !window.gtag) return;
    const p = location.pathname + location.search;
    if (p === lastPath) return;
    lastPath = p;
    try { window.gtag("event", "page_view", { page_location: location.href, page_path: p, page_title: document.title }); } catch (e) {}
  },
};
window.Analytics = Analytics;
if (!ON) return;

captureAttr();
window.dataLayer = window.dataLayer || [];
window.gtag = function gtag() { window.dataLayer.push(arguments); };
window.gtag("js", new Date());
if (GA) window.gtag("config", GA, { send_page_view: false });
if (ADS) window.gtag("config", ADS);
const s = document.createElement("script");
s.async = true;
s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA || ADS);
document.head.appendChild(s);
})();
