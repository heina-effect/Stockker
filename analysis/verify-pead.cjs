// #8 산수 검증 — 분석이 아니라 레벨·인덱싱·벤치마크 확인용
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const SEAL = "20251231";
const norm = (c) => String(c).trim().toUpperCase().padStart(6, "0");

// ── 종목별 시계열 로더(2026 봉인) ──
function loadSeries(symbol) {
  const p = L.loadCandles(symbol);
  if (!p?.candles?.length) return null;
  const cs = p.candles.filter((c) => String(c.stck_bsop_date) <= SEAL);
  if (cs.length < 80) return null;
  return {
    dt: cs.map((c) => String(c.stck_bsop_date)),
    cl: cs.map((c) => Number(c.stck_clpr || 0)),
    halted: L.indicatorsFor(cs).map((v) => v.isHalted),
  };
}

const symbols = L.listCachedSymbols();

// ─────────────────────────────────────────────────────────
// 1) 2023~2025 전 종목 20거래일 수익률 평균 — #1 대조군A day20 +0.501% 대조
// ─────────────────────────────────────────────────────────
console.log("=== 1) 20거래일 수익률 평균 (2023-01-01~2025-12-31) ===");
console.log("#1 백테스트의 대조군A day20 기대값 +0.501% 과 대조한다.");
console.log("#2 와 동일 적격조건(120봉 이력 + 사전변동성 21봉 + day0 미정지)으로도 따로 산출.\n");

let loose = { sum: 0, n: 0 }, strict = { sum: 0, n: 0 };
const H = 20;
for (const s of symbols) {
  const ser = loadSeries(s);
  if (!ser) continue;
  const { dt, cl, halted } = ser;
  for (let i = 0; i < cl.length; i++) {
    if (dt[i] < "20230101" || dt[i] > SEAL) continue;
    if (halted[i] || !(cl[i] > 0)) continue;
    const e = i + H;
    if (e >= cl.length || !(cl[e] > 0) || dt[e] > SEAL) continue;
    let bad = false;
    for (let k = i; k <= e; k++) if (halted[k]) { bad = true; break; }
    if (bad) continue;
    const r = (cl[e] / cl[i] - 1) * 100;
    loose.sum += r; loose.n++;
    if (i + 1 >= 120 && i >= 21) { strict.sum += r; strict.n++; }
  }
}
console.log(`느슨한 조건 (정지만 제외):      평균 ${(loose.sum / loose.n).toFixed(4)}% | n=${loose.n.toLocaleString()}`);
console.log(`#2 동일 적격조건 (120봉+21봉):  평균 ${(strict.sum / strict.n).toFixed(4)}% | n=${strict.n.toLocaleString()}`);
console.log(`#1 대조군A day20 기대값:        +0.5010%`);
const diff = Math.abs(strict.sum / strict.n - 0.501);
console.log(`→ 차이 ${diff.toFixed(4)}%p ${diff < 0.1 ? "— 일치(재현 확인)" : "— 표본 구간 차이(아래 참조)"}`);
if (diff >= 0.1) {
  // 2026-10-27 규명 완료: #1/#2 는 3.3년 캐시(2023-02-17 시작)에서 120봉 워밍업을 요구해
  // 각 종목의 120번째 봉이 2023년 8월경에야 도달 → 2023 상반기(20일 평균 +1.73%)가 통째로
  // 빠진 표본이었다. verify-level.cjs 가 그 환경을 재현해 +0.5020% (보고값 +0.5010%, 차이
  // 0.0010%p)를 얻었다. 계산 결함이 아니라 표본 구간 차이다.
  console.log("   원인: #1/#2 는 3.3년 캐시 + 120봉 워밍업으로 2023 상반기가 표본에서 제외됐다.");
  console.log("   그 환경을 재현하면 +0.5020% (보고값과 0.0010%p 차이) — verify-level.cjs 참조.");
}

// ─────────────────────────────────────────────────────────
// 2) 임의 이벤트 3건 손 검산
// ─────────────────────────────────────────────────────────
// 진입 시점 — 사전 등록 사양은 close[D+2]. PEAD_BASE_OFF=1 로 사양 이탈 버전도 재현 가능.
const BASE_OFF = Number(process.env.PEAD_BASE_OFF || 2);
const END_OFF = BASE_OFF + 20;
console.log(`\n${"=".repeat(78)}\n=== 2) 이벤트 3건 손 검산 (거래일 인덱싱 확인) ===`);
console.log(`진입 = close[D+${BASE_OFF}] ${BASE_OFF === 2 ? "(사전 등록 사양)" : "(사양 이탈 버전)"} / 종점 = close[D+${END_OFF}]`);
const xml = fs.readFileSync(path.join(L.DART_DIR, "CORPCODE.xml"), "utf8");
const mapped = new Set();
{
  const re = /<list>([\s\S]*?)<\/list>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const v = String((m[1].match(/<stock_code>(.*?)<\/stock_code>/) || [])[1] || "").trim();
    if (v) mapped.add(norm(v));
  }
}
const filings = JSON.parse(fs.readFileSync(path.join(L.DART_DIR, "filings.json"), "utf8"))
  .filter((r) => mapped.has(norm(r.stock_code || "")) && r.rcept_dt <= SEAL);

