// #8 PEAD — 실적 공시 후 주가 표류
//
// 설계(사전 등록, 변경 금지):
//   이벤트일 D = 정기보고서 접수일(rcept_dt). 접수일이 비거래일이면 그 이후 첫 거래일을 D로 본다.
//   반응 = D~D+1 누적(= close[D+1]/close[D-1] - 1). 공시가 장마감 후 접수되는 경우가 많아
//          D 하루만 보면 반응을 놓친다.
//   진입 = close[D+BASE_OFF]. 사전 등록 사양은 D+2(= BASE_OFF 2)다. 반응 창 끝(D+1)의
//          종가로 바로 진입하면 소트 변수와 진입가가 같은 봉을 공유해 호가 반동·단기 반전이
//          수익률에 섞인다. 초기 구현이 base 를 close[D+1] 로 잡아 사양에서 이탈했고,
//          PEAD_BASE_OFF=1 로 그 버전을 그대로 재현할 수 있게 남겨 둔다.
//   표류 = close[D+BASE_OFF+h]/close[D+BASE_OFF] - 1, h ∈ {5, 10, 20(주), 60(보조)}.
//          진입일(D+BASE_OFF)이 거래정지·가격 결측이면 그 이벤트를 제외한다.
//   분위 = 같은 분기 안에서 반응 수익률 5분위.
//   비교 = 롱-숏(Q5-Q1) / 롱온리(Q5 - 같은 창 유니버스 동일가중). 판정은 롱온리.
//
// 통계: 분기를 클러스터 단위로(공시가 분기 경계에 몰려 독립 관측 = 분기 수 24개),
//       부호뒤집기 순열 10,000회, 분기 블록 부트스트랩(블록 ≥ 호라이즌), 베타 회귀로 α 분리.
//
// 홀드아웃: 이벤트일·결과일 모두 2025-12-31 이하만 사용. 2026 봉은 로드 시점에 잘라낸다.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");

L.quietKisDebug();

const SEAL = "20251231";
const HORIZONS = [5, 10, 20, 60];
const MAIN_H = 20;
const BASE_OFF = Number(process.env.PEAD_BASE_OFF || 2);   // 진입 = close[D+BASE_OFF] (사양 2, 이탈판 1)
const COST = 0.3;            // 왕복 비용 가정(%)
const NQ = 5;                // 반응 5분위
const Z80 = 2.8016;          // z(0.975)+z(0.80)
const norm = (c) => String(c).trim().toUpperCase().padStart(6, "0");
const UNI_START = "20200101";   // 레벨 대조용 유니버스 구간 시작
const quarterOf = (d) => `${d.slice(0, 4)}Q${Math.floor((+d.slice(4, 6) - 1) / 3) + 1}`;

// ── DART 공시 로드 + 종목별 그룹 ──
function loadFilings() {
  const xml = fs.readFileSync(path.join(L.DART_DIR, "CORPCODE.xml"), "utf8");
  const mapped = new Set();
  const re = /<list>([\s\S]*?)<\/list>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const s = String((m[1].match(/<stock_code>(.*?)<\/stock_code>/) || [])[1] || "").trim();
    if (s) mapped.add(norm(s));
  }
  const all = JSON.parse(fs.readFileSync(path.join(L.DART_DIR, "filings.json"), "utf8"));
  const bySymbol = new Map();
  let used = 0;
  for (const r of all) {
    const s = norm(r.stock_code || "");
    if (!s || !mapped.has(s)) continue;              // DART 법인 매핑 없는 종목(우선주 등) 제외
    if (r.rcept_dt > SEAL) continue;                  // 2026 봉인
    let a = bySymbol.get(s);
    if (!a) { a = []; bySymbol.set(s, a); }
    a.push(r.rcept_dt);
    used++;
  }
  for (const a of bySymbol.values()) a.sort();
  return { bySymbol, used, mappedCount: mapped.size };
}

