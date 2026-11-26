#!/usr/bin/env node
/**
 * Extract IDrive content datasets from the single-file Sadak Saathi app.
 *
 * The source HTML keeps every dataset inside one <script>: sign entries are
 * built by `add(...)` with SVGs produced by a procedural drawing kit, so the
 * only faithful way to get the data is to evaluate the script with DOM stubs
 * and serialise the resulting tables.
 *
 * Outputs (UTF-8, stable key order) into app/data/:
 *   signs.json       [{id,cat,name,meaning,action,ml:[name,meaning,action]}]
 *   sign_svgs.json   {id: "<svg ...>"}
 *   categories.json  [{id,name,dot,blurb,ml:[name,blurb]}]
 *   topics.json      [{id,name:[en,ml],dot,lessons:[[en,ml],...]}]
 *   articles/<t>.json  one bilingual article per theory topic
 *   questions.json   [{id,t,q,o,a,r}]
 *   glossary.json    [[en,ml,enDef,mlDef],...]
 *   ui.json          {key:[en,ml]}
 *   meta.json        counts + source hash + extraction timestamp
 *
 * Exit checks (per plan §3.4) run at the end and fail the process loudly.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "Sadak Saathi.html");
const OUT = join(ROOT, "app", "data");

/* ---------- 1. read + isolate the app script ---------- */
const html = readFileSync(SRC, "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) fail("no <script> block found in source");
let src = m[1];

/* ---------- 2. DOM/browser stubs ---------- */
// A permissive element stub: every property read returns another stub,
// every call returns a stub, every write is swallowed.
const el = () =>
  new Proxy(function () {}, {
    get(t, k) {
      if (k === Symbol.iterator) return [][Symbol.iterator];
      if (k === Symbol.toPrimitive) return () => "";
      if (k in t) return t[k];
      return el();
    },
    set() {
      return true;
    },
    apply() {
      return el();
    },
    has() {
      return true;
    },
  });

const sandbox = {
  console,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Promise,
  Symbol,
  Map,
  Set,
  Intl,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  setInterval: () => 0,
  clearInterval: () => {},
  setTimeout: (fn) => 0,
  clearTimeout: () => {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  location: { hash: "", href: "http://localhost/" },
  navigator: { language: "en" },
};
sandbox.window = sandbox;
sandbox.document = {
  documentElement: el(),
  querySelector: () => el(),
  querySelectorAll: () => [],
  getElementById: () => el(),
  createElement: () => el(),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: el(),
};
sandbox.window.addEventListener = () => {};
vm.createContext(sandbox);

/* ---------- 3. inject an export before the final render() ---------- */
const marker = "render();";
const idx = src.lastIndexOf(marker);
if (idx < 0) fail("could not locate final render() call");
src =
  src.slice(0, idx) +
  marker +
  "globalThis.__X={D,CATS,CATML,ML,TOP,ART,QB,GL,UI,LES," +
  "primer:[stopSign,giveWay,prohib(G.car,true),comp(G.up),warn(G.crossRd),park(''),board(GRN,'#fff','JAIPUR','120 km'),road('<path d=\"M50 4V96\" stroke=\"'+WHT+'\" stroke-width=\"5\"/>')]};" +
  src.slice(idx + marker.length);

/* ---------- 4. evaluate ---------- */
try {
  vm.runInContext(src, sandbox, { filename: "sadak-saathi.js" });
} catch (e) {
  fail("evaluation failed: " + (e && e.stack ? e.stack : e));
}
const X = sandbox.__X;
if (!X || !Array.isArray(X.D) || !X.D.length) fail("export missing or empty");

/* ---------- 5. shape + write datasets ---------- */
const w = (name, obj) => {
  const p = join(OUT, name);
  writeFileSync(p, JSON.stringify(obj, null, 1) + "\n", "utf8");
  return p;
};
mkdirSync(join(OUT, "articles"), { recursive: true });

const { D, CATS, CATML, ML, TOP, ART, QB, GL, UI, LES, primer } = X;

// signs: text fields without svg; svgs in their own file for lazy loading.
const signs = D.map((d) => ({
  id: d.id,
  cat: d.cat,
  name: d.name,
  meaning: d.meaning,
  action: d.action,
  ml: ML[d.id] || [],
}));
const signSvgs = Object.fromEntries(D.map((d) => [d.id, d.svg]));

const categories = CATS.map((c) => ({
  id: c.id,
  name: c.name,
  dot: c.dot,
  blurb: c.blurb,
  ml: CATML[c.id] || [],
}));

const topics = TOP.map((t) => ({
  id: t.id,
  name: t.name,
  dot: t.dot,
  lessons: LES[t.id] || [],
  hasArticle: Boolean(ART[t.id]),
}));

for (const t of TOP) {
  if (ART[t.id]) w(join("articles", `${t.id}.json`), ART[t.id]);
}

w("signs.json", signs);
w("sign_svgs.json", signSvgs);
w("categories.json", categories);
w("topics.json", topics);
w("questions.json", QB);
w("glossary.json", GL);
w("ui.json", UI);
w("primer.json", primer);

const sha = createHash("sha256").update(html).digest("hex");
w("meta.json", {
  source: "Sadak Saathi.html",
  sourceSha256: sha,
  contentVersion: sha.slice(0, 12),
  extractedAt: new Date().toISOString(),
  counts: {
    signs: signs.length,
    categories: categories.length,
    topics: topics.length,
    articles: Object.keys(ART).length,
    questions: QB.length,
    glossary: GL.length,
    uiKeys: Object.keys(UI).length,
  },
});

/* ---------- 6. exit checks ---------- */
const errs = [];
const expect = (cond, msg) => {
  if (!cond) errs.push(msg);
};

// count checks against the raw source, not just the VM result
const addCount = (html.match(/\badd\("/g) || []).length;
const qCount = (html.match(/\bQ\("/g) || []).length;
expect(signs.length === addCount, `signs ${signs.length} != add() ${addCount}`);
expect(QB.length === qCount, `questions ${QB.length} != Q() ${qCount}`);
expect(topics.length === 18, `topics ${topics.length} != 18`);
expect(Object.keys(ART).length === 18, `articles != 18`);

for (const d of D) {
  if (!d.svg || !d.svg.startsWith("<svg")) errs.push(`sign ${d.id}: bad svg`);
  if (!d.id || !d.cat || !d.name) errs.push(`sign ${d.id}: missing fields`);
}
const ids = new Set();
for (const d of D) {
  if (ids.has(d.id)) errs.push(`duplicate sign id ${d.id}`);
  ids.add(d.id);
}
const mlMissing = D.filter((d) => !(ML[d.id] || [])[0]);
if (mlMissing.length)
  errs.push(`signs missing Malayalam name: ${mlMissing.length} (e.g. ${mlMissing[0].id})`);

for (const q of QB) {
  if (!q.q || !Array.isArray(q.o) || q.o.length < 2) errs.push(`question ${q.id}: bad shape`);
  if (typeof q.a !== "number" || q.a < 0 || q.a >= q.o.length)
    errs.push(`question ${q.id}: answer index out of range`);
  const plain = q.o.map((o) => JSON.stringify(o));
  if (new Set(plain).size !== plain.length) errs.push(`question ${q.id}: duplicate options`);
  if (!Array.isArray(q.r) || !q.r[0] || !q.r[1]) errs.push(`question ${q.id}: missing reasoning`);
}
for (const t of TOP) {
  const a = ART[t.id];
  if (!a) continue;
  if (!a.intro || !a.intro[0] || !a.intro[1]) errs.push(`article ${t.id}: bad intro`);
  if (!Array.isArray(a.sections)) errs.push(`article ${t.id}: no sections`);
}
if (!GL.length) errs.push("glossary empty");
if (!UI || !UI.sub) errs.push("ui table missing keys");
expect(primer.length === 8, `primer svgs ${primer.length} != 8`);
for (const s of primer) {
  if (!s || !s.startsWith("<svg")) errs.push("primer svg malformed");
}

if (errs.length) {
  console.error("EXTRACTION CHECKS FAILED:");
  for (const e of errs.slice(0, 40)) console.error(" -", e);
  if (errs.length > 40) console.error(` … and ${errs.length - 40} more`);
  process.exit(1);
}

console.log("extracted:", JSON.stringify({
  signs: signs.length,
  categories: categories.length,
  topics: topics.length,
  articles: Object.keys(ART).length,
  questions: QB.length,
  glossary: GL.length,
}, null, 1));
console.log(`content version ${sha.slice(0, 12)} - wrote ${OUT}`);

function fail(msg) {
  console.error("extract_data: " + msg);
  process.exit(1);
}
