// 레벨 대조 게이트 — benchmark_20(이벤트별) 이 유니버스 전 거래일 20일 평균보다
// 왜 높은지 분해한다. 가설: 공시 접수일이 ~96개 날짜 클러스터에 몰려 있어
// 이벤트 가중 시장수익률 = '그 클러스터들의 시장수익률'이고, 전 거래일 평균과 다르다.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const SEAL = "20251231";
const H = 20;
const norm = (c) => String(c).trim().toUpperCase().padStart(6, "0");

const xml = fs.readFileSync(path.join(L.DART_DIR, "CORPCODE.xml"), "utf8");
const mapped = new Set();
{ const re = /<list>([\s\S]*?)<\/list>/g; let m;
  while ((m = re.exec(xml)) !== null) {
    const v = String((m[1].match(/<stock_code>(.*?)<\/stock_code>/) || [])[1] || "").trim();
    if (v) mapped.add(norm(v)); } }
const filings = JSON.parse(fs.readFileSync(path.join(L.DART_DIR, "filings.json"), "utf8"))
  .filter((r) => mapped.has(norm(r.stock_code || "")) && r.rcept_dt <= SEAL);
const bySymbol = new Map();
for (const r of filings) {
  const s = norm(r.stock_code);
  if (!bySymbol.has(s)) bySymbol.set(s, []);
  bySymbol.get(s).push(r.rcept_dt);
}

// 시장 일별 동일가중 + 유니버스 20일 선행수익률(날짜별)
const mktByDate = new Map();
const uniByDate = new Map();     // 시작일 → [20일 수익률 합, 건수]
const baseDates = new Map();     // 이벤트 base 날짜 → 이벤트 수
for (const symbol of L.listCachedSymbols()) {
  const p = L.loadCandles(symbol);
  if (!p?.candles?.length) continue;
  const cs = p.candles.filter((c) => String(c.stck_bsop_date) <= SEAL);
  if (cs.length < 80) continue;
  const dt = cs.map((c) => String(c.stck_bsop_date));
  const cl = cs.map((c) => Number(c.stck_clpr || 0));
  const halted = L.indicatorsFor(cs).map((v) => v.isHalted);
  const idxOf = new Map(dt.map((d, i) => [d, i]));

  for (let i = 1; i < cs.length; i++) {
    if (halted[i] || cl[i] <= 0 || cl[i - 1] <= 0) continue;
    let a = mktByDate.get(dt[i]);
    if (!a) { a = [0, 0]; mktByDate.set(dt[i], a); }
    a[0] += cl[i] / cl[i - 1] - 1; a[1]++;
  }
  for (let i = 0; i + H < cs.length; i++) {
    const e = i + H;
    if (dt[i] < "20200101" || dt[e] > SEAL) continue;
    let ok = cl[i] > 0 && cl[e] > 0;
    if (ok) for (let k = i; k <= e; k++) if (halted[k]) { ok = false; break; }
    if (!ok) continue;
    let a = uniByDate.get(dt[i]);
    if (!a) { a = [0, 0]; uniByDate.set(dt[i], a); }
    a[0] += (cl[e] / cl[i] - 1) * 100; a[1]++;
  }
  const fl = bySymbol.get(norm(symbol));
  if (!fl) continue;
  for (const rd of fl) {
    let i0 = idxOf.get(rd);
    if (i0 === undefined) { i0 = dt.findIndex((d) => d >= rd); if (i0 < 0) continue; }
    const ib = i0 + 2;
    if (i0 < 1 || ib + H >= cs.length) continue;
    let bad = false;
    for (let k = i0 - 1; k <= ib + H; k++) if (halted[k] || !(cl[k] > 0)) { bad = true; break; }
    if (bad) continue;
    baseDates.set(dt[ib], (baseDates.get(dt[ib]) || 0) + 1);
  }
}

const dates = [...mktByDate.keys()].sort();
const idx = new Map();
{ let lv = 1; for (const d of dates) { const [s, n] = mktByDate.get(d); if (n > 0) lv *= 1 + s / n; idx.set(d, lv); } }
const dateList = dates;
const posOf = new Map(dateList.map((d, i) => [d, i]));
const fwd20 = (d) => {               // 연쇄지수 기준 그 날짜부터 20거래일
  const i = posOf.get(d);
  if (i === undefined || i + H >= dateList.length) return null;
  const a = idx.get(d), b = idx.get(dateList[i + H]);
  return a && b ? (b / a - 1) * 100 : null;
};

const sum = (a) => a.reduce((x, y) => x + y, 0);
console.log("=== 레벨 격차 분해: 이벤트 가중 시장수익률 vs 전 거래일 평균 ===\n");

