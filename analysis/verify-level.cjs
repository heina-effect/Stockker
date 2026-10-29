// 1) 불일치 원인 규명 — #2 대조군A day20 +0.501% vs 재현 +0.664%
// 가설: #2는 3.3년 캐시(2023-02-17 시작)에서 i+1>=120 을 요구했다. 그래서 각 종목의
// 120번째 봉 이전(= 2023년 상반기 대부분)이 표본에서 빠졌다. 6년 캐시에서는 2023-01부터
// 이미 120봉이 쌓여 있어 그 구간이 새로 포함된다.
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const SEAL = "20251231";
const H = 20;
const buckets = {};   // 라벨 → [합, 건수]
const add = (k, r) => { const a = buckets[k] || (buckets[k] = [0, 0]); a[0] += r; a[1]++; };

// #2 당시 캐시의 시작일 — 그때 로그상 최저 날짜
const OLD_CACHE_START = "20230217";

for (const s of L.listCachedSymbols()) {
  const p = L.loadCandles(s);
  if (!p?.candles?.length) continue;
  const cs = p.candles.filter((c) => String(c.stck_bsop_date) <= SEAL);
  if (cs.length < 80) continue;
  const dt = cs.map((c) => String(c.stck_bsop_date));
  const cl = cs.map((c) => Number(c.stck_clpr || 0));
  const halted = L.indicatorsFor(cs).map((v) => v.isHalted);

  // #2 환경 재현: 3.3년 캐시였다면 이 종목의 인덱스는 OLD_CACHE_START 부터 0으로 시작한다
  const oldStartIdx = dt.findIndex((d) => d >= OLD_CACHE_START);

  for (let i = 0; i < cl.length; i++) {
    if (dt[i] < "20230101" || dt[i] > SEAL) continue;
    if (halted[i] || !(cl[i] > 0)) continue;
    const e = i + H;
    if (e >= cl.length || !(cl[e] > 0) || dt[e] > SEAL) continue;
    let bad = false;
    for (let k = i; k <= e; k++) if (halted[k]) { bad = true; break; }
    if (bad) continue;
    const r = (cl[e] / cl[i] - 1) * 100;

    const y = dt[i].slice(0, 4);
    const half = +dt[i].slice(4, 6) <= 6 ? "H1" : "H2";
    add("전체(2023~2025)", r);
    add(`${y}${half === "H1" && y === "2023" ? " H1" : half === "H2" && y === "2023" ? " H2" : ""}`.trim(), r);

    // #2 적격조건을 '3.3년 캐시 인덱스'로 재현: 그 캐시에서의 위치가 120봉 이상이어야 함
    const idxInOldCache = oldStartIdx >= 0 ? i - oldStartIdx : -1;
    if (idxInOldCache >= 119 && idxInOldCache >= 21) add("#2 환경 재현(3.3년 캐시 + 120봉)", r);

    // 6년 캐시 기준 120봉 조건(= 내 1차 검증이 쓴 것)
    if (i + 1 >= 120 && i >= 21) add("6년 캐시 + 120봉", r);
  }
}

console.log("=== 20거래일 수익률 평균 — 구간·적격조건별 ===");
const order = ["전체(2023~2025)", "2023 H1", "2023 H2", "2024", "2025", "6년 캐시 + 120봉", "#2 환경 재현(3.3년 캐시 + 120봉)"];
for (const k of order) {
  const a = buckets[k];
  if (!a) continue;
  console.log(`  ${k.padEnd(34)} 평균 ${(a[0] / a[1]).toFixed(4)}% | n=${a[1].toLocaleString()}`);
}
const rep = buckets["#2 환경 재현(3.3년 캐시 + 120봉)"];
if (rep) {
  const v = rep[0] / rep[1];
  console.log(`\n#1/#2 보고값 +0.5010% 와의 차이: ${(v - 0.501).toFixed(4)}%p`);
  console.log(Math.abs(v - 0.501) < 0.1 ? "→ #2 환경을 재현하면 일치. 불일치 원인은 '표본 구간 차이'로 확정." : "→ 재현해도 불일치. 다른 원인 존재.");
}