// ── 단일 패스: 이벤트 지표 + 시장 일별 수익률 동시 집계 ──
function extract(bySymbol) {
  const events = [];
  const mktByDate = new Map();   // date → [수익률 합, 종목 수]
  const uni = [0, 0];            // 같은 기간 전 거래일 20일 선행수익률 합·건수 (레벨 대조용)
  const excl = { noCandles: 0, noDart: 0, dateNotFound: 0, tooEarly: 0, haltWindow: 0, baseMissing: 0, badPrice: 0, sealed: 0 };
  let symbolsUsed = 0, barsUsed = 0;

  for (const symbol of L.listCachedSymbols()) {
    const parsed = L.loadCandles(symbol);
    if (!parsed?.candles?.length) { excl.noCandles++; continue; }
    // 2026 봉인 — 로드 시점에 잘라낸다
    const cs = parsed.candles.filter((c) => String(c.stck_bsop_date) <= SEAL);
    if (cs.length < 80) { excl.noCandles++; continue; }
    symbolsUsed++; barsUsed += cs.length;

    const dt = cs.map((c) => String(c.stck_bsop_date));
    const cl = cs.map((c) => Number(c.stck_clpr || 0));
    const vo = cs.map((c) => Number(c.acml_vol || 0));
    const H = L.haltedDateSet(cs);
    const halted = dt.map((d) => H.has(d));
    const idxOfDate = new Map(dt.map((d, i) => [d, i]));

    // 시장 동일가중 일별 수익률 누적(거래정지일 제외)
    for (let i = 1; i < cs.length; i++) {
      if (halted[i] || cl[i] <= 0 || cl[i - 1] <= 0) continue;
      const r = cl[i] / cl[i - 1] - 1;
      let a = mktByDate.get(dt[i]);
      if (!a) { a = [0, 0]; mktByDate.set(dt[i], a); }
      a[0] += r; a[1]++;
    }

    // 유니버스 20일 선행수익률 — 이벤트와 무관하게 같은 기간 모든 거래일에서
    for (let i = 0; i + MAIN_H < cs.length; i++) {
      const e = i + MAIN_H;
      if (dt[i] < UNI_START || dt[e] > SEAL) continue;
      let ok = cl[i] > 0 && cl[e] > 0;
      if (ok) for (let k = i; k <= e; k++) if (halted[k]) { ok = false; break; }
      if (ok) { uni[0] += (cl[e] / cl[i] - 1) * 100; uni[1]++; }
    }

    const filings = bySymbol.get(norm(symbol));
    if (!filings) { excl.noDart++; continue; }

    for (const rd of filings) {
      // 접수일이 비거래일이면 이후 첫 거래일을 D로 삼는다
      let i0 = idxOfDate.get(rd);
      if (i0 === undefined) {
        i0 = dt.findIndex((d) => d >= rd);
        if (i0 < 0) { excl.dateNotFound++; continue; }
      }
      if (i0 < 1 || i0 + BASE_OFF >= cs.length) { excl.tooEarly++; continue; }

      // 반응 창(D-1 ~ D+1)에 정지·가격 결측이 있으면 제외
      let bad = false;
      for (let k = i0 - 1; k <= i0 + 1; k++) if (halted[k] || !(cl[k] > 0)) bad = true;
      if (bad) { excl.haltWindow++; continue; }

      const reaction = (cl[i0 + 1] / cl[i0 - 1] - 1) * 100;

      // 진입 = close[D+BASE_OFF]. 진입일이 정지·결측이면 체결이 불가능하므로 이벤트에서 뺀다.
      const ib = i0 + BASE_OFF;
      if (halted[ib] || !(cl[ib] > 0)) { excl.baseMissing++; continue; }
      const base = cl[ib], baseDate = dt[ib];
      const drift = {}, endDate = {};
      for (const h of HORIZONS) {
        const e = ib + h;
        if (e >= cs.length) continue;                       // 창 부족
        if (dt[e] > SEAL) { excl.sealed++; continue; }        // 2026 침범
        let bad2 = false;
        for (let k = ib + 1; k <= e; k++) if (halted[k]) { bad2 = true; break; }
        if (bad2 || !(cl[e] > 0)) continue;
        drift[h] = (cl[e] / base - 1) * 100;
        endDate[h] = dt[e];
      }
      if (drift[MAIN_H] === undefined) continue;             // 주 호라이즌이 없으면 표본에서 뺀다
      events.push({ symbol, rd, quarter: quarterOf(rd), reaction, baseDate, drift, endDate });
    }
  }
  return { events, mktByDate, excl, symbolsUsed, barsUsed, uni };
}

