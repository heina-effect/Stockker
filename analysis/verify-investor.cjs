// #9 Phase 1 검산 — 수집 결과의 날짜 연속성·중복·2026 침범 확인.
// 30거래일씩 역방향 연쇄로 받았으므로 구간 경계에서 중복·누락이 날 수 있다. 그걸 본다.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const INV_DIR = path.join(L.CACHE_ROOT, "investor");
const START = "20200101", SEAL = "20251231";
const files = fs.readdirSync(INV_DIR).filter((f) => f.endsWith(".json") && !f.includes("error"));
const symbols = files.map((f) => f.replace(".json", "")).sort();

// 전수 집계
let rowsAll = 0, dupAll = 0, beyondSeal = 0, zeroAll = 0, zeroNoPrice = 0;
const gapSyms = [];
for (const s of symbols) {
  const inv = JSON.parse(fs.readFileSync(path.join(INV_DIR, `${s}.json`), "utf8"));
  const ds = inv.rows.map((r) => String(r.stck_bsop_date));
  rowsAll += ds.length;
  const uniq = new Set(ds);
  dupAll += ds.length - uniq.size;
  for (const d of ds) if (d > SEAL) beyondSeal++;
  const p = L.loadCandles(s);
  const px = new Set();
  for (const c of p?.candles || []) {
    const d = String(c.stck_bsop_date || "");
    if (d >= START && d <= SEAL && Number(c.stck_clpr || 0) > 0) px.add(d);
  }
  // 일봉에는 있는데 수급에 없는 날 = 누락
  let miss = 0;
  for (const d of px) if (!uniq.has(d)) miss++;
  for (const r of inv.rows) {
    const d = String(r.stck_bsop_date);
    const z = Number(r.frgn_ntby_tr_pbmn || 0) === 0 && Number(r.orgn_ntby_tr_pbmn || 0) === 0
      && Number(r.prsn_ntby_tr_pbmn || 0) === 0;
    if (z) { zeroAll++; if (!px.has(d)) zeroNoPrice++; }
  }
  if (miss > 0) gapSyms.push([s, miss, px.size, uniq.size]);
}

console.log(`=== Phase 1 검산 — 종목 ${symbols.length.toLocaleString()} ===`);
console.log(`총 행 ${rowsAll.toLocaleString()} | 날짜 중복 ${dupAll.toLocaleString()} | 2026 행 ${beyondSeal.toLocaleString()}`);
console.log(`전 주체 0 행 ${zeroAll.toLocaleString()} 중 일봉 종가 없음(미상장 등) ${zeroNoPrice.toLocaleString()}`);
console.log(`일봉에는 있으나 수급에 없는 날이 있는 종목: ${gapSyms.length}`);
for (const [s, miss, np, ni] of gapSyms.slice(0, 15)) console.log(`  ${s}: 누락 ${miss} (일봉 ${np} / 수급 ${ni})`);

// 임의 3종목 상세 — 결정적 추출(고정 간격)
console.log(`\n=== 임의 3종목 날짜 연속성 상세 ===`);
for (const s of [symbols[0], symbols[Math.floor(symbols.length / 2)], symbols[symbols.length - 1]]) {
  const inv = JSON.parse(fs.readFileSync(path.join(INV_DIR, `${s}.json`), "utf8"));
  const ds = inv.rows.map((r) => String(r.stck_bsop_date));
  const sorted = [...ds].sort();
  const asc = ds.every((d, i) => i === 0 || d >= ds[i - 1]) || sorted.join() === [...ds].reverse().join();
  const uniq = new Set(ds);
  const p = L.loadCandles(s);
  const px = [...new Set((p?.candles || []).filter((c) => String(c.stck_bsop_date) >= START
    && String(c.stck_bsop_date) <= SEAL && Number(c.stck_clpr || 0) > 0).map((c) => String(c.stck_bsop_date)))].sort();
  const miss = px.filter((d) => !uniq.has(d));
  const extra = [...uniq].filter((d) => !px.includes(d)).sort();
  console.log(`\n${s}: 행 ${ds.length} / 고유일 ${uniq.size} / ${sorted[0]} ~ ${sorted[sorted.length - 1]} / 정렬 ${asc ? "단조" : "비단조"}`);
  console.log(`  중복 ${ds.length - uniq.size}건 | 일봉 유효일 ${px.length}`);
  console.log(`  일봉 O 수급 X (누락) ${miss.length}건${miss.length ? ` → ${miss.slice(0, 8).join(",")}` : ""}`);
  console.log(`  수급 O 일봉 X ${extra.length}건${extra.length ? ` → ${extra.slice(0, 8).join(",")}` : " (미상장·휴장 행 없음)"}`);
  console.log(`  2026 행 ${ds.filter((d) => d > SEAL).length}건`);
}
