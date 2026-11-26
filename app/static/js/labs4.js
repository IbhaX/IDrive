/* iDrive labs4.js — 20 more labs on the labs3.js engine (Labs.L3).
   Same rules: simplified, labelled models; no legal limits, no fines. */
(() => {
"use strict";
const Lb = window.Labs;
const { def, BG, T, R, Ln, car, plot, hbar, fx, clamp, stopD, vmaxFor, MU, SURF3, SURF2, YESNO, t1, g } = Lb.L3;
const RHO = 1.2;
const DEG = Math.PI / 180;
const SPEED = (lo, hi, k = "speed", d = 50) => ["r", "kmh", k, lo, hi, 5, "km/h"];
const level = (x, bad, warn) => (x >= bad ? "bad" : x >= warn ? "warnt" : "good");

/* a strip of road with a scale in metres: the "blind distance" labs */
const distStrip = (dist, stop, title, distKey) => {
  const max = Math.max(dist, stop, 40) * 1.12, X = (m) => 50 + m / max * 550;
  let s = BG() + T(50, 34, title, "hlab") + `<rect x="0" y="96" width="640" height="70" class="road"/>` + Ln(0, 131, 640, 131, "cl");
  s += R(X(0), 98, X(dist) - X(0), 66, "l3blind", 0) + car(X(0) + 34, 131, "you") + car(X(dist) + 34, 131, "lead");
  s += hbar(50, 200, 550, 12, dist, max, "l3badbar", t1(distKey)) + T(604, 211, `${Math.round(dist)} m`, "axis") ;
  s += hbar(50, 238, 550, 12, stop, max, "l3okbar", t1("msStop")) + T(604, 249, `${Math.round(stop)} m`, "axis");
  return s;
};

/* =================== ROADS, BENDS & JUNCTIONS =================== */

def("speedbump", {
  st: { kmh: 30, h: 10, L: 3 },
  ctl: [SPEED(5, 60), ["r", "h", "sbHeight", 5, 15, 1, "cm"], ["r", "L", "sbLength", 1, 6, .5, "m", 1]],
  calc(st) {
    const v = st.kmh / 3.6, hm = st.h / 100, w = 2 * Math.PI * v / st.L, gs = hm / 2 * w * w / g;
    const gentle = st.L / (2 * Math.PI) * Math.sqrt(.3 * g * 2 / hm) * 3.6;
    return { gs, say: gs >= 1 ? ["sbAir", {}, "bad"] : gs > .4 ? ["sbHard", {}, "warnt"] : ["sbOk", {}, "good"],
      rows: [["sbJolt", `${fx(gs, 2)} g`], ["sbGentle", `${Math.round(gentle)} km/h`]], tip: "sbHumpTip" };
  },
  draw(st, r) {
    const base = 210, wpx = st.L * 70, hpx = st.h * 4, x0 = 320 - wpx / 2;
    const pts = []; for (let i = 0; i <= 40; i++) { const x = i / 40; pts.push([x0 + x * wpx, base - hpx * (1 - Math.cos(2 * Math.PI * x)) / 2]); }
    let s = BG() + `<rect x="0" y="${base}" width="640" height="50" class="road"/>`;
    s += `<path d="M0 ${base} L${pts.map(([a, b]) => fx(a) + " " + fx(b)).join(" L")} L640 ${base} L640 260 L0 260 Z" class="road"/>`;
    const lift = clamp(r.gs - 1, 0, 1) * 40;
    s += car(337, base - hpx - 14 - lift, "you", 1.2);
    if (lift > 2) s += Ln(300, base - hpx - 2, 300, base - hpx - lift + 2, "l3dash") + T(260, base - hpx - lift / 2, "↑", "hlab", "end");
    s += hbar(40, 46, 300, 14, r.gs, 1.5, r.gs >= 1 ? "l3badbar" : r.gs > .4 ? "l3heat" : "l3okbar", t1("sbJolt")) + T(348, 58, `${fx(r.gs, 2)} g`, "axis");
    s += Ln(40 + 300 / 1.5, 40, 40 + 300 / 1.5, 66, "l3needle") + T(40 + 300 / 1.5, 80, "1 g", "tiny", "middle");
    return s;
  },
});

def("hillstart", {
  st: { grade: 10, rt: 1 },
  ctl: [["r", "grade", "slGrade", 2, 25, 1, "%"], ["r", "rt", "hsDelay", .5, 2.5, .1, "s", 1]],
  calc(st) {
    const th = Math.atan(st.grade / 100), a = Math.max(0, g * (Math.sin(th) - .015 * Math.cos(th)));
    const roll = a * st.rt * st.rt / 2, cm = Math.round(roll * 100);
    return { roll, th, say: roll > .5 ? ["hsRoll", { cm }, "bad"] : roll > .15 ? ["hsSome", { cm }, "warnt"] : ["hsOk", {}, "good"],
      rows: [["hsBack", `${cm} cm`], ["hsSpeed", `${fx(a * st.rt * 3.6, 1)} km/h`], ["hsHold", `${Math.round(1200 * Math.sin(th))} kg`]], tip: "hsTip" };
  },
  draw(st, r) {
    const ang = -r.th * 180 / Math.PI * 1.6, S = 60, back = Math.min(r.roll, 1.4) * S;
    let s = BG() + `<g transform="rotate(${fx(ang)} 320 170)"><rect x="40" y="170" width="560" height="24" class="road"/>`;
    s += car(220, 156, "lead") + car(380 - back, 156, "you");
    if (back > 2) s += `<path d="M${fx(390)} 128 L${fx(390 - back)} 128" class="l3arrow"/>` + T(390 - back / 2, 120, `${Math.round(r.roll * 100)} cm`, "axis", "middle");
    s += `</g>` + T(320, 240, `${st.grade}%`, "hlab", "middle");
    return s;
  },
});

def("banking", {
  st: { r: 100, bank: 5, surf: "dry" },
  ctl: [["r", "r", "bkRadius", 30, 300, 10, "m"], ["r", "bank", "bkBank", -6, 12, 1, "°"], SURF3],
  calc(st) {
    const mu = MU[st.surf], t = Math.tan(st.bank * DEG);
    const v = Math.sqrt(st.r * g * (mu + t) / Math.max(.05, 1 - mu * t)) * 3.6, f = Math.sqrt(st.r * g * mu) * 3.6;
    return { v, f, say: ["bkSay", { v: Math.round(v), f: Math.round(f) }, st.bank < 0 ? "warnt" : ""],
      rows: [["bkMax", `${Math.round(v)} km/h`], ["bkFlat", `${Math.round(f)} km/h`]], tip: "bkTip" };
  },
  draw(st, r) {
    const tilt = st.bank * 2.2;
    let s = BG() + T(40, 34, t1("bkSection"), "hlab");
    s += `<g transform="rotate(${fx(-tilt)} 200 170)"><rect x="60" y="170" width="280" height="18" class="road"/>${R(165, 140, 70, 30, "l3body", 8)}${R(172, 166, 14, 10, "l3wheel", 3)}${R(214, 166, 14, 10, "l3wheel", 3)}</g>`;
    s += T(80, 230, "← " + t1("bkInside"), "tiny") + T(330, 230, t1("bkOutside") + " →", "tiny", "end");
    const max = Math.max(r.v, r.f) * 1.15;
    s += hbar(400, 90, 200, 14, r.f, max, "l3fillB", t1("bkFlat")) + T(400, 122, `${Math.round(r.f)} km/h`, "axis");
    s += hbar(400, 160, 200, 14, r.v, max, r.v < r.f ? "l3badbar" : "l3okbar", t1("bkMax")) + T(400, 192, `${Math.round(r.v)} km/h`, "axis");
    return s;
  },
});

def("bendsight", {
  st: { r: 60, m: 4, surf: "dry" },
  ctl: [["r", "r", "bkRadius", 20, 200, 5, "m"], ["r", "m", "bsOffset", 1, 10, .5, "m", 1], SURF3],
  calc(st) {
    const S = Math.min(Math.sqrt(8 * st.r * st.m), 2 * st.r * .95), v = vmaxFor(S, 1.5, MU[st.surf]);
    return { S, v, say: ["bsSay", { v: Math.round(v) }, v < 40 ? "warnt" : ""], rows: [["bsSee", `${Math.round(S)} m`], ["bsSafe", `${Math.round(v)} km/h`]], tip: "bsiTip" };
  },
  draw(st, r) {
    const cx = 320, cy = 300, Rp = 230, k = Rp / st.r, phi = Math.asin(clamp(r.S / (2 * st.r), 0, 1));
    const P = (rad, a) => [cx + Math.sin(a) * rad, cy - Math.cos(a) * rad];
    const arc = (rad, a0, a1, cls) => { const [x1, y1] = P(rad, a0), [x2, y2] = P(rad, a1); return `<path d="M${fx(x1)} ${fx(y1)} A${fx(rad)} ${fx(rad)} 0 0 1 ${fx(x2)} ${fx(y2)}" class="${cls}"/>`; };
    let s = BG(640, 300) + arc(Rp, -1.2, 1.2, "l3bendroad");
    const hr = Math.max(Rp - st.m * k, 20);
    s += `<path d="M${cx} ${cy} L${fx(P(hr, -1.2)[0])} ${fx(P(hr, -1.2)[1])} A${fx(hr)} ${fx(hr)} 0 0 1 ${fx(P(hr, 1.2)[0])} ${fx(P(hr, 1.2)[1])} Z" class="l3hedge"/>`;
    const [ax, ay] = P(Rp, -phi), [bx, by] = P(Rp, phi);
    s += Ln(ax, ay, bx, by, "l3sight");
    s += `<g transform="translate(${fx(ax)},${fx(ay)}) rotate(${fx(-phi / DEG + 90)})">${car(17, 0, "you", .8)}</g>`;
    s += `<circle cx="${fx(bx)}" cy="${fx(by)}" r="7" class="l3dot"/>` + T(bx + 12, by - 8, `${Math.round(r.S)} m`, "axis");
    s += T(cx, cy - hr / 2, t1("bsHedge"), "tiny", "middle");
    return s;
  },
  vb: "0 0 640 300",
});

def("gap", {
  st: { kmh: 60, dist: 80, width: 7 },
  ctl: [SPEED(20, 100, "gpSpeed"), ["r", "dist", "gpDist", 20, 200, 5, "m"], ["r", "width", "gpWidth", 3.5, 14, .5, "m", 1]],
  calc(st) {
    const tta = st.dist / (st.kmh / 3.6), need = 1 + Math.sqrt(2 * (st.width + 4.5) / 2), spare = tta - need;
    return { tta, need, say: spare < 1 ? ["gpNo", {}, "bad"] : spare < 2 ? ["gpTight", {}, "warnt"] : ["gpOk", {}, "good"],
      rows: [["gpArrive", `${fx(tta, 1)} s`], ["gpNeed", `${fx(need, 1)} s`]], tip: "gpTip" };
  },
  draw(st, r) {
    const top = 70, wpx = st.width * 10, cross = 560;
    let s = BG() + `<rect x="0" y="${top}" width="640" height="${fx(wpx)}" class="road"/><rect x="${cross - 30}" y="${fx(top + wpx)}" width="60" height="${fx(260 - top - wpx)}" class="road"/>`;
    s += `<g transform="translate(${cross},${fx(top + wpx + 34)}) rotate(-90)">${car(17, 0, "you")}</g>`;
    const ox = cross - st.dist * 2.5;
    s += car(ox, top + wpx * .3, "lead") + Ln(ox + 6, top - 12, cross - 30, top - 12, "l3dash") + T((ox + cross) / 2, top - 18, `${st.dist} m · ${fx(r.tta, 1)} s`, "axis", "middle");
    const max = Math.max(r.tta, r.need) * 1.1;
    s += hbar(40, 200, 420, 10, r.need, max, "l3fillB", t1("gpNeed")) + hbar(40, 238, 420, 10, r.tta, max, r.tta - r.need < 2 ? "l3badbar" : "l3okbar", t1("gpArrive"));
    return s;
  },
});

def("signal", {
  st: { kmh: 50, m: 30 },
  ctl: [SPEED(20, 100), ["r", "m", "sgDist", 5, 150, 5, "m"]],
  calc(st) {
    const w = st.m / (st.kmh / 3.6);
    return { w, say: w < 3 ? ["sgLate", {}, "bad"] : w < 5 ? ["sgShort", {}, "warnt"] : ["sgOk", {}, "good"],
      rows: [["sgWarn", `${fx(w, 1)} s`], ["sgBlinks", `${Math.max(1, Math.round(w * 1.5))}`]], tip: "sgTip" };
  },
  draw(st, r) {
    const X = (m) => 60 + m / 150 * 500, turn = X(150);
    let s = BG() + `<rect x="0" y="100" width="640" height="60" class="road"/><rect x="${fx(turn - 25)}" y="20" width="50" height="80" class="road"/>`;
    s += T(turn, 16 + 8, "↰", "hlab", "middle");
    const start = X(150 - st.m), n = Math.max(1, Math.round(r.w * 1.5));
    for (let i = 0; i < n; i++) { const x = start + (turn - 40 - start) * (n === 1 ? 0 : i / (n - 1)); s += `<circle cx="${fx(x)}" cy="122" r="5" class="l3blink"/>`; }
    s += car(start + 10, 140, "you") + Ln(start, 176, turn, 176, "l3dash") + T((start + turn) / 2, 194, `${st.m} m · ${fx(r.w, 1)} s`, "axis", "middle");
    return s;
  },
});

def("crosswind", {
  st: { wind: 50, veh: "bike", surf: "wet" },
  ctl: [["r", "wind", "cwWind", 10, 100, 5, "km/h"], ["veh", "cwVeh", [["bike", "cwBike"], ["car", "otCar"], ["bus", "otBus"], ["truck", "cwTruck"]]], SURF2],
  calc(st) {
    const V = { bike: [.9, 250], car: [4, 1200], bus: [25, 11000], truck: [30, 7000] }[st.veh];
    const U = st.wind / 3.6, F = .5 * RHO * U * U * V[0], share = F / (V[1] * g * MU[st.surf]);
    return { share, say: share > .35 ? ["cwPush", {}, "bad"] : share > .12 ? ["cwNudge", {}, "warnt"] : ["cwCalm", {}, "good"],
      rows: [["cwForce", `${Math.round(F / g)} kg`], ["cwShare", `${Math.round(share * 100)}%`]], tip: "cwTip" };
  },
  draw(st, r) {
    const size = { bike: [14, 40], car: [34, 70], bus: [44, 150], truck: [46, 140] }[st.veh];
    let s = BG() + `<rect x="200" y="0" width="200" height="260" class="road"/>` + Ln(300, 0, 300, 260, "cl");
    const n = Math.round(st.wind / 15) + 1;
    for (let i = 0; i < n; i++) { const y = 40 + i * (180 / n), L = 40 + st.wind * 1.2; s += `<path d="M${fx(190 - L)} ${fx(y)} L190 ${fx(y)}" class="l3wind"/>`; }
    s += R(250 - size[0] / 2 + r.share * 40, 130 - size[1] / 2, size[0], size[1], st.veh === "bike" ? "bsbk" : st.veh === "car" ? "l3body" : "l3truck", 6);
    s += hbar(430, 110, 180, 14, r.share, 1, r.share > .35 ? "l3badbar" : r.share > .12 ? "l3heat" : "l3okbar", t1("cwShare")) + T(430, 142, `${Math.round(r.share * 100)}%`, "axis");
    return s;
  },
});

/* =================== TWO-WHEELERS =================== */

def("lean", {
  st: { kmh: 40, r: 30, surf: "dry" },
  ctl: [SPEED(10, 100), ["r", "r", "bkRadius", 10, 150, 5, "m"], SURF3],
  calc(st) {
    const v = st.kmh / 3.6, need = v * v / (st.r * g), mu = MU[st.surf], deg = Math.atan(need) / DEG, lim = Math.atan(mu) / DEG;
    return { deg, lim, say: need > mu ? ["lnSlide", {}, "bad"] : need > .8 * mu ? ["lnEdge", {}, "warnt"] : ["lnOk", {}, "good"],
      rows: [["lnAngle", `${Math.round(deg)}°`], ["lnLimit", `${Math.round(lim)}°`]], tip: "lnTip" };
  },
  draw(st, r) {
    const bx = 240, by = 220, len = 150, P = (d) => [bx + Math.sin(d * DEG) * len, by - Math.cos(d * DEG) * len];
    let s = BG() + `<rect x="0" y="${by}" width="640" height="40" class="road"/>`;
    const [lx, ly] = P(r.lim);
    s += Ln(bx, by, lx, ly, "l3dash") + T(lx + 6, ly, t1("lnLimit"), "tiny");
    const d = Math.min(r.deg, 75);
    s += `<g transform="rotate(${fx(d)} ${bx} ${by})"><rect x="${bx - 7}" y="${by - 90}" width="14" height="90" rx="7" class="bsbk"/><rect x="${bx - 11}" y="${by - 140}" width="22" height="56" rx="10" class="l3body"/><circle cx="${bx}" cy="${by - 152}" r="13" class="bshelm"/></g>`;
    s += T(430, 90, `${Math.round(r.deg)}°`, "l3big") + T(430, 112, t1("lnAngle"), "tiny");
    return s;
  },
});

def("bikebrake", {
  st: { kmh: 50, mode: "both", surf: "dry" },
  ctl: [SPEED(20, 100), ["mode", "bbMode", [["rear", "bbRear"], ["front", "bbFront"], ["both", "bbBoth"]]], SURF3],
  calc(st) {
    const mu = MU[st.surf], L = 1.4, b = .7, c = .7, h = .65;
    const acc = { rear: mu * g * b / (L + mu * h), front: Math.min(mu * g * c / (L - mu * h), g * c / h), both: Math.min(mu * g, g * c / h) };
    const v = st.kmh / 3.6, dist = (k) => stopD(v, 1, acc[k] / g);
    return { acc, dist, say: [st.mode === "rear" ? "bbRearSay" : st.mode === "front" ? "bbFrontSay" : "bbBothSay", {}, st.mode === "rear" ? "bad" : st.mode === "front" ? "warnt" : "good"],
      rows: [["bbDecel", `${fx(acc[st.mode] / g, 2)} g`], ["bbStop", `${Math.round(dist(st.mode))} m`]], tip: "bbTip" };
  },
  draw(st, r) {
    const ks = ["rear", "front", "both"], max = r.dist("rear") * 1.1;
    let s = BG() + T(40, 34, t1("bbStop"), "hlab");
    ks.forEach((k, i) => { const y = 66 + i * 58, on = k === st.mode; s += hbar(40, y, 440, on ? 18 : 12, r.dist(k), max, on ? (k === "rear" ? "l3badbar" : "l3okbar") : "l3fillB", t1({ rear: "bbRear", front: "bbFront", both: "bbBoth" }[k])) + T(490, y + 13, `${Math.round(r.dist(k))} m`, on ? "hlab" : "axis"); });
    return s;
  },
});

def("doorzone", {
  st: { gap: 1, kmh: 20 },
  ctl: [["r", "gap", "dzGap", .3, 2, .1, "m", 1], SPEED(10, 40)],
  calc(st) {
    return { say: st.gap < .6 ? ["dzHit", {}, "bad"] : st.gap < 1.05 ? ["dzRisk", {}, "warnt"] : ["dzOk", {}, "good"],
      rows: [["dzDoor", "≈ 1 m"], ["dzReact", `${Math.round(st.kmh / 3.6)} m`]], tip: "dzTip" };
  },
  draw(st) {
    const S = 70, kerb = 80;
    let s = BG() + R(0, 0, 640, kerb, "l3pave", 0) + `<rect x="0" y="${kerb}" width="640" height="180" class="road"/>`;
    s += R(260, kerb + 4, 150, 64, "l3body", 10);
    s += `<path d="M380 ${kerb + 68} L${fx(380 - 1 * S * Math.cos(70 * DEG))} ${fx(kerb + 68 + S * Math.sin(70 * DEG))}" class="l3door"/>`;
    s += `<path d="M380 ${kerb + 68} m-70 0 a70 70 0 0 0 46 66" class="l3dash" fill="none"/>`;
    const y = kerb + 68 + st.gap * S;
    s += `<g transform="translate(250,${fx(y)}) rotate(90)" class="bsbike vis"><rect x="-3" y="-12" width="6" height="24" rx="3" class="bsbk"/><circle r="5" class="bshelm"/></g>`;
    s += Ln(80, kerb + 68, 80, y, "l3arrow") + T(90, (kerb + 68 + y) / 2 + 4, `${fx(st.gap, 1)} m`, "axis");
    return s;
  },
});

/* =================== CRASHES & PROTECTION =================== */

def("childseat", {
  st: { kmh: 50, kg: 15, d: .5 },
  ctl: [SPEED(20, 80), ["r", "kg", "csKg", 5, 35, 1, "kg"], ["r", "d", "csCrumple", .3, 1, .05, "m", 2]],
  calc(st) {
    const v = st.kmh / 3.6, gs = v * v / (2 * st.d) / g, w = st.kg * gs;
    return { w, gs, say: ["csSay", { w: Math.round(w) }, "bad"], rows: [["csDecel", `${Math.round(gs)} g`], ["csWeight", `${Math.round(w)} kg`]], tip: "csTip" };
  },
  draw(st, r) {
    const max = r.w * 1.05;
    let s = BG() + hbar(40, 80, 540, 22, st.kg, max, "l3okbar", t1("csChild")) + T(590, 98, `${st.kg} kg`, "axis", "end");
    s += hbar(40, 160, 540, 22, r.w, max, "l3badbar", t1("csEff")) + T(40, 215, `${Math.round(r.w)} kg`, "l3big");
    return s;
  },
});

def("airbag", {
  st: { cm: 30, belt: "yes" },
  ctl: [["r", "cm", "abgDist", 10, 45, 1, "cm"], YESNO("belt", "abgBelt")],
  calc(st) {
    return { say: st.cm < 25 ? ["abgClose", {}, "bad"] : st.belt === "no" ? ["abgNoBelt", {}, "bad"] : ["abgOk", {}, "good"],
      rows: [["abgGap", `${st.cm} cm`], ["abgNeed", "25 cm+"]], tip: "abgTip" };
  },
  draw(st) {
    const wx = 170, K = 6, px = wx + st.cm * K;
    let s = BG() + R(wx, 70, 25 * K, 120, "l3nozone", 10) + T(wx + 12, 62, t1("abgZone"), "tiny");
    s += Ln(wx - 20, 60, wx + 6, 200, "l3wheelc") + `<ellipse cx="${wx + 40}" cy="130" rx="40" ry="50" class="l3bag"/>`;
    s += R(px, 80, 46, 110, "l3body", 18) + `<circle cx="${px + 26}" cy="62" r="20" class="l3head"/>` + R(px + 10, 190, 110, 22, "l3body", 8);
    if (st.belt === "yes") s += Ln(px + 40, 84, px + 6, 186, "l3belt");
    s += Ln(wx + 6, 228, px, 228, "l3arrow") + T((wx + px) / 2, 248, `${st.cm} cm`, "axis", "middle");
    return s;
  },
});

def("hotcar", {
  st: { amb: 32, min: 20, shade: "no" },
  ctl: [["r", "amb", "hcAmb", 20, 45, 1, "°C"], ["r", "min", "hcMin", 5, 60, 5, "min"], YESNO("shade", "hcShade")],
  calc(st) {
    const rise = st.shade === "yes" ? 10 : 21, T0 = (t) => st.amb + rise * (1 - Math.exp(-t / 19)), t = T0(st.min);
    const k = { t: Math.round(t) };
    return { T0, t, say: t >= 45 ? ["hcDanger", k, "bad"] : t >= 38 ? ["hcHot", k, "bad"] : ["hcWarm", k, "warnt"],
      rows: [["hcInside", `${Math.round(t)} °C`], ["hcRise", `+${Math.round(t - st.amb)} °C`]], tip: "hcTip" };
  },
  draw(st, r) {
    const X = (m) => 60 + m / 60 * 520, Y = (c) => 220 - (c - 15) / 55 * 180;
    const pts = []; for (let m = 0; m <= 60; m += 2) pts.push([m, r.T0(m)]);
    let s = BG() + Ln(60, 220, 580, 220, "gridl") + Ln(60, 40, 60, 220, "gridl") + T(66, 34, t1("hcCurve"), "hlab");
    s += R(60, Y(70), 520, Y(45) - Y(70), "l3nozone", 0) + Ln(60, Y(st.amb), 580, Y(st.amb), "l3dash") + T(576, Y(st.amb) - 6, `${st.amb} °C`, "tiny", "end");
    s += plot(pts, X, Y, "l3curve") + `<circle cx="${fx(X(st.min))}" cy="${fx(Y(r.t))}" r="8" class="l3dot"/>`;
    [0, 15, 30, 45, 60].forEach((m) => { s += T(X(m), 240, `${m}`, "tiny", "middle"); });
    s += T(580, 254, "min", "tiny", "end");
    return s;
  },
});

/* =================== SEEING & ATTENTION =================== */

def("microsleep", {
  st: { kmh: 80, sec: 2 },
  ctl: [SPEED(30, 120), ["r", "sec", "msSec", .5, 5, .5, "s", 1]],
  calc(st) {
    const v = st.kmh / 3.6, d = v * st.sec, stop = stopD(v, 1.5, .7);
    return { d, stop, say: ["msSay", { m: Math.round(d), s: fx(st.sec, 1) }, d > stop ? "bad" : "warnt"],
      rows: [["msDist", `${Math.round(d)} m`], ["msStop", `${Math.round(stop)} m`]], tip: "msTip" };
  },
  draw(st, r) { return distStrip(r.d, r.stop, t1("msTitle"), "msDist"); },
});

def("glare", {
  st: { kmh: 60, sec: 3 },
  ctl: [SPEED(20, 100), ["r", "sec", "glSec", 1, 8, .5, "s", 1]],
  calc(st) {
    const v = st.kmh / 3.6, d = v * st.sec, stop = stopD(v, 1.5, .7);
    return { d, stop, say: ["glSay", { m: Math.round(d) }, d > stop ? "bad" : "warnt"], rows: [["glDist", `${Math.round(d)} m`], ["msStop", `${Math.round(stop)} m`]], tip: "glTip" };
  },
  draw(st, r) {
    let s = distStrip(r.d, r.stop, t1("glTitle"), "glDist");
    s += `<path d="M640 108 L560 70 L560 150 Z" class="l3glare"/>`;
    return s;
  },
});

def("reversezone", {
  st: { veh: "suv", h: .9 },
  ctl: [["veh", "rzVeh", [["hatch", "rzHatch"], ["sedan", "rzSedan"], ["suv", "rzSuv"]]], ["r", "h", "rzChild", .5, 1.5, .05, "m", 2]],
  calc(st) {
    const V = { hatch: [1.15, 1.0, 2.3], sedan: [1.1, .95, 2.9], suv: [1.4, 1.22, 2.6] }[st.veh];
    const blind = Math.max(0, (V[1] - st.h) * V[2] / (V[0] - V[1]) - .4);
    return { V, blind, say: blind > .05 ? ["rzHidden", { h: fx(st.h, 2), m: fx(blind, 1) }, blind > 2 ? "bad" : "warnt"] : ["rzSeen", {}, "good"],
      rows: [["rzBlind", `${fx(blind, 1)} m`]], tip: "rzTip" };
  },
  draw(st, r) {
    const K = 60, gy = 220, ex = 220, sx = ex + r.V[2] * K, Y = (m) => gy - m * K;
    let s = BG() + `<rect x="0" y="${gy}" width="640" height="40" class="road"/>`;
    s += `<path d="M${ex - 120} ${gy - 18} L${ex - 120} ${fx(Y(r.V[1]) + 8)} L${ex - 40} ${fx(Y(r.V[0] + .2))} L${sx - 20} ${fx(Y(r.V[0] + .2))} L${sx} ${fx(Y(r.V[1]))} L${sx + 24} ${fx(Y(r.V[1]))} L${sx + 24} ${gy - 18} Z" class="l3body"/>`;
    s += `<circle cx="${ex - 60}" cy="${gy - 12}" r="16" class="l3wheel"/><circle cx="${sx - 10}" cy="${gy - 12}" r="16" class="l3wheel"/>`;
    s += `<circle cx="${ex}" cy="${fx(Y(r.V[0]))}" r="5" class="l3dot"/>`;
    const slope = (r.V[0] - r.V[1]) / r.V[2], groundX = sx + r.V[1] / slope * K;
    s += `<path d="M${ex} ${fx(Y(r.V[0]))} L${fx(Math.min(groundX, 640))} ${fx(groundX > 640 ? Y(r.V[1] - (640 - sx) / K * slope) : gy)}" class="l3sight"/>`;
    const zx = sx + 24, zl = r.blind * K;
    if (zl > 1) s += `<path d="M${zx} ${gy} L${zx} ${fx(Y(r.V[1] - .4 / r.V[2] * (r.V[0] - r.V[1])))} L${fx(zx + zl)} ${fx(Y(st.h))} L${fx(zx + zl)} ${gy} Z" class="l3blind"/>`;
    const cx = zx + Math.min(zl, 380) * .6 + 10;
    s += `<g transform="translate(${fx(cx)},${gy})"><rect x="-7" y="${fx(-st.h * K + 14)}" width="14" height="${fx(st.h * K - 14)}" rx="6" class="l3fillA"/><circle cy="${fx(-st.h * K + 8)}" r="8" class="l3head"/></g>`;
    return s;
  },
});

/* =================== VEHICLE & ENERGY =================== */

def("evrange", {
  st: { kmh: 80, kwh: 30, ac: "no" },
  ctl: [SPEED(30, 120), ["r", "kwh", "evBatt", 20, 80, 5, "kWh"], YESNO("ac", "evAc")],
  calc(st) {
    const use = (kmh) => { const v = kmh / 3.6, P = (1500 * g * .01 * v + .5 * RHO * .7 * v ** 3) / .85 + (st.ac === "yes" ? 1500 : 300); return P / v / 3.6; };
    const wh = use(st.kmh), range = st.kwh * 1000 / wh;
    return { use, wh, range, say: ["evSay", { k: Math.round(range) }, ""], rows: [["evUse", `${Math.round(wh)} Wh/km`], ["evRange", `${Math.round(range)} km`]], tip: "evTip" };
  },
  draw(st, r) {
    const pts = []; for (let k = 30; k <= 120; k += 5) pts.push([k, st.kwh * 1000 / r.use(k)]);
    const max = Math.max(...pts.map((p) => p[1])) * 1.1, X = (k) => 60 + (k - 30) / 90 * 520, Y = (km) => 220 - km / max * 170;
    let s = BG() + Ln(60, 220, 580, 220, "gridl") + Ln(60, 40, 60, 220, "gridl") + T(66, 34, t1("evCurve"), "hlab");
    s += plot(pts, X, Y, "l3curve") + `<circle cx="${fx(X(st.kmh))}" cy="${fx(Y(r.range))}" r="8" class="l3dot"/>` + T(X(st.kmh) + 12, Y(r.range) - 10, `${Math.round(r.range)} km`, "axis");
    [30, 60, 90, 120].forEach((k) => { s += T(X(k), 240, `${k}`, "tiny", "middle"); });
    s += T(580, 254, "km/h", "tiny", "end");
    return s;
  },
});

def("idling", {
  st: { min: 15, days: 300, lph: .7 },
  ctl: [["r", "min", "idMin", 1, 60, 1, "min"], ["r", "days", "idDays", 50, 365, 5, ""], ["r", "lph", "idRate", .3, 1.5, .1, "L/h", 1]],
  calc(st) {
    const L = st.min / 60 * st.lph * st.days;
    return { L, say: ["idSay", { l: Math.round(L) }, L > 30 ? "warnt" : ""], rows: [["idLitres", `${Math.round(L)} L`], ["idCo2", `${Math.round(L * 2.3)} kg`]], tip: "idTip" };
  },
  draw(st, r) {
    let s = BG() + T(40, 34, t1("idCans"), "hlab");
    const full = Math.floor(r.L / 20), part = r.L / 20 - full, n = Math.min(full + (part > .02 ? 1 : 0), 28);
    for (let i = 0; i < n; i++) {
      const x = 40 + (i % 14) * 41, y = 60 + Math.floor(i / 14) * 92, f = i < full ? 1 : part;
      s += R(x, y, 32, 74, "l3track", 6) + R(x, y + 74 * (1 - f), 32, 74 * f, "l3heat", 6) + R(x + 10, y - 8, 12, 10, "l3track", 2);
    }
    if (r.L / 20 > 28) s += T(600, 240, "…", "hlab", "end");
    return s;
  },
});

def("coasting", {
  st: { kmh: 60, grade: 0 },
  ctl: [SPEED(20, 100), ["r", "grade", "slGrade", -4, 4, .5, "%", 1]],
  calc(st) {
    let v = st.kmh / 3.6, x = 0, t = 0; const pts = [[0, st.kmh]], end = 10 / 3.6, sl = g * Math.sin(Math.atan(st.grade / 100));
    while (v > end && t < 180) { const a = g * .012 + .5 * RHO * .7 * v * v / 1200 + .3 + sl; if (a <= .02) break; v -= a * .2; x += v * .2; t += .2; if (Math.round(t * 5) % 5 === 0) pts.push([x, v * 3.6]); }
    const stops = v <= end;
    return { pts, x, stops, say: stops ? ["coSay", { m: Math.round(x) }, "good"] : ["coNoStop", {}, "warnt"],
      rows: stops ? [["coDist", `${Math.round(x)} m`], ["coTime", `${Math.round(t)} s`]] : [], tip: "coTip" };
  },
  draw(st, r) {
    const mx = Math.max(r.x, 50) * 1.05, X = (m) => 60 + m / mx * 520, Y = (k) => 220 - k / 100 * 170;
    let s = BG() + Ln(60, 220, 580, 220, "gridl") + Ln(60, 40, 60, 220, "gridl") + T(66, 34, t1("coCurve"), "hlab");
    s += plot(r.pts, X, Y, "l3curve") + T(580, 240, `${Math.round(r.x)} m`, "tiny", "end");
    return s;
  },
});

def("tyresize", {
  st: { kmh: 80, pct: 5 },
  ctl: [["r", "kmh", "tsShown", 20, 120, 5, "km/h"], ["r", "pct", "tsPct", -8, 12, 1, "%"]],
  calc(st) {
    const v = st.kmh * (1 + st.pct / 100), k = { v: Math.round(v) };
    return { v, say: st.pct > 0 ? ["tsFaster", k, "warnt"] : st.pct < 0 ? ["tsSlower", k, ""] : ["tsSame", {}, "good"],
      rows: [["tsActual", `${fx(v, 1)} km/h`], ["tsOdo", `${st.pct > 0 ? "+" : ""}${st.pct}%`]], tip: "tsTip" };
  },
  draw(st, r) {
    const cx = 200, cy = 170, rad = 120, A = (k) => (-210 + k / 160 * 240) * DEG;
    let s = BG() + `<path d="M${fx(cx + Math.cos(A(0)) * rad)} ${fx(cy + Math.sin(A(0)) * rad)} A${rad} ${rad} 0 1 1 ${fx(cx + Math.cos(A(160)) * rad)} ${fx(cy + Math.sin(A(160)) * rad)}" class="l3dial"/>`;
    for (let k = 0; k <= 160; k += 20) { const a = A(k); s += Ln(cx + Math.cos(a) * (rad - 14), cy + Math.sin(a) * (rad - 14), cx + Math.cos(a) * (rad + 6), cy + Math.sin(a) * (rad + 6), "l3tick") + T(cx + Math.cos(a) * (rad - 32), cy + Math.sin(a) * (rad - 32) + 4, `${k}`, "tiny", "middle"); }
    const nd = (k, cls) => { const a = A(Math.min(k, 160)); return Ln(cx, cy, cx + Math.cos(a) * (rad - 20), cy + Math.sin(a) * (rad - 20), cls); };
    s += nd(st.kmh, "l3arrow") + nd(r.v, "l3needle");
    const w0 = 60, w1 = 60 * (1 + st.pct / 100);
    s += `<circle cx="470" cy="${fx(220 - w0)}" r="${w0}" class="l3tyre"/><circle cx="470" cy="${fx(220 - w0)}" r="${w0 * .55}" class="l3rim"/>`;
    s += `<circle cx="470" cy="${fx(220 - w1)}" r="${fx(w1)}" class="l3ghostwheel"/>`;
    s += T(470, 248, t1("tsPct") + ` ${st.pct > 0 ? "+" : ""}${st.pct}%`, "tiny", "middle");
    return s;
  },
});
})();
