// #9 Phase 0 — 수집 유니버스 선정. 추가 API 호출 없이 일봉 캐시만 사용.
// 선정 규칙(사전 확정): 2020~2025 중 '어느 해든' 연평균 거래대금 상위 1,500에 든 종목.
// 과대 포함이 안전하다 — look-ahead 는 수집 단계가 아니라 분석 단계의 시점 필터로 막는다.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const YEARS = ["2020", "2021", "2022", "2023", "2024", "2025"];
const TOP_N = 1500;
const OUT = path.join(L.CACHE_ROOT, "universe-9.json");

// symbol → year → [거래대금 합, 일수]
const agg = new Map();
let scanned = 0;
for (const s of L.listCachedSymbols()) {
  const p = L.loadCandles(s);
  if (!p?.candles?.length) continue;
  scanned++;
  const per = {};
  for (const c of p.candles) {
    const d = String(c.stck_bsop_date || "");
    if (d < "20200101" || d > "20251231") continue;       // 2026 열람 금지
    const y = d.slice(0, 4);
    const v = Number(c.acml_tr_pbmn || 0);
    const cl = Number(c.stck_clpr || 0);
    if (!(cl > 0)) continue;                               // 정지·결측일 제외
    const a = per[y] || (per[y] = [0, 0]);
    a[0] += v; a[1]++;
  }
  agg.set(s, per);
}

// 연도별 랭킹 → 합집합
const picked = new Set();
const byYearTop = {};
for (const y of YEARS) {
  const rows = [];
  for (const [s, per] of agg) {
    const a = per[y];
    if (!a || a[1] < 60) continue;                          // 그 해 거래일 60일 미만은 랭킹 제외
    rows.push([s, a[0] / a[1]]);
  }
  rows.sort((x, z) => z[1] - x[1]);
  const top = rows.slice(0, TOP_N);
  byYearTop[y] = { ranked: rows.length, cut: top.length ? top[top.length - 1][1] : 0 };
  for (const [s] of top) picked.add(s);
}

const list = [...picked].sort();
console.log(`=== #9 수집 유니버스 선정 ===`);
console.log(`캐시 종목 ${scanned.toLocaleString()}개 스캔 (2020~2025 구간)\n`);
console.log(`연도   랭킹대상   상위${TOP_N} 컷(일평균 거래대금)`);
for (const y of YEARS) {
  const b = byYearTop[y];
  console.log(`${y}   ${String(b.ranked).padStart(6)}종목   ${(b.cut / 1e8).toFixed(2)}억원`);
}
console.log(`\n합집합(어느 해든 상위 ${TOP_N}): ${list.length.toLocaleString()}종목`);

// 연도별 포함 종목 수 / 교집합 규모
let allSix = 0;
for (const s of list) {
  const inYears = YEARS.filter((y) => {
    const a = agg.get(s)?.[y];
    if (!a || a[1] < 60) return false;
    return a[0] / a[1] >= byYearTop[y].cut;
  }).length;
  if (inYears === 6) allSix++;
}
console.log(`  6년 모두 상위 ${TOP_N}: ${allSix.toLocaleString()}종목`);
console.log(`  한 해만 들어온 종목 포함 → 과대 포함(의도된 설계)`);

fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), topN: TOP_N, years: YEARS, cuts: byYearTop, symbols: list }, null, 2));
console.log(`\n저장: ${OUT}`);
console.log(`예상 수집 비용: ${list.length} × 50회 = ${(list.length * 50).toLocaleString()}회 × 350ms = ${((list.length * 50 * 0.35) / 3600).toFixed(1)}시간`);
