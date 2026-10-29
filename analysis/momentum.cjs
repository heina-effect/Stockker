// #10 — 모멘텀(12-1) × 외국인 수급 독립 이중 정렬. 각자의 독립 효과 분리.
//
// 사전 등록(analysis/hypothesis-log.md "#10 사전 등록" 절)대로만 산출한다.
//   momentum = close[D-21]/close[D-252] - 1          (거래일 축, 두 봉 모두 있어야 함)
//   flow     = (D-4..D 외국인 순매수금액 ×1e6) / (D-19..D 평균 거래대금)   ← #9 와 동일
//   유니버스 = D 포함 직전 60거래일 평균 거래대금 상위 1,000 (매일 재선정)
//   정렬     = flow 5분위 × momentum 5분위 독립 → 25칸
//   (1) 수급 통제 모멘텀 = flow 각 분위의 mom Q5 칸 5개를 칸 평균 후 동일가중
//   (2) 모멘텀 통제 수급 = mom 각 분위의 flow Q5 칸 5개를 칸 평균 후 동일가중
//       종목 풀링이 아니라 칸 평균이다 — 독립 정렬에서 풀링하면 단일 정렬과 같은 집합이 된다.
//   진입 close[D+1], 표류 close[D+1+k]/close[D+1] - 1, k ∈ {20, 60(주), 120}
//   판정 = 60일 롱온리 OLS α 연환산(×246/h), Bonferroni p 는 블록 부트스트랩(α 재추정)
//
// 거래정지는 bt-lib.cjs haltedDateSet (#8 방식): D 정지면 후보 제외, 보유 구간에 정지일이나
// 봉 결측이 있으면 그 호라이즌에서 제외.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const START = "20200101";
const SEAL = "20251231";                  // 2026 열람 금지
const HORIZONS = [20, 60, 120];
const MAIN_H = 60;
const BLOCK = { 20: 1, 60: 2, 120: 3 };   // 분기 블록 길이 ≥ 호라이즌 (1분기 ≈ 62거래일)
const TOP_N = 1000;
const NQ = 5;
const MIN_ROWS = 100;
const FLOW_W = 5, TURNOVER_W = 20, UNIV_W = 60;
const MOM_LONG = 252, MOM_SKIP = 21;
const YEAR_DAYS = 246;                    // 6년 1,473거래일 ÷ 6 ≈ 245.5
const COST = 0.3;                         // 왕복 비용(%) / 회
const ALPHA_BONF = 0.025;
const TIER_A = 12, TIER_B = 6;            // 연환산 %/년
const ITERS = 10000;
const INV_DIR = path.join(L.CACHE_ROOT, "investor");
const quarterOf = (d) => `${d.slice(0, 4)}Q${Math.floor((+d.slice(4, 6) - 1) / 3) + 1}`;

