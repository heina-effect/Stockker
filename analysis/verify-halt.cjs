// #9 사후 검산 — flow.cjs 의 '정지' 카운터가 실제 거래정지를 잡는지 확인한다.
// 이 코드베이스의 거래정지 판정은 '종가가 5일 이상 연속 완전 동일'(src/server/screening/
// indicators.ts isHaltedSeries)이다. 즉 봉은 존재하고 종가도 > 0 이다. flow.cjs 는 봉 존재
// 여부(has)만 보므로 이 정지를 전혀 걸러내지 않는다. 노출 규모를 센다.
// 읽기 전용. 등록된 결과(flow-result.json)를 건드리지 않는다.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const START = "20200101", SEAL = "20251231";
const TOP_N = 1000, NQ = 5, MIN_ROWS = 100;
const FLOW_W = 5, TURNOVER_W = 20, UNIV_W = 60, MAIN_H = 20;
const INV_DIR = path.join(L.CACHE_ROOT, "investor");

// indicators.ts isHaltedSeries 와 동일 규칙
function haltedSeries(closes, minDays = 5) {
  const n = closes.length, h = new Array(n).fill(false);
  let same = 1;
  for (let i = 1; i < n; i++) {
    if (closes[i] === closes[i - 1]) same++;
    else { if (same >= minDays) for (let j = i - same; j < i; j++) h[j] = true; same = 1; }
  }
  if (same >= minDays) for (let j = n - same; j < n; j++) h[j] = true;
  return h;
}

const symbols = fs.readdirSync(INV_DIR).filter((f) => f.endsWith(".json") && !f.includes("error"))
  .map((f) => f.replace(".json", ""));
const dateSet = new Set(), raw = new Map();
for (const s of symbols) {
  const p = L.loadCandles(s);
  if (!p?.candles?.length) continue;
  const cs = p.candles.filter((c) => { const d = String(c.stck_bsop_date || ""); return d >= START && d <= SEAL && Number(c.stck_clpr || 0) > 0; })
    .sort((a, b) => String(a.stck_bsop_date).localeCompare(String(b.stck_bsop_date)));
  if (!cs.length) continue;
  const hs = haltedSeries(cs.map((c) => Number(c.stck_clpr)));
  const px = new Map();
  cs.forEach((c, i) => { const d = String(c.stck_bsop_date); px.set(d, { cl: Number(c.stck_clpr), tv: Number(c.acml_tr_pbmn || 0), halt: hs[i] }); dateSet.add(d); });
  const inv = JSON.parse(fs.readFileSync(path.join(INV_DIR, `${s}.json`), "utf8"));
  const fl = new Set();
  for (const r of inv.rows || []) { const d = String(r.stck_bsop_date || ""); if (d >= START && d <= SEAL && px.has(d)) fl.add(d); }
  raw.set(s, { px, fl });
}
const dates = [...dateSet].sort(), n = dates.length, di = new Map(dates.map((d, i) => [d, i]));
const series = new Map();
for (const [s, { px, fl }] of raw) {
  const cl = new Float64Array(n), tv = new Float64Array(n);
  const has = new Uint8Array(n), hasF = new Uint8Array(n), halt = new Uint8Array(n);
  for (const [d, v] of px) { const i = di.get(d); cl[i] = v.cl; tv[i] = v.tv; has[i] = 1; halt[i] = v.halt ? 1 : 0; }
  for (const d of fl) hasF[di.get(d)] = 1;
  const ptv = new Float64Array(n + 1), pcnt = new Float64Array(n + 1), pfc = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    ptv[i + 1] = ptv[i] + (has[i] ? tv[i] : 0);
    pcnt[i + 1] = pcnt[i] + (has[i] ? 1 : 0);
    pfc[i + 1] = pfc[i] + (hasF[i] ? 1 : 0);
  }
  series.set(s, { has, halt, ptv, pcnt, pfc });
}

const syms = [...series.keys()];
let final = 0, haltD = 0, haltEntry = 0, haltHold = 0, haltDays = 0, allDays = 0;
for (const S of series.values()) for (let i = 0; i < n; i++) if (S.has[i]) { allDays++; if (S.halt[i]) haltDays++; }

for (let i = UNIV_W - 1; i + 1 < n; i++) {
  const lo = i - UNIV_W + 1, flo = i - FLOW_W + 1, tlo = i - TURNOVER_W + 1;
  const cand = [];
  for (const s of syms) {
    const S = series.get(s);
    if (!S.has[i]) continue;
    const cnt = S.pcnt[i + 1] - S.pcnt[lo];
    if (cnt < UNIV_W * 0.8) continue;
    cand.push([s, (S.ptv[i + 1] - S.ptv[lo]) / cnt]);
  }
  if (cand.length < TOP_N * 0.5) continue;
  cand.sort((a, b) => b[1] - a[1]);
  const rows = [];
  for (const [s] of cand.slice(0, TOP_N)) {
    const S = series.get(s);
    if (S.pfc[i + 1] - S.pfc[flo] < FLOW_W) continue;
    const tcnt = S.pcnt[i + 1] - S.pcnt[tlo];
    const denom = tcnt < TURNOVER_W * 0.8 ? 0 : (S.ptv[i + 1] - S.ptv[tlo]) / tcnt;
    if (!(denom > 0)) continue;
    rows.push(S);
  }
  if (rows.length < MIN_ROWS) continue;
  const e0 = i + 1, e = e0 + MAIN_H;
  for (const S of rows) {
    final++;
    if (S.halt[i]) haltD++;
    if (S.halt[e0]) haltEntry++;
    if (e < n) { for (let k = e0; k <= e; k++) if (S.halt[k]) { haltHold++; break; } }
  }
}

const pct = (a, b) => `${((a / b) * 100).toFixed(3)}%`;
console.log("=== #9 거래정지 노출 검산 (읽기 전용) ===");
console.log(`전체 종목-거래일 ${allDays.toLocaleString()} 중 정지 판정 ${haltDays.toLocaleString()} (${pct(haltDays, allDays)})`);
console.log(`\n분석 유니버스 최종 관측 ${final.toLocaleString()} 기준`);
console.log(`  신호일 D 가 정지                     ${haltD.toLocaleString().padStart(9)} (${pct(haltD, final)})`);
console.log(`  진입일 D+1 이 정지                   ${haltEntry.toLocaleString().padStart(9)} (${pct(haltEntry, final)})`);
console.log(`  보유 구간(D+1~D+21)에 정지일 포함     ${haltHold.toLocaleString().padStart(9)} (${pct(haltHold, final)})`);
console.log(`\n→ flow.cjs 의 '정지·결측 0' 은 '봉 결측 0' 을 뜻한다. 위 정지는 걸러지지 않았다.`);