// (1) 전 거래일 평균 (날짜 동일가중 / 종목-일 동일가중)
const allDates = [...uniByDate.keys()].sort();
const uniSymDay = [0, 0];
for (const d of allDates) { uniSymDay[0] += uniByDate.get(d)[0]; uniSymDay[1] += uniByDate.get(d)[1]; }
const mktAllDates = allDates.map(fwd20).filter((v) => v !== null);
console.log(`전 거래일(${allDates.length}일) 20일 선행수익률`);
console.log(`  종목-일 동일가중 유니버스 평균   ${(uniSymDay[0] / uniSymDay[1]).toFixed(4)}%  (n=${uniSymDay[1].toLocaleString()})`);
console.log(`  날짜 동일가중 연쇄지수 평균      ${(sum(mktAllDates) / mktAllDates.length).toFixed(4)}%  (n=${mktAllDates.length}일)`);

// (2) 이벤트 base 날짜만, 이벤트 수 가중 vs 날짜 동일가중
const bdList = [...baseDates.keys()].sort().filter((d) => fwd20(d) !== null);
const wSum = sum(bdList.map((d) => baseDates.get(d)));
const evWeighted = sum(bdList.map((d) => fwd20(d) * baseDates.get(d))) / wSum;
const dateEqual = sum(bdList.map((d) => fwd20(d))) / bdList.length;
console.log(`\n이벤트 base 날짜 ${bdList.length}일 (전 거래일의 ${((bdList.length / allDates.length) * 100).toFixed(1)}%), 이벤트 ${wSum.toLocaleString()}건`);
console.log(`  이벤트 수 가중 평균              ${evWeighted.toFixed(4)}%  ← pead.cjs 의 benchmark_20`);
console.log(`  같은 날짜들 날짜 동일가중 평균    ${dateEqual.toFixed(4)}%`);
console.log(`  → 가중 방식 차이 기여            ${(evWeighted - dateEqual).toFixed(4)}%p`);
console.log(`  → 날짜 선택(공시일) 기여          ${(dateEqual - sum(mktAllDates) / mktAllDates.length).toFixed(4)}%p`);

// (3) 상위 기여 날짜 클러스터
console.log(`\n상위 기여 날짜 (이벤트수 × 시장수익률 기준 상위 12)`);
const contrib = bdList.map((d) => ({ d, n: baseDates.get(d), r: fwd20(d), c: (baseDates.get(d) * fwd20(d)) / wSum }));
contrib.sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
for (const c of contrib.slice(0, 12)) {
  console.log(`  ${c.d}  이벤트 ${String(c.n).padStart(5)}건 (${((c.n / wSum) * 100).toFixed(2)}%)  시장 20일 ${c.r >= 0 ? "+" : ""}${c.r.toFixed(2)}%  → 기여 ${c.c >= 0 ? "+" : ""}${c.c.toFixed(4)}%p`);
}

// (4) 연도별 — 이벤트 가중 vs 전 거래일
console.log(`\n연도별 대조 (20일)`);
console.log(`  연도    이벤트가중 benchmark   전거래일 날짜평균   이벤트수`);
for (const y of ["2020", "2021", "2022", "2023", "2024", "2025"]) {
  const sub = bdList.filter((d) => d.startsWith(y));
  if (!sub.length) continue;
  const w = sum(sub.map((d) => baseDates.get(d)));
  const ev = sum(sub.map((d) => fwd20(d) * baseDates.get(d))) / w;
  const ad = allDates.filter((d) => d.startsWith(y)).map(fwd20).filter((v) => v !== null);
  console.log(`  ${y}   ${ev >= 0 ? " " : ""}${ev.toFixed(4)}%${" ".repeat(13)}${sum(ad) / ad.length >= 0 ? " " : ""}${(sum(ad) / ad.length).toFixed(4)}%${" ".repeat(10)}${w.toLocaleString()}`);
}

// (5) 월별 (캘린더 집중)
console.log(`\n월별 대조 (이벤트 base 날짜가 몰린 달 확인)`);
for (let m = 1; m <= 12; m++) {
  const mm = String(m).padStart(2, "0");
  const sub = bdList.filter((d) => d.slice(4, 6) === mm);
  const ad = allDates.filter((d) => d.slice(4, 6) === mm).map(fwd20).filter((v) => v !== null);
  if (!sub.length) { console.log(`  ${mm}월  이벤트 없음${" ".repeat(26)}전거래일 ${(sum(ad) / ad.length).toFixed(3)}%`); continue; }
  const w = sum(sub.map((d) => baseDates.get(d)));
  const ev = sum(sub.map((d) => fwd20(d) * baseDates.get(d))) / w;
  console.log(`  ${mm}월  이벤트 ${String(w).padStart(6)}건 (${((w / wSum) * 100).toFixed(1)}%)  benchmark ${ev >= 0 ? "+" : ""}${ev.toFixed(3)}%   전거래일 ${(sum(ad) / ad.length) >= 0 ? "+" : ""}${(sum(ad) / ad.length).toFixed(3)}%`);
}