// 재현 가능하게 고정 시드로 3건 추출
let seed = 20261027;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const picks = [];
while (picks.length < 3) {
  const r = filings[Math.floor(rnd() * filings.length)];
  const sym = norm(r.stock_code);
  if (!symbols.includes(sym)) continue;
  const ser = loadSeries(sym);
  if (!ser) continue;
  let i0 = ser.dt.indexOf(r.rcept_dt);
  if (i0 < 0) i0 = ser.dt.findIndex((d) => d >= r.rcept_dt);
  if (i0 < 1 || i0 + END_OFF >= ser.cl.length) continue;
  if (ser.halted.slice(i0 - 1, i0 + END_OFF + 1).some(Boolean)) continue;
  picks.push({ r, sym, ser, i0 });
}

const handChecked = [];
for (const { r, sym, ser, i0 } of picks) {
  const { dt, cl } = ser;
  const isTradingDay = dt[i0] === r.rcept_dt;
  console.log(`\n--- ${sym} | ${r.corp_name} | ${r.report_nm}`);
  console.log(`  접수일(rcept_dt) ${r.rcept_dt} → ${isTradingDay ? "거래일" : `비거래일, 이후 첫 거래일 ${dt[i0]} 사용`}`);
  const labels = [["D-1", i0 - 1], ["D", i0], ["D+1", i0 + 1], ["D+2", i0 + 2], [`D+${END_OFF}`, i0 + END_OFF], [`D+${END_OFF + 1}`, i0 + END_OFF + 1]];
  for (const [lab, ix] of labels) {
    if (ix >= cl.length) continue;
    const mark = ix === i0 + BASE_OFF ? "  ← 진입(base)" : ix === i0 + END_OFF ? "  ← 종점" : "";
    console.log(`  ${lab.padEnd(5)} idx=${ix} 날짜 ${dt[ix]} 종가 ${cl[ix].toLocaleString()}${mark}`);
  }
  const reaction = (cl[i0 + 1] / cl[i0 - 1] - 1) * 100;
  const drift20 = (cl[i0 + END_OFF] / cl[i0 + BASE_OFF] - 1) * 100;
  console.log(`  손계산 reaction = (${cl[i0 + 1]} / ${cl[i0 - 1]} - 1)×100 = ${reaction.toFixed(4)}%`);
  console.log(`  손계산 drift_20 = (${cl[i0 + END_OFF]} / ${cl[i0 + BASE_OFF]} - 1)×100 = ${drift20.toFixed(4)}%`);
  console.log(`  base 날짜 확인: D+${BASE_OFF} = ${dt[i0 + BASE_OFF]} (접수일 ${r.rcept_dt} 기준 ${BASE_OFF}거래일 뒤)`);
  // 거래일 수 확인: 진입(D+BASE_OFF) 다음 세션부터 종점까지 몇 세션인가
  const sessions = END_OFF - BASE_OFF;
  console.log(`  표류 구간 세션 수: idx ${i0 + BASE_OFF + 1}~${i0 + END_OFF} = ${sessions}거래일 (날짜 ${dt[i0 + BASE_OFF + 1]} ~ ${dt[i0 + END_OFF]})`);
  console.log(`  → ${sessions === 20 ? "정확히 20거래일 ✓" : "20거래일 아님 ✗"}`);
  handChecked.push({ sym, rd: r.rcept_dt, baseDate: dt[i0 + BASE_OFF], endDate: dt[i0 + END_OFF], reaction, drift20 });
}

// 스크립트(pead.cjs)와 동일 로직으로 재계산해 대조
console.log(`\n--- pead.cjs 로직 재현 대조 ---`);
for (const h of handChecked) {
  const ser = loadSeries(h.sym);
  let i0 = ser.dt.indexOf(h.rd);
  if (i0 < 0) i0 = ser.dt.findIndex((d) => d >= h.rd);
  const reaction = (ser.cl[i0 + 1] / ser.cl[i0 - 1] - 1) * 100;
  const drift = (ser.cl[i0 + BASE_OFF + 20] / ser.cl[i0 + BASE_OFF] - 1) * 100;
  const ok = Math.abs(reaction - h.reaction) < 1e-9 && Math.abs(drift - h.drift20) < 1e-9;
  console.log(`  ${h.sym} ${h.rd}: reaction ${reaction.toFixed(4)}% / drift_20 ${drift.toFixed(4)}% → ${ok ? "손계산과 일치 ✓" : "불일치 ✗"}`);
}