// ── 시장 동일가중 누적지수 ──
function buildMarketIndex(mktByDate) {
  const dates = [...mktByDate.keys()].sort();
  const idx = new Map();
  let level = 1;
  for (const d of dates) {
    const [s, n] = mktByDate.get(d);
    if (n > 0) level *= 1 + s / n;
    idx.set(d, level);
  }
  return idx;
}

// ── 통계 유틸 ──
const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => sum(a) / a.length;
function ols(y, x) {
  const n = y.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { alpha: my - b * mx, beta: b, r2: syy === 0 ? 0 : sxy ** 2 / (sxx * syy), n };
}
// 분기 클러스터: 부호뒤집기 순열 + 분기 블록 부트스트랩
function clusterTest(ds, ws, blockLen = 1, iters = 10000, seed = 8080) {
  if (ds.length === 0) return null;
  const sw = sum(ws);
  const obs = sum(ds.map((d, i) => d * ws[i])) / sw;
  let s = seed; const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  let ge = 0;
  for (let it = 0; it < iters; it++) {
    const st = sum(ds.map((d, i) => (rnd() < 0.5 ? -d : d) * ws[i])) / sw;
    if (Math.abs(st) >= Math.abs(obs)) ge++;
  }
  const nBlocks = Math.ceil(ds.length / blockLen);
  const boots = [];
  for (let it = 0; it < iters; it++) {
    let num = 0, den = 0;
    for (let b = 0; b < nBlocks; b++) {
      const start = Math.floor(rnd() * Math.max(1, ds.length - blockLen + 1));
      for (let k = 0; k < blockLen && start + k < ds.length; k++) { num += ds[start + k] * ws[start + k]; den += ws[start + k]; }
    }
    if (den > 0) boots.push(num / den);
  }
  boots.sort((a, b) => a - b);
  const se = Math.sqrt(sum(boots.map((b) => (b - obs) ** 2)) / (boots.length - 1));
  return { obs, p: (ge + 1) / (iters + 1), n: ds.length, events: sw, ci: [boots[Math.floor(boots.length * 0.025)], boots[Math.floor(boots.length * 0.975)]], se, mde: Z80 * se, blockLen };
}