const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => sum(a) / a.length;
const sg = (v, dp = 3) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const annual = (v, h) => v * YEAR_DAYS / h;
function ols(y, x) {
  const n = y.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { alpha: my - b * mx, beta: b, r2: syy === 0 ? 0 : sxy ** 2 / (sxx * syy), n };
}
function rng(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

// 판정용 — 분기 이동 블록 부트스트랩으로 OLS α 를 다시 추정한다. obs 중심 양측 p.
function bootAlpha(y, x, blockLen, seed = 1010) {
  const n = y.length, obs = ols(y, x);
  const rnd = rng(seed), boots = [];
  for (let it = 0; it < ITERS; it++) {
    const yy = [], xx = [];
    while (yy.length < n) {
      const st = Math.floor(rnd() * Math.max(1, n - blockLen + 1));
      for (let k = 0; k < blockLen && st + k < n && yy.length < n; k++) { yy.push(y[st + k]); xx.push(x[st + k]); }
    }
    boots.push(ols(yy, xx).alpha);
  }
  boots.sort((a, b) => a - b);
  const ge = boots.filter((b) => Math.abs(b - obs.alpha) >= Math.abs(obs.alpha)).length;
  const se = Math.sqrt(sum(boots.map((b) => (b - obs.alpha) ** 2)) / (ITERS - 1));
  return { ...obs, p: (ge + 1) / (ITERS + 1), ci: [boots[Math.floor(ITERS * 0.025)], boots[Math.floor(ITERS * 0.975)]], se, blockLen };
}
// 참고용 — #8·#9 의 부호뒤집기 p (블록 미적용). 판정에 쓰지 않는다.
function flipP(ds, ws, seed = 9090) {
  const sw = sum(ws), obs = sum(ds.map((d, i) => d * ws[i])) / sw;
  const rnd = rng(seed);
  let ge = 0;
  for (let it = 0; it < ITERS; it++) {
    const st = sum(ds.map((d, i) => (rnd() < 0.5 ? -d : d) * ws[i])) / sw;
    if (Math.abs(st) >= Math.abs(obs)) ge++;
  }
  return { obs, p: (ge + 1) / (ITERS + 1) };
}

// ── 데이터 적재: 수급 캐시 종목 ∩ 일봉 캐시, 전역 거래일 축 ──
function load() {
  const symbols = fs.readdirSync(INV_DIR).filter((f) => f.endsWith(".json") && !f.includes("error")).map((f) => f.replace(".json", ""));
  const dateSet = new Set(), raw = new Map();
  const excl = { noCandles: 0, noInvestor: 0, zeroRowNoPrice: 0, outOfRange: 0, rowsKept: 0, rowsTotal: 0, haltDays: 0 };
  for (const s of symbols) {
    const p = L.loadCandles(s);
    if (!p?.candles?.length) { excl.noCandles++; continue; }
    let inv;
    try { inv = JSON.parse(fs.readFileSync(path.join(INV_DIR, `${s}.json`), "utf8")); } catch { excl.noInvestor++; continue; }
    if (!inv?.rows?.length) { excl.noInvestor++; continue; }
    // 정지일: 봉인만 적용한 전체 일봉으로 계산 (bt-lib 주석 참조)
    const H = L.haltedDateSet(p.candles.filter((c) => String(c.stck_bsop_date || "") <= SEAL));
    const px = new Map();
    for (const c of p.candles) {
      const d = String(c.stck_bsop_date || "");
      if (d < START || d > SEAL) continue;
      const cl = Number(c.stck_clpr || 0);
      if (!(cl > 0)) continue;
      px.set(d, { cl, tv: Number(c.acml_tr_pbmn || 0), halt: H.has(d) });
      dateSet.add(d);
    }
    const flow = new Map();
    for (const r of inv.rows) {
      const d = String(r.stck_bsop_date || "");
      excl.rowsTotal++;
      if (d < START || d > SEAL) { excl.outOfRange++; continue; }
      if (!px.has(d)) { excl.zeroRowNoPrice++; continue; }
      flow.set(d, Number(r.frgn_ntby_tr_pbmn || 0) * 1e6);
      excl.rowsKept++;
    }
    raw.set(s, { px, flow });
  }
  const dates = [...dateSet].sort();
  const di = new Map(dates.map((d, i) => [d, i]));
  const n = dates.length;
  const series = new Map();
  for (const [s, { px, flow }] of raw) {
    const cl = new Float64Array(n), has = new Uint8Array(n), halt = new Uint8Array(n), hasF = new Uint8Array(n);
    const tv = new Float64Array(n), ff = new Float64Array(n);
    for (const [d, v] of px) { const i = di.get(d); cl[i] = v.cl; tv[i] = v.tv; has[i] = 1; if (v.halt) { halt[i] = 1; excl.haltDays++; } }
    for (const [d, v] of flow) { const i = di.get(d); ff[i] = v; hasF[i] = 1; }
    const ptv = new Float64Array(n + 1), pcnt = new Float64Array(n + 1), pf = new Float64Array(n + 1), pfc = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      ptv[i + 1] = ptv[i] + (has[i] ? tv[i] : 0);
      pcnt[i + 1] = pcnt[i] + (has[i] ? 1 : 0);
      pf[i + 1] = pf[i] + (hasF[i] ? ff[i] : 0);
      pfc[i + 1] = pfc[i] + (hasF[i] ? 1 : 0);
    }
    series.set(s, { sym: s, cl, has, halt, ptv, pcnt, pf, pfc });
  }
  return { dates, series, excl };
}

// 산출물: key, 이름, 정렬축(분위를 고르는 신호), 통제축
const PORTS = [
  { key: "mom", name: "(1) 모멘텀 — 수급 통제", sortBy: "mq", ctrl: "fq" },
  { key: "flow", name: "(2) 수급 — 모멘텀 통제", sortBy: "fq", ctrl: "mq" },
];