// ─────────────────────────────────────────────────────────
// 3) 유니버스 동일가중 벤치마크 검산
// ─────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(78)}\n=== 3) 유니버스 동일가중 벤치마크 검산 ===`);
console.log("pead.cjs는 '일별 동일가중 수익률의 연쇄 누적지수'를 쓴다(= 매일 리밸런싱).");
console.log("독립 검증으로 '같은 창의 개별 종목 보유수익률 단순평균'(= 매수후보유)도 계산해 비교한다.\n");

// 일별 동일가중 지수 재구성
const mktByDate = new Map();
for (const s of symbols) {
  const ser = loadSeries(s);
  if (!ser) continue;
  const { dt, cl, halted } = ser;
  for (let i = 1; i < cl.length; i++) {
    if (halted[i] || cl[i] <= 0 || cl[i - 1] <= 0) continue;
    let a = mktByDate.get(dt[i]);
    if (!a) { a = [0, 0]; mktByDate.set(dt[i], a); }
    a[0] += cl[i] / cl[i - 1] - 1; a[1]++;
  }
}
const idx = new Map();
{
  let lv = 1;
  for (const d of [...mktByDate.keys()].sort()) { const [sm, n] = mktByDate.get(d); if (n > 0) lv *= 1 + sm / n; idx.set(d, lv); }
}
const chained = (a, b) => (idx.get(b) / idx.get(a) - 1) * 100;

// 매수후보유 동일가중: 같은 창에서 전 종목 보유수익률 단순평균
function buyHold(from, to) {
  let sm = 0, n = 0;
  for (const s of symbols) {
    const ser = loadSeries(s);
    if (!ser) continue;
    const a = ser.dt.indexOf(from), b = ser.dt.indexOf(to);
    if (a < 0 || b < 0 || b <= a) continue;
    if (ser.halted.slice(a, b + 1).some(Boolean)) continue;
    if (!(ser.cl[a] > 0) || !(ser.cl[b] > 0)) continue;
    sm += ser.cl[b] / ser.cl[a] - 1; n++;
  }
  return { mean: (sm / n) * 100, n };
}

for (const h of handChecked) {
  const ch = chained(h.baseDate, h.endDate);
  const bh = buyHold(h.baseDate, h.endDate);
  console.log(`  ${h.sym} 창 ${h.baseDate}~${h.endDate}`);
  console.log(`    연쇄지수(pead.cjs 사용) ${ch.toFixed(4)}% | 매수후보유 평균 ${bh.mean.toFixed(4)}% (n=${bh.n.toLocaleString()}) | 차이 ${(ch - bh.mean).toFixed(4)}%p`);
  console.log(`    이 이벤트 초과수익: 연쇄 기준 ${(h.drift20 - ch).toFixed(4)}%p / 보유 기준 ${(h.drift20 - bh.mean).toFixed(4)}%p`);
}

// 이벤트별로 다른 값이 쓰이는지(전체 평균이 아닌지) 확인
console.log(`\n  이벤트별 벤치마크가 서로 다른가:`);
const uniq = new Set(handChecked.map((h) => chained(h.baseDate, h.endDate).toFixed(4)));
console.log(`    3건의 연쇄지수 벤치마크: ${handChecked.map((h) => chained(h.baseDate, h.endDate).toFixed(3) + "%").join(" / ")}`);
console.log(`    서로 다른 값 ${uniq.size}개 → ${uniq.size > 1 ? "이벤트별 계산 확인 ✓ (전체 평균 아님)" : "전부 동일 — 전체 평균 의심 ✗"}`);

// 두 추정 방식의 체계적 격차 — α 수준(0.04%p)에 영향을 주는지
console.log(`\n  두 방식의 체계적 격차 (20거래일 창 30개 표본):`);
const dates = [...idx.keys()].sort().filter((d) => d >= "20200201" && d <= "20251130");
let gaps = [];
for (let k = 0; k < 30; k++) {
  const a = dates[Math.floor((k / 30) * (dates.length - 25))];
  const ai = dates.indexOf(a);
  const b = dates[ai + 20];
  if (!b) continue;
  const bh = buyHold(a, b);
  gaps.push(chained(a, b) - bh.mean);
}
const gm = gaps.reduce((x, y) => x + y, 0) / gaps.length;
const gsd = Math.sqrt(gaps.reduce((x, y) => x + (y - gm) ** 2, 0) / (gaps.length - 1));
console.log(`    평균 격차 ${gm.toFixed(4)}%p (표준편차 ${gsd.toFixed(4)}) | n=${gaps.length}창`);
// 사양 복원판(base=D+2) 롱온리 α = -0.211%p. 이탈판(base=D+1)은 -0.041%p였다.
const ALPHA_ABS = BASE_OFF === 2 ? 0.211 : 0.041;
console.log(`    → #8 롱온리 α(${BASE_OFF === 2 ? "-0.211" : "-0.041"}%p) 대비 ${Math.abs(gm) > ALPHA_ABS ? "격차가 더 크다 — 추정 방식이 결론에 영향 가능 ⚠" : "격차가 작다 — 결론에 영향 없음"}`);
