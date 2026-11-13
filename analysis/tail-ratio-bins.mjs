// 윗꼬리(tail_ratio) 4구간 측정 — 2026-11-13 1회 실행(14·15-2). 구간 경계는 실행 전에 고정했다. 바꿔 다시 돌리지 않는다.
// docs/release/known-issues.md "윗꼬리(tail_ratio)는 결과를 예측하지 못한다" 의 숫자가 이 스크립트에서 나왔다.
//
// 모집단: overnight_screening_items 중 tail_ratio 가 있고 stock_trajectory 궤적이 있는 건. 07-03 소급 시드 제외.
//         분류로 거르지 않는다. 자본변동(corporate-actions.ts 목록)이 발굴일 다음 날~3거래일차에 든 건 제외.
// 구간: A ≤3.5 / B 3.5~7 / C 7~12 / D >12. day1·day3 = 발굴일 종가 → trading_calendar 기준 1·3번째 거래일 종가.
// 판정: A 평균이 B·C·D 각각보다 높고 차이 ≥ 2 × √(SE_A²+SE_X²) 이면 유지, 아니면 제거. 엇갈리면 day3. n<30 구간이 결론을 좌우하면 판별 불가.
// 비용: 왕복 0.257%p (차감 전후 판정 동일).
//
// 실행: node analysis/tail-ratio-bins.mjs [출력 디렉터리]   (읽기 전용 — select 만 한다)
// 원자료는 출력 디렉터리(기본 ~/stockker-logs/tail-ratio-20261113)에 JSON 으로 남긴다. 전략 수치라 레포에 넣지 않는다.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = process.argv[2] || path.join(os.homedir(), "stockker-logs", "tail-ratio-20261113");
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;

async function all(p) {
  const out = []; let from = 0;
  for (;;) {
    const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json(); out.push(...j); if (j.length < 1000) break; from += 1000;
  }
  return out;
}

// corporate-actions.ts 의 기준 변경일 (2026-11-13 시점 목록)
const CA = [["321370","20260707"],["001210","20260731"],["196170","20260805"],["062970","20260807"],["090410","20260831"],["225190","20260928"],["207940","20261002"],["368600","20261022"],["018000","20261104"]];
const COST = 0.257, NMIN = 30;
const bin = (t) => (t <= 3.5 ? "A" : t <= 7 ? "B" : t <= 12 ? "C" : "D");
const stat = (a) => {
  const n = a.length; if (!n) return { n: 0 };
  const m = a.reduce((x, y) => x + y, 0) / n; const s = [...a].sort((x, y) => x - y);
  const med = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const sd = Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (n - 1));
  return { n, mean: m, meanAfterCost: m - COST, median: med, medianAfterCost: med - COST, sd, se: sd / Math.sqrt(n) };
};
const judge = (bins) => {
  const A = bins.A; const cmp = {}; let fail = false, small = A.n < NMIN;
  for (const X of "BCD") {
    const x = bins[X]; const d = A.mean - x.mean, se = Math.sqrt(A.se ** 2 + x.se ** 2);
    cmp[X] = { diff: d, seDiff: se, ratio: d / se, pass: d > 0 && d >= 2 * se };
    if (x.n < NMIN) small = true; else if (!cmp[X].pass && A.n >= NMIN) fail = true;
  }
  return { cmp, verdict: fail ? "제거" : small ? "판별 불가" : "유지" };
};

const items = await all("overnight_screening_items?select=id,date,symbol,name,classification,reasons,entry_close,tail_ratio&order=id.asc");
const traj = await all("stock_trajectory?select=symbol,discovery_date,trade_date,days_after,close,is_halted&days_after=gte.0&days_after=lte.10&order=id.asc");
const cal = (await all("trading_calendar?select=trade_date&order=trade_date.asc")).map((r) => r.trade_date);

const groups = new Map();
for (const r of traj) { const k = `${r.symbol}|${r.discovery_date}`; if (!groups.has(k)) groups.set(k, new Map()); groups.get(k).set(r.trade_date, r); }
const nth = (d, k) => { const i = cal.indexOf(d); return i < 0 ? null : cal[i + k] ?? null; };
const log = { total: items.length, seed: 0, noTail: 0, noTraj: 0, corporateAction: 0 };
const rows = [];
for (const it of items) {
  if (it.reasons.includes("과거 소급 시드 입력")) { log.seed++; continue; }
  if (it.tail_ratio == null) { log.noTail++; continue; }
  const G = groups.get(`${it.symbol}|${it.date}`); if (!G) { log.noTraj++; continue; }
  const d1 = nth(it.date, 1), d3 = nth(it.date, 3), lim = d3 ?? cal.at(-1);
  if (CA.some(([s, d]) => s === it.symbol && d > it.date && d <= lim)) { log.corporateAction++; continue; }
  const day0 = G.get(it.date); const entry = day0 && Number(day0.close) > 0 ? Number(day0.close) : Number(it.entry_close);
  const ret = (d) => (d && G.get(d) ? (Number(G.get(d).close) / entry - 1) * 100 : null);
  rows.push({ date: it.date, symbol: it.symbol, classification: it.classification, tail: Number(it.tail_ratio), bin: bin(Number(it.tail_ratio)), day1: ret(d1), day3: ret(d3) });
}

const result = { log, rows: rows.length, symbols: new Set(rows.map((r) => r.symbol)).size, byRow: {}, bySymbol: {} };
for (const h of ["day1", "day3"]) {
  const byRow = {}, bySym = {};
  for (const B of "ABCD") {
    const R = rows.filter((r) => r.bin === B && r[h] != null);
    byRow[B] = { ...stat(R.map((r) => r[h])), symbols: new Set(R.map((r) => r.symbol)).size };
    const m = new Map(); for (const r of R) { if (!m.has(r.symbol)) m.set(r.symbol, []); m.get(r.symbol).push(r[h]); }
    bySym[B] = stat([...m.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length));
  }
  result.byRow[h] = { bins: byRow, ...judge(byRow) };
  result.bySymbol[h] = { bins: bySym, ...judge(bySym) };
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "rows.json"), JSON.stringify(rows));
fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, (k, v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v), 1));