function main() {
  console.log("=== #8 PEAD — 실적 공시 후 주가 표류 ===");
  console.log(`진입 시점: close[D+${BASE_OFF}] ${BASE_OFF === 2 ? "(사전 등록 사양)" : "(사양 이탈 버전 재현)"}`);
  console.log("독립 관측은 분기 수다. 공시가 분기 경계(3월말·5월·8월·11월)에 몰리므로");
  console.log("종목-일 관측치를 독립으로 취급하면 표준오차가 크게 과소추정된다. 아래 모든 검정은");
  console.log("분기를 클러스터로 묶고 분기 블록 부트스트랩으로 신뢰구간을 구한다.\n");

  const { bySymbol, used, mappedCount } = loadFilings();
  console.log(`[입력] DART 상장 매핑 ${mappedCount.toLocaleString()}건 | 2025-12-31 이하 공시 ${used.toLocaleString()}건 / ${bySymbol.size.toLocaleString()}종목`);

  const { events, mktByDate, excl, symbolsUsed, barsUsed, uni } = extract(bySymbol);
  const mkt = buildMarketIndex(mktByDate);
  console.log(`[캔들] 종목 ${symbolsUsed.toLocaleString()} / 봉 ${barsUsed.toLocaleString()} (2026 봉인 적용)`);
  console.log(`[이벤트] 유효 ${events.length.toLocaleString()}건`);
  console.log(`  제외: 캔들없음 ${excl.noCandles} / DART없음 ${excl.noDart} / 날짜범위밖 ${excl.dateNotFound} / 창부족 ${excl.tooEarly} / 반응창정지 ${excl.haltWindow} / 진입일정지·결측 ${excl.baseMissing} / 2026침범 ${excl.sealed}`);

  // 분기 내 반응 5분위
  const byQuarter = new Map();
  for (const e of events) {
    let a = byQuarter.get(e.quarter);
    if (!a) { a = []; byQuarter.set(e.quarter, a); }
    a.push(e);
  }
  const quarters = [...byQuarter.keys()].sort();
  for (const q of quarters) {
    const arr = byQuarter.get(q).sort((a, b) => a.reaction - b.reaction);
    arr.forEach((e, i) => { e.q = Math.min(NQ - 1, Math.floor((i * NQ) / arr.length)); });
  }
  console.log(`[분기] ${quarters.length}개 (${quarters[0]} ~ ${quarters[quarters.length - 1]}), 분기당 평균 ${(events.length / quarters.length).toFixed(0)}건`);

  const mktRet = (from, to) => {
    const a = mkt.get(from), b = mkt.get(to);
    return a && b ? (b / a - 1) * 100 : null;
  };

  // ── 레벨 대조 (필수 게이트) ──
  // drift 와 benchmark 를 같은 이벤트 집합에서 짝지어 비교한다. 유니버스 평균은
  // 같은 기간 모든 거래일의 20일 선행수익률로, 공시일 캘린더 집중 효과를 가늠하는 기준이다.
  const pairs = events
    .map((e) => ({ d: e.drift[MAIN_H], b: mktRet(e.baseDate, e.endDate[MAIN_H]) }))
    .filter((x) => x.b !== null);
  const mD = mean(pairs.map((x) => x.d));
  const mB = mean(pairs.map((x) => x.b));
  const mU = uni[1] ? uni[0] / uni[1] : NaN;
  console.log(`\n${"=".repeat(78)}\n=== 레벨 대조 (${MAIN_H}일) ===`);
  console.log(`  평균 drift_${MAIN_H}      ${mD >= 0 ? "+" : ""}${mD.toFixed(4)}%  | 이벤트 ${pairs.length.toLocaleString()}건`);
  console.log(`  평균 benchmark_${MAIN_H}  ${mB >= 0 ? "+" : ""}${mB.toFixed(4)}%  | 이벤트별 유니버스 동일가중 연쇄지수`);
  console.log(`  차이(초과)          ${mD - mB >= 0 ? "+" : ""}${(mD - mB).toFixed(4)}%p`);
  console.log(`  같은 기간 유니버스 20일 평균 ${mU >= 0 ? "+" : ""}${mU.toFixed(4)}%  | 종목-일 ${uni[1].toLocaleString()}개 (${UNI_START}~${SEAL}, 전 거래일)`);
  console.log(`  benchmark − 유니버스 평균   ${mB - mU >= 0 ? "+" : ""}${(mB - mU).toFixed(4)}%p  ← 공시일 캘린더 집중 효과`);

  // ── 분기별 시계열 산출 ──
  const series = {};   // h → { q, spread, longonly, top, bottom, market, nTop }
  for (const h of HORIZONS) {
    const rows = [];
    for (const q of quarters) {
      const arr = byQuarter.get(q).filter((e) => e.drift[h] !== undefined);
      if (arr.length < NQ * 2) continue;
      const top = arr.filter((e) => e.q === NQ - 1), bot = arr.filter((e) => e.q === 0);
      if (top.length === 0 || bot.length === 0) continue;
      const mTop = mean(top.map((e) => e.drift[h]));
      const mBot = mean(bot.map((e) => e.drift[h]));
      const mMktTop = top.map((e) => mktRet(e.baseDate, e.endDate[h])).filter((v) => v !== null);
      if (mMktTop.length === 0) continue;
      const mMkt = mean(mMktTop);
      rows.push({ q, spread: mTop - mBot, longonly: mTop - mMkt, top: mTop, bottom: mBot, market: mMkt, nTop: top.length });
    }
    series[h] = rows;
  }

  // ── 연도별 분해를 먼저 (부호 일관성) ──
  console.log(`\n${"=".repeat(78)}\n=== 연도별 분해 (주 호라이즌 ${MAIN_H}일, 롱온리) ===`);
  console.log("코로나 국면(2020~2021)이 전체를 끌고 가는지 진단용. 특정 연도를 빼고 재계산하지 않는다.");
  const rowsMain = series[MAIN_H];
  for (const y of ["2020", "2021", "2022", "2023", "2024", "2025"]) {
    const sub = rowsMain.filter((r) => r.q.startsWith(y));
    if (!sub.length) continue;
    const lo = sub.map((r) => r.longonly), sp = sub.map((r) => r.spread);
    console.log(`  ${y}: 분기 ${sub.length} | 롱온리 평균 ${mean(lo) >= 0 ? "+" : ""}${mean(lo).toFixed(3)}%p (양수 ${lo.filter((v) => v > 0).length}/${lo.length}) | 롱-숏 ${mean(sp) >= 0 ? "+" : ""}${mean(sp).toFixed(3)}%p`);
  }

  // ── 호라이즌별 결과 ──
  console.log(`\n${"=".repeat(78)}\n=== 호라이즌별 (분기 클러스터 검정) ===`);
  const result = {};
  for (const h of HORIZONS) {
    const rows = series[h];
    if (!rows.length) continue;
    const ws = rows.map((r) => r.nTop);
    const blockLen = h <= 20 ? 1 : 2;   // 블록 ≥ 호라이즌: 1분기 ≈ 60거래일, 60일 호라이즌은 2분기
    const tSp = clusterTest(rows.map((r) => r.spread), ws, blockLen);
    const tLo = clusterTest(rows.map((r) => r.longonly), ws, blockLen);
    const regSp = ols(rows.map((r) => r.spread), rows.map((r) => r.market));
    const regLo = ols(rows.map((r) => r.longonly), rows.map((r) => r.market));
    const posQ = rows.filter((r) => r.longonly > 0).length;
    result[h] = { tSp, tLo, regSp, regLo, posQ, nQ: rows.length };
    const tag = h === MAIN_H ? " ← 주 호라이즌" : h === 60 ? " (보조)" : "";
    console.log(`\n[D+2부터 ${h}일]${tag} 분기 ${rows.length}개 / Q5 이벤트 ${Math.round(sum(ws)).toLocaleString()}건 / 블록 ${blockLen}분기`);
    console.log(`  롱-숏  평균 ${tSp.obs >= 0 ? "+" : ""}${tSp.obs.toFixed(3)}%p | p=${tSp.p.toFixed(4)} | 95%CI [${tSp.ci[0].toFixed(3)}, ${tSp.ci[1].toFixed(3)}] | MDE ${tSp.mde.toFixed(3)}`);
    console.log(`         회귀 α ${regSp.alpha >= 0 ? "+" : ""}${regSp.alpha.toFixed(3)}%p | β ${regSp.beta.toFixed(3)} | R² ${regSp.r2.toFixed(3)}`);
    console.log(`  롱온리 평균 ${tLo.obs >= 0 ? "+" : ""}${tLo.obs.toFixed(3)}%p | p=${tLo.p.toFixed(4)} | 95%CI [${tLo.ci[0].toFixed(3)}, ${tLo.ci[1].toFixed(3)}] | MDE ${tLo.mde.toFixed(3)}`);
    console.log(`         회귀 α ${regLo.alpha >= 0 ? "+" : ""}${regLo.alpha.toFixed(3)}%p | β ${regLo.beta.toFixed(3)} | R² ${regLo.r2.toFixed(3)}`);
    console.log(`         분기 양수 ${posQ}/${rows.length} | 비용 차감 후 α ${(regLo.alpha - COST).toFixed(3)}%p`);
  }

  // ── 상승/하락 분기 분리 (베타 교란 진단) ──
  console.log(`\n=== 상승/하락 분기 분리 (진단용, 게이트 아님 · ${MAIN_H}일) ===`);
  for (const [label, filt] of [["시장 상승 분기", (r) => r.market > 0], ["시장 하락 분기", (r) => r.market < 0]]) {
    const sub = rowsMain.filter(filt);
    if (!sub.length) continue;
    console.log(`  ${label}: ${sub.length}분기 (시장 평균 ${mean(sub.map((r) => r.market)).toFixed(2)}%) | 롱-숏 ${mean(sub.map((r) => r.spread)).toFixed(3)}%p | 롱온리 ${mean(sub.map((r) => r.longonly)).toFixed(3)}%p`);
  }

  // ── 반응 분위별 표류 (구조 확인) ──
  console.log(`\n=== 반응 5분위별 평균 표류 (${MAIN_H}일) ===`);
  for (let qi = 0; qi < NQ; qi++) {
    const arr = events.filter((e) => e.q === qi && e.drift[MAIN_H] !== undefined);
    console.log(`  Q${qi + 1} (반응 평균 ${mean(arr.map((e) => e.reaction)).toFixed(2)}%): 표류 ${mean(arr.map((e) => e.drift[MAIN_H])).toFixed(3)}% | n=${arr.length.toLocaleString()}`);
  }

  // ── 사전 등록 게이트 ──
  const r = result[MAIN_H];
  console.log(`\n${"=".repeat(78)}\n=== 사전 등록 판정 기준 대입 ===`);
  const g1 = r.regLo.alpha >= 1.0;
  const g2 = r.posQ >= 16;
  const upNeg = mean(rowsMain.filter((x) => x.market > 0).map((x) => x.longonly)) < 0;
  const dnPos = mean(rowsMain.filter((x) => x.market < 0).map((x) => x.longonly)) > 0;
  console.log(`  롱온리 α(${MAIN_H}일) ≥ +1.0%p ? ${r.regLo.alpha.toFixed(3)} → ${g1 ? "충족" : "미충족"}`);
  console.log(`  24분기 중 16분기 이상 양수 ? ${r.posQ}/${r.nQ} → ${g2 ? "충족" : "미충족"}`);
  console.log(`  상승 분기 음수 & 하락 분기만 양수 ? ${upNeg && dnPos ? "해당 → 탈락" : "해당 없음"}`);
  const verdict = (upNeg && dnPos) || !g1 ? "탈락 — 종료"
    : g1 && g2 ? "1차 통과 — #10 또는 홀드아웃 검증"
    : "2차 — 판별 불가(기록하고 #9로)";
  console.log(`\n  → 판정: ${verdict}`);

  const OUT_PATH = path.join(L.CACHE_ROOT, `pead-result-base${BASE_OFF}.json`);
  fs.writeFileSync(OUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(), baseOffset: BASE_OFF, events: events.length, quarters: quarters.length,
    series, result: Object.fromEntries(Object.entries(result).map(([h, v]) => [h, { longonlyAlpha: v.regLo.alpha, longonlyBeta: v.regLo.beta, spreadAlpha: v.regSp.alpha, posQ: v.posQ, nQ: v.nQ, loP: v.tLo.p, loCI: v.tLo.ci }])),
    verdict,
  }, null, 2));
  console.log(`\n저장: ${OUT_PATH}`);
}
main();
