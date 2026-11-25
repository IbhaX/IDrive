/* IDrive data.js — content store over /api/content/*. */
(() => {
"use strict";
const Data = {
  version: "",
  D: [],            // signs (text only)
  byId: {},         // id -> sign
  SVG: {},          // id -> svg string (lazy)
  CATS: [],
  catById: {},
  TOP: [],
  topicById: {},
  ART: {},          // topic -> article (lazy)
  GL: null,         // glossary entries (lazy)
  UI: {},
  glossaryCount: 0,
  questionCounts: {},

  async loadIndex() {
    const idx = await Api.get("/api/content/index");
    Data.version = idx.version;
    Data.D = idx.signs;
    Data.byId = Object.fromEntries(idx.signs.map(d => [d.id, d]));
    Data.CATS = idx.categories;
    Data.catById = Object.fromEntries(idx.categories.map(c => [c.id, c]));
    Data.TOP = idx.topics;
    Data.topicById = Object.fromEntries(idx.topics.map(t => [t.id, t]));
    Data.UI = idx.ui;
    Data.PRIMER = idx.primer || [];
    Data.glossaryCount = idx.glossaryCount;
    Data.questionCounts = idx.questionCounts;
    return idx;
  },

  async ensureSvgs(cat) {
    const need = Data.D.filter(d => !Data.SVG[d.id] && (cat === "all" || d.cat === cat));
    if (!need.length) return;
    const url = cat === "all" ? "/api/content/svgs" : "/api/content/svgs?cat=" + encodeURIComponent(cat);
    const got = await Api.get(url);
    Object.assign(Data.SVG, got);
  },

  async ensureSvgIds(ids) {
    const missing = [...new Set(ids)].filter(id => !Data.SVG[id]);
    if (!missing.length) return;
    // small sets: per-sign fetch keeps the cache coherent
    await Promise.all(missing.map(async id => {
      try { const s = await Api.get("/api/content/signs/" + encodeURIComponent(id)); Data.SVG[id] = s.svg; }
      catch (e) { /* leave missing; tile shows a blank plate */ }
    }));
  },

  async article(topicId) {
    if (Data.ART[topicId]) return Data.ART[topicId];
    const r = await Api.get("/api/content/theory/" + encodeURIComponent(topicId));
    Data.ART[topicId] = r.article;
    return r.article;
  },

  async glossary() {
    if (Data.GL) return Data.GL;
    const r = await Api.get("/api/content/glossary");
    Data.GL = r.entries;
    return r.entries;
  },

  catOf(id) { return Data.catById[id]; },
  sm(d) { return d.ml || []; },        // Malayalam [name, meaning, action]
  catMl(c, i) { return (c.ml || [])[i] || ""; },
};
window.Data = Data;
})();