function main() {
  console.log("=== #10 모멘텀(12-1) × 외국인 수급 — 독립 이중 정렬 ===");
  console.log(`사전 등록: 산출물 2개, Bonferroni α=${ALPHA_BONF}, 판정 60일 롱온리 α 연환산(×${YEAR_DAYS}/h).`);
  console.log(`유니버스: 각 D 직전 ${UNIV_W}거래일 평균 거래대금 상위 ${TOP_N}. 진입 close[D+1]. 25칸 칸 평균 후 동일가중.\n`);

  const { dates, series, excl } = load();
  const n = dates.length;
  const syms = [...series.keys()];
  console.log(`[입력] 종목 ${series.size.toLocaleString()} | 거래일 ${n.toLocaleString()} (${dates[0]} ~ ${dates[n - 1]})`);
  console.log(`[수급 행] 총 ${excl.rowsTotal.toLocaleString()} → 유효 ${excl.rowsKept.toLocaleString()} (기간 밖 ${excl.outOfRange.toLocaleString()} / 유효 종가 없음 ${excl.zeroRowNoPrice.toLocaleString()})`);
  console.log(`  종목 제외: 일봉 없음 ${excl.noCandles} / 수급 없음 ${excl.noInvestor} | 정지일(종목-일) ${excl.haltDays.toLocaleString()}`);

  const acct = { lookback: 0, axisEndDate: 0, dateDropped: 0, noTradeD: 0, haltD: 0, shortHist: 0, notTopN: 0, flowMissing: 0, turnoverShort: 0, momMissing: 0, final: 0 };
  const hAcct = {};
  for (const h of HORIZONS) hAcct[h] = { valid: 0, beyondSeal: 0, halt: 0 };
  const byQ = {};                                  // port → h → quarter → 누적
  const portDrop = {};                             // port → h → 빈 칸으로 탈락한 날짜 수
  for (const P of PORTS) { byQ[P.key] = {}; portDrop[P.key] = {}; for (const h of HORIZONS) { byQ[P.key][h] = new Map(); portDrop[P.key][h] = 0; } }
  const hDateDrop = Object.fromEntries(HORIZONS.map((h) => [h, 0]));
  // 25칸: [fq][mq]
  const cell = () => Array.from({ length: NQ }, () => Array.from({ length: NQ }, () => ({ cnt: 0, min: Infinity, lt20: 0, retSum: 0, retDays: 0 })));
  const cells = cell();
  const diag = { rho: [], fqPast20: Array.from({ length: NQ }, () => ({ s: 0, n: 0 })), fqMom: Array.from({ length: NQ }, () => ({ s: 0, n: 0 })), days: 0 };
  const rebal = { mom: { prev: null, turns: [] }, flow: { prev: null, turns: [] }, next: -1, count: 0 };

  for (let i = 0; i < n; i++) {
    if (i < MOM_LONG) { acct.lookback += syms.length; continue; }      // D-252 가 축에 없음 (유니버스 창 포함)
    if (i + 1 >= n) { acct.axisEndDate += syms.length; continue; }
    const d = dates[i];
    const lo = i - UNIV_W + 1, flo = i - FLOW_W + 1, tlo = i - TURNOVER_W + 1;

    let noTradeD = 0, haltD = 0, shortHist = 0;
    const cand = [];
    for (const s of syms) {
      const S = series.get(s);
      if (!S.has[i]) { noTradeD++; continue; }
      if (S.halt[i]) { haltD++; continue; }
      const cnt = S.pcnt[i + 1] - S.pcnt[lo];
      if (cnt < UNIV_W * 0.8) { shortHist++; continue; }
      cand.push([S, (S.ptv[i + 1] - S.ptv[lo]) / cnt]);
    }
    if (cand.length < TOP_N * 0.5) { acct.dateDropped += syms.length; continue; }
    cand.sort((a, b) => b[1] - a[1]);
    const univ = cand.slice(0, TOP_N);

    let flowMissing = 0, turnoverShort = 0, momMissing = 0;
    const rows = [];
    for (const [S] of univ) {
      if (S.pfc[i + 1] - S.pfc[flo] < FLOW_W) { flowMissing++; continue; }
      const tcnt = S.pcnt[i + 1] - S.pcnt[tlo];
      const denom = tcnt < TURNOVER_W * 0.8 ? 0 : (S.ptv[i + 1] - S.ptv[tlo]) / tcnt;
      if (!(denom > 0)) { turnoverShort++; continue; }
      if (!S.has[i - MOM_SKIP] || !S.has[i - MOM_LONG]) { momMissing++; continue; }
      rows.push({
        S,
        f: (S.pf[i + 1] - S.pf[flo]) / denom,
        m: S.cl[i - MOM_SKIP] / S.cl[i - MOM_LONG] - 1,
        p20: S.has[i - 20] ? (S.cl[i] / S.cl[i - 20] - 1) * 100 : null,
      });
    }
    if (rows.length < MIN_ROWS) { acct.dateDropped += syms.length; continue; }
    acct.noTradeD += noTradeD; acct.haltD += haltD; acct.shortHist += shortHist;
    acct.notTopN += cand.length - univ.length;
    acct.flowMissing += flowMissing; acct.turnoverShort += turnoverShort; acct.momMissing += momMissing;
    acct.final += rows.length;

    // 전방 수익률 (진입 close[D+1]). 보유 구간에 봉 결측·정지일이 있으면 제외
    const e0 = i + 1;
    for (const r of rows) {
      r.fwd = {};
      for (const h of HORIZONS) {
        const e = e0 + h;
        if (e >= n) { r.fwd[h] = null; hAcct[h].beyondSeal++; continue; }
        let bad = false;
        for (let k = e0; k <= e; k++) if (!r.S.has[k] || r.S.halt[k]) { bad = true; break; }
        if (bad) { r.fwd[h] = null; hAcct[h].halt++; continue; }
        r.fwd[h] = (r.S.cl[e] / r.S.cl[e0] - 1) * 100;
        hAcct[h].valid++;
      }
    }

    // 독립 5분위 (같은 날짜 안)
    const len = rows.length;
    [...rows].sort((a, b) => a.f - b.f).forEach((r, idx) => { r.fr = idx; r.fq = Math.min(NQ - 1, Math.floor((idx * NQ) / len)); });
    [...rows].sort((a, b) => a.m - b.m).forEach((r, idx) => { r.mr = idx; r.mq = Math.min(NQ - 1, Math.floor((idx * NQ) / len)); });

    // 진단 1 — 순위 상관(동점 없는 순위라 Pearson on ranks = Spearman), flow 분위별 직전 20일·모멘텀
    const mr = (len - 1) / 2;
    let sxy = 0, sxx = 0;
    for (const r of rows) { sxy += (r.fr - mr) * (r.mr - mr); sxx += (r.fr - mr) ** 2; }
    diag.rho.push(sxy / sxx); diag.days++;
    for (const r of rows) {
      if (r.p20 !== null) { diag.fqPast20[r.fq].s += r.p20; diag.fqPast20[r.fq].n++; }
      diag.fqMom[r.fq].s += r.m * 100; diag.fqMom[r.fq].n++;
    }
    // 진단 3 — 칸별 종목 수, 25칸 표(60일)
    const cnt = Array.from({ length: NQ }, () => new Array(NQ).fill(0));
    const cRet = Array.from({ length: NQ }, () => Array.from({ length: NQ }, () => []));
    for (const r of rows) { cnt[r.fq][r.mq]++; if (r.fwd[MAIN_H] !== null) cRet[r.fq][r.mq].push(r.fwd[MAIN_H]); }
    for (let a = 0; a < NQ; a++) for (let b = 0; b < NQ; b++) {
      const c = cells[a][b];
      c.cnt += cnt[a][b]; c.min = Math.min(c.min, cnt[a][b]); if (cnt[a][b] < 20) c.lt20++;
      if (cRet[a][b].length) { c.retSum += mean(cRet[a][b]); c.retDays++; }
    }
    // 진단 4 — 60일 비중첩 리밸런싱에서 Q5 이름 교체율 (첫 유효일부터 60거래일마다)
    if (rebal.next < 0 || i >= rebal.next) {
      rebal.next = i + MAIN_H; rebal.count++;
      for (const P of PORTS) {
        const set = new Set(rows.filter((r) => r[P.sortBy] === NQ - 1).map((r) => r.S.sym));
        const R = rebal[P.key];
        if (R.prev) { let out = 0; for (const s of R.prev) if (!set.has(s)) out++; R.turns.push(out / R.prev.size); }
        R.prev = set;
      }
    }

    const q = quarterOf(d);
    for (const h of HORIZONS) {
      const uni = rows.filter((r) => r.fwd[h] !== null);
      if (uni.length < MIN_ROWS) { hDateDrop[h]++; continue; }
      const mUni = mean(uni.map((r) => r.fwd[h]));
      for (const P of PORTS) {
        // 통제축 분위마다 정렬축 Q5·Q1 칸 평균 → 5칸 동일가중
        const top = [], bot = [];
        let nTop = 0, empty = false;
        for (let c = 0; c < NQ && !empty; c++) {
          const t = uni.filter((r) => r[P.ctrl] === c && r[P.sortBy] === NQ - 1).map((r) => r.fwd[h]);
          const b = uni.filter((r) => r[P.ctrl] === c && r[P.sortBy] === 0).map((r) => r.fwd[h]);
          if (!t.length || !b.length) { empty = true; break; }
          top.push(mean(t)); bot.push(mean(b)); nTop += t.length;
        }
        if (empty) { portDrop[P.key][h]++; continue; }
        const m = byQ[P.key][h];
        if (!m.has(q)) m.set(q, { spread: [], longonly: [], market: [], nTop: 0, days: 0 });
        const a = m.get(q);
        a.spread.push(mean(top) - mean(bot)); a.longonly.push(mean(top) - mUni); a.market.push(mUni);
        a.nTop += nTop; a.days++;
      }
    }
  }

  // ── 1) 표본 산술 ──
  const grand = syms.length * n;
  const parts = [
    [`모멘텀 룩백 미형성(앞 ${MOM_LONG}거래일, 유니버스 창 포함)`, acct.lookback],
    ["진입일 D+1 이 축에 없음(마지막 거래일)", acct.axisEndDate],
    ["날짜 단위 탈락(후보<TOP_N/2 또는 적격<MIN_ROWS)", acct.dateDropped],
    ["D 에 거래 없음(유효 종가 없음·미상장)", acct.noTradeD],
    ["D 거래정지(5일 연속 동일 종가)", acct.haltD],
    [`${UNIV_W}일 창 이력 80% 미만`, acct.shortHist],
    [`유니버스 상위 ${TOP_N} 밖`, acct.notTopN],
    [`수급 ${FLOW_W}일 창 결측`, acct.flowMissing],
    [`${TURNOVER_W}일 거래대금 창 부족·0`, acct.turnoverShort],
    ["D-21·D-252 봉 없음(모멘텀 산출 불가)", acct.momMissing],
  ];
  console.log(`\n${"=".repeat(78)}\n=== 1) 표본 산술 (종목-일) ===`);
  console.log(`  총 종목-일 ${grand.toLocaleString()} (종목 ${syms.length.toLocaleString()} × 거래일 ${n.toLocaleString()})`);
  for (const [k, v] of parts) console.log(`   − ${k.padEnd(46)} ${v.toLocaleString().padStart(12)}`);
  console.log(`   = 최종 관측(25칸 배정) ${" ".repeat(25)} ${acct.final.toLocaleString().padStart(12)}`);
  const residual = grand - sum(parts.map((p) => p[1])) - acct.final;
  console.log(`  사유 미상 ${residual} → ${residual === 0 ? "닫힘 ✓" : "⚠ 닫히지 않음"}`);
  console.log(`\n  호라이즌별 유효 건수 (최종 관측 ${acct.final.toLocaleString()} 기준)`);
  for (const h of HORIZONS) {
    const a = hAcct[h];
    console.log(`   ${String(h).padStart(3)}일: 유효 ${a.valid.toLocaleString().padStart(10)} | 2026 침범 제외 ${a.beyondSeal.toLocaleString().padStart(9)} | 보유 구간 정지·결측 ${a.halt.toLocaleString().padStart(8)}`
      + ` | 합 ${a.valid + a.beyondSeal + a.halt === acct.final ? "닫힘 ✓" : "⚠"} | 유효 관측<${MIN_ROWS} 날짜 ${hDateDrop[h]}`);
  }
  for (const P of PORTS) console.log(`  ${P.name}: 빈 칸으로 탈락한 날짜 ${HORIZONS.map((h) => `${h}일 ${portDrop[P.key][h]}`).join(" / ")}`);

  // ── 2) 25칸 표 ──
  console.log(`\n${"=".repeat(78)}\n=== 2) 25칸 ${MAIN_H}일 표류(%) — 행 flow 분위, 열 momentum 분위 (날짜별 칸 평균의 평균) ===`);
  console.log(`         ${Array.from({ length: NQ }, (_, b) => `mom Q${b + 1}`.padStart(9)).join("")}`);
  for (let a = 0; a < NQ; a++) {
    console.log(`  flow Q${a + 1} ${cells[a].map((c) => (c.retDays ? sg(c.retSum / c.retDays, 2) : "-").padStart(9)).join("")}`);
  }

  // ── 3·4·5) 산출물별 ──
  const verdicts = {}, outSeries = {};
  for (const P of PORTS) {
    console.log(`\n${"=".repeat(78)}\n### ${P.name}`);
    outSeries[P.key] = {};
    let main = null;
    console.log(`\n--- 3) 호라이즌별 — α=OLS 절편(분기 롱온리 ~ 시장), p_boot·CI = 분기 블록 부트스트랩 ${ITERS}회 (판정용)`);
    console.log(`    p_flip = #8·#9 방식 부호뒤집기(블록 미적용) — 참고용, 판정에 쓰지 않음`);
    for (const h of HORIZONS) {
      const m = byQ[P.key][h];
      const rows = [...m.keys()].sort().map((q) => {
        const a = m.get(q);
        return { q, spread: mean(a.spread), longonly: mean(a.longonly), market: mean(a.market), nTop: a.nTop, days: a.days };
      });
      outSeries[P.key][h] = rows;
      if (rows.length < 3) { console.log(`\n[${h}일] 분기 ${rows.length} — 산출 불가`); continue; }
      const mk = rows.map((r) => r.market), ws = rows.map((r) => r.nTop);
      const bSp = bootAlpha(rows.map((r) => r.spread), mk, BLOCK[h]);
      const bLo = bootAlpha(rows.map((r) => r.longonly), mk, BLOCK[h]);
      const fLo = flipP(rows.map((r) => r.longonly), ws);
      const posQ = rows.filter((r) => r.longonly > 0).length;
      const needQ = Math.ceil(rows.length * 2 / 3);
      const bonf = (p) => (p < ALPHA_BONF ? " *Bonf 통과" : "");
      console.log(`\n[${h}일]${h === MAIN_H ? " ← 주 호라이즌" : " (보조)"} 분기 ${rows.length} (${rows[0].q}~${rows[rows.length - 1].q}) / Q5 칸 관측 ${sum(ws).toLocaleString()} / 블록 ${BLOCK[h]}분기`);
      console.log(`  롱-숏  α ${sg(bSp.alpha)}%p (연 ${sg(annual(bSp.alpha, h), 2)}%) | β ${bSp.beta.toFixed(3)} | p_boot ${bSp.p.toFixed(4)}${bonf(bSp.p)} | CI [${bSp.ci[0].toFixed(3)}, ${bSp.ci[1].toFixed(3)}] | SE ${bSp.se.toFixed(3)}`);
      console.log(`  롱온리 α ${sg(bLo.alpha)}%p (연 ${sg(annual(bLo.alpha, h), 2)}%) | β ${bLo.beta.toFixed(3)} | R² ${bLo.r2.toFixed(3)} | p_boot ${bLo.p.toFixed(4)}${bonf(bLo.p)} | CI [${bLo.ci[0].toFixed(3)}, ${bLo.ci[1].toFixed(3)}] | SE ${bLo.se.toFixed(3)} | MDE ${(2.8016 * bLo.se).toFixed(3)}`);
      console.log(`         가중 평균 롱온리 ${sg(fLo.obs)}%p, p_flip ${fLo.p.toFixed(4)} (참고) | 분기 양수 ${posQ}/${rows.length} (기준 ${needQ})`);
      console.log(`         비용 ${COST}% 차감: α ${sg(bLo.alpha)} → ${sg(bLo.alpha - COST)}%p | 연 ${sg(annual(bLo.alpha, h), 2)}% → ${sg(annual(bLo.alpha - COST, h), 2)}%`);
      if (h === MAIN_H) main = { b: bLo, bSp, posQ, needQ, rows };
    }
    if (!main) { console.log("  주 호라이즌 산출 불가"); verdicts[P.key] = { verdict: "산출 불가" }; continue; }
    const rowsMain = main.rows;

    console.log(`\n--- 4) 분기 ${rowsMain.length}행 (${MAIN_H}일)`);
    console.log(`  분기     롱-숏    롱온리    시장   Q5칸관측  일수`);
    for (const r of rowsMain) console.log(`  ${r.q}  ${sg(r.spread)}  ${sg(r.longonly)}  ${sg(r.market)}  ${String(r.nTop).padStart(8)}  ${String(r.days).padStart(4)}`);

    console.log(`\n--- 5) 상승/하락 분기, 연도별 (${MAIN_H}일)`);
    const up = rowsMain.filter((r) => r.market > 0), dn = rowsMain.filter((r) => r.market < 0);
    for (const [lab, sub] of [["시장 상승 분기", up], ["시장 하락 분기", dn]]) {
      if (!sub.length) { console.log(`  ${lab}: 없음`); continue; }
      console.log(`  ${lab}: ${sub.length}분기 (시장 ${sg(mean(sub.map((r) => r.market)), 2)}%) | 롱-숏 ${sg(mean(sub.map((r) => r.spread)))}%p | 롱온리 ${sg(mean(sub.map((r) => r.longonly)))}%p`);
    }
    for (const y of ["2020", "2021", "2022", "2023", "2024", "2025"]) {
      const sub = rowsMain.filter((r) => r.q.startsWith(y));
      if (!sub.length) { console.log(`   ${y}: 분기 없음`); continue; }
      const lo = sub.map((r) => r.longonly);
      console.log(`   ${y}: 분기 ${sub.length} | 롱온리 ${sg(mean(lo))}%p (양수 ${lo.filter((v) => v > 0).length}/${lo.length}) | 롱-숏 ${sg(mean(sub.map((r) => r.spread)))}%p`);
    }

    // 게이트
    const ann = annual(main.b.alpha, MAIN_H);
    const gQ = main.posQ >= main.needQ, gB = main.b.p < ALPHA_BONF;
    const badUD = up.length && dn.length && mean(up.map((r) => r.longonly)) < 0 && mean(dn.map((r) => r.longonly)) > 0;
    const tier = badUD || !gQ || !gB || ann < TIER_B ? "탈락" : ann >= TIER_A ? "Tier A" : "Tier B";
    verdicts[P.key] = {
      name: P.name, alpha: main.b.alpha, annual: ann, alphaNet: main.b.alpha - COST, annualNet: annual(main.b.alpha - COST, MAIN_H),
      beta: main.b.beta, spreadBeta: main.bSp.beta, p: main.b.p, ci: main.b.ci, posQ: main.posQ, nQ: rowsMain.length, needQ: main.needQ, badUD: !!badUD, tier,
    };
  }

  // ── 6) 진단 ──
  console.log(`\n${"=".repeat(78)}\n=== 6) 진단 4건 (게이트 아님) ===`);
  const rho = diag.rho;
  const rs = [...rho].sort((a, b) => a - b);
  console.log(`  1) momentum·flow 순위 상관(Spearman, 날짜 ${diag.days}): 평균 ${sg(mean(rho))} | 중앙 ${sg(rs[Math.floor(rs.length / 2)])} | 5~95% [${rs[Math.floor(rs.length * 0.05)].toFixed(3)}, ${rs[Math.floor(rs.length * 0.95)].toFixed(3)}]`);
  console.log(`     flow 분위별 평균: ${diag.fqPast20.map((z, a) => `Q${a + 1} 직전20일 ${sg(z.n ? z.s / z.n : 0, 2)}% / 12-1 ${sg(diag.fqMom[a].n ? diag.fqMom[a].s / diag.fqMom[a].n : 0, 1)}%`).join(" | ")}`);
  const g20 = (diag.fqPast20[NQ - 1].s / diag.fqPast20[NQ - 1].n) - (diag.fqPast20[0].s / diag.fqPast20[0].n);
  console.log(`     flow Q5−Q1 직전 20일 수익률 차 ${sg(g20, 2)}%p`);
  console.log(`  2) β (60일, 분기 회귀): ${PORTS.map((P) => `${P.name} 롱온리 ${verdicts[P.key].beta?.toFixed(3)} / 롱-숏 ${verdicts[P.key].spreadBeta?.toFixed(3)}`).join(" | ")}`);
  console.log(`  3) 25칸 종목 수 — 평균(최소) [20 미만 일수], 날짜 ${diag.days}`);
  console.log(`         ${Array.from({ length: NQ }, (_, b) => `mom Q${b + 1}`.padStart(17)).join("")}`);
  for (let a = 0; a < NQ; a++) {
    console.log(`  flow Q${a + 1} ${cells[a].map((c) => `${(c.cnt / diag.days).toFixed(1)}(${c.min})[${c.lt20}]`.padStart(17)).join("")}`);
  }
  const lt = cells.flat().filter((c) => c.lt20 > 0).length;
  console.log(`     20종목 미만으로 떨어진 적 있는 칸: ${lt}/25`);
  console.log(`  4) ${MAIN_H}일 비중첩 리밸런싱 ${rebal.count}회 (연 ${(YEAR_DAYS / MAIN_H).toFixed(1)}회)`);
  for (const P of PORTS) {
    const t = rebal[P.key].turns;
    const avg = t.length ? mean(t) : 0;
    console.log(`     ${P.name}: Q5 이름 교체율 평균 ${(avg * 100).toFixed(1)}% → 연 실제 왕복 ${(YEAR_DAYS / MAIN_H * avg).toFixed(2)}회분, 연 비용 ${(YEAR_DAYS / MAIN_H * avg * COST).toFixed(2)}% (가정 ${(YEAR_DAYS / MAIN_H * COST).toFixed(2)}%)`);
  }

  // ── 7·8) 게이트·홀드아웃 선택 ──
  console.log(`\n${"=".repeat(78)}\n=== 7) 게이트 대입 (60일 롱온리, 연환산) ===`);
  for (const P of PORTS) {
    const v = verdicts[P.key];
    if (!v.annual && v.annual !== 0) { console.log(`  ${P.name}: 산출 불가`); continue; }
    console.log(`  ${P.name}`);
    console.log(`    연환산 α ${sg(v.annual, 2)}%/년 (α ${sg(v.alpha)}%p/60일) — Tier A ≥${TIER_A} / Tier B ≥${TIER_B}`);
    console.log(`    분기 양수 ${v.posQ}/${v.nQ} (기준 ${v.needQ}) → ${v.posQ >= v.needQ ? "충족" : "미충족"}`);
    console.log(`    Bonferroni p_boot ${v.p.toFixed(4)} < ${ALPHA_BONF} ? ${v.p < ALPHA_BONF ? "통과" : "미통과"}`);
    console.log(`    상승 분기 음수 & 하락 분기만 양수 ? ${v.badUD ? "해당 → 탈락" : "해당 없음"}`);
    console.log(`    → 판정: ${v.tier} | 비용 차감 후 연 ${sg(v.annualNet, 2)}%`);
  }
  const tiered = PORTS.map((P) => verdicts[P.key]).filter((v) => v.tier === "Tier A" || v.tier === "Tier B");
  console.log(`\n=== 8) 홀드아웃 선택 ===`);
  if (!tiered.length) console.log("  Tier 진입 없음 → 2026 홀드아웃 열지 않음. 정지 규칙에 따라 검증 종료.");
  else if (tiered.length === 1) console.log(`  단독 후보: ${tiered[0].name}`);
  else {
    tiered.sort((a, b) => b.alphaNet - a.alphaNet || b.posQ / b.nQ - a.posQ / a.nQ);
    console.log(`  둘 다 Tier → 비용 차감 후 α 큰 쪽: ${tiered[0].name} (${sg(tiered[0].alphaNet)} vs ${sg(tiered[1].alphaNet)}%p)`);
  }

  const out = path.join(L.CACHE_ROOT, "momentum-result.json");
  fs.writeFileSync(out, JSON.stringify({
    generatedAt: new Date().toISOString(), acct, hAcct, hDateDrop, portDrop, series: outSeries, verdicts,
    cells: cells.map((r) => r.map((c) => ({ avg: c.cnt / diag.days, min: c.min, lt20: c.lt20, ret60: c.retDays ? c.retSum / c.retDays : null }))),
    diag: { rhoMean: mean(rho), fqPast20: diag.fqPast20.map((z) => z.s / z.n), turnover: { mom: rebal.mom.turns, flow: rebal.flow.turns } },
  }, null, 2));
  console.log(`\n저장: ${out}`);
}

main();
