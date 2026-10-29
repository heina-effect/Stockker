// #9 Phase 2 — 수급(외국인·기관) 순매수 플로우의 알파 검증.
//
// 사전 등록(analysis/hypothesis-log.md "#9 사전 등록" 절)대로만 산출한다.
//   신호  flow = (D 직전 5거래일 누적 순매수금액) / (D 직전 20거래일 평균 거래대금)
//   진입  close[D+1]  ← 확정치가 장 종료 후 나오므로 D 종가에는 못 산다
//   표류  close[D+1+k]/close[D+1] - 1,  k ∈ {5,10,20(주),60}
//   분위  같은 날짜 안에서 flow 5분위
//   비교  롱-숏(Q5-Q1) / 롱온리(Q5 - 같은 날 분석 유니버스 동일가중). 판정은 롱온리
//
// 창 경계: '직전 5거래일'을 D 포함 5일(D-4..D)로 읽는다. D 의 수급 확정치는 D 장 종료
// 후 제공되고 진입이 D+1 이므로 미래 참조가 아니며, 이 해석에서만 'D+1 진입' 규칙이
// 의미를 갖는다(D 를 빼면 신호가 D 개장 전에 확정돼 D 종가 진입이 가능해진다).
// 60일 유니버스 창·20일 거래대금 창도 같은 규칙으로 D 포함이다.
//
// 단위: 순매수금액(백만원) × 1e6 → 원. 거래대금은 일봉 캐시의 acml_tr_pbmn(원)을 쓴다.
//
// 진단 2건(사전 등록, 게이트 아님 — 보고만 하고 보정·필터 추가 금지):
//   진단 1  flow 가 정확히 0 인 관측치 비율(전체·분위별). 30% 초과 시 분위 해석에 경고.
//   진단 2  분위별 직전 5·20거래일 수익률 — flow 분위가 모멘텀 대리변수인지 판별 자료.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const START = "20200101";
const SEAL = "20251231";                  // 2026 열람 금지
const HORIZONS = [5, 10, 20, 60];
const MAIN_H = 20;
const TOP_N = Number(process.env.FLOW_TOP_N || 1000);      // 사전 확정값 1000. env 는 배관 점검용
const NQ = 5;
const MIN_ROWS = Number(process.env.FLOW_MIN_ROWS || 100);   // 사전 확정값 100(= NQ*20)
const FLOW_W = 5;                         // 누적 순매수 창 (D 포함)
const TURNOVER_W = 20;                    // 평균 거래대금 창 (D 포함)
const UNIV_W = 60;                        // 유니버스 선정 창 (D 포함)
const COST = 0.3;                         // 왕복 비용 가정(%)
const ZERO_WARN = 0.30;                   // 진단 1 경고선
const Z80 = 2.8016;
const INV_DIR = path.join(L.CACHE_ROOT, "investor");
const quarterOf = (d) => `${d.slice(0, 4)}Q${Math.floor((+d.slice(4, 6) - 1) / 3) + 1}`;

const sum = (a) => a.reduce((x, y) => x + y, 0);
const mean = (a) => sum(a) / a.length;
const sg = (v, dp = 3) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
function ols(y, x) {
  const n = y.length, mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { alpha: my - b * mx, beta: b, r2: syy === 0 ? 0 : sxy ** 2 / (sxx * syy), n };
}
// p 와 CI 는 서로 다른 분포에서 나온다. 둘 다 분기 단위이지만 SE 가 일치하지 않는다.
//   p   = 부호뒤집기 순열검정. 귀무(0) 중심 분포라 분산이 Σ(d·w)²/W² (비중심) — obs 가 클수록
//         역산 SE 가 부트스트랩보다 커진다. blockLen 을 쓰지 않는다(분기 독립 가정).
//   CI  = 블록 부트스트랩 퍼센타일. obs 중심 분포, blockLen 적용.
//   se  = 같은 부트스트랩 분포의 표준편차(SE_boot). MDE 도 이것을 쓴다.
function clusterTest(ds, ws, blockLen = 1, iters = 10000, seed = 9090) {
  if (!ds.length) return null;
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
      const st2 = Math.floor(rnd() * Math.max(1, ds.length - blockLen + 1));
      for (let k = 0; k < blockLen && st2 + k < ds.length; k++) { num += ds[st2 + k] * ws[st2 + k]; den += ws[st2 + k]; }
    }
    if (den > 0) boots.push(num / den);
  }
  boots.sort((a, b) => a - b);
  const se = Math.sqrt(sum(boots.map((b) => (b - obs) ** 2)) / (boots.length - 1));
  return { obs, p: (ge + 1) / (iters + 1), nQ: ds.length, obsN: sw, ci: [boots[Math.floor(boots.length * 0.025)], boots[Math.floor(boots.length * 0.975)]], se, mde: Z80 * se, blockLen };
}

// ── 데이터 적재: 전역 거래일 축에 종목별 시계열을 정렬 ──
function load() {
  const files = fs.readdirSync(INV_DIR).filter((f) => f.endsWith(".json") && !f.includes("error"));
  const symbols = files.map((f) => f.replace(".json", ""));
  const dateSet = new Set();
  const raw = new Map();
  const excl = { noCandles: 0, noInvestor: 0, zeroRowNoPrice: 0, outOfRange: 0, rowsKept: 0, rowsTotal: 0 };

  for (const s of symbols) {
    const p = L.loadCandles(s);
    if (!p?.candles?.length) { excl.noCandles++; continue; }
    let inv;
    try { inv = JSON.parse(fs.readFileSync(path.join(INV_DIR, `${s}.json`), "utf8")); } catch { excl.noInvestor++; continue; }
    if (!inv?.rows?.length) { excl.noInvestor++; continue; }

    // 일봉: 유효 종가/거래대금만
    const px = new Map();
    for (const c of p.candles) {
      const d = String(c.stck_bsop_date || "");
      if (d < START || d > SEAL) continue;
      const cl = Number(c.stck_clpr || 0);
      if (!(cl > 0)) continue;
      px.set(d, { cl, tv: Number(c.acml_tr_pbmn || 0) });
      dateSet.add(d);
    }
    // 수급: 일봉에 유효 종가가 없는 날은 결측(상장 이전 전부-0 구간 차단)
    const flow = new Map();
    for (const r of inv.rows) {
      const d = String(r.stck_bsop_date || "");
      excl.rowsTotal++;
      if (d < START || d > SEAL) { excl.outOfRange++; continue; }
      if (!px.has(d)) { excl.zeroRowNoPrice++; continue; }
      flow.set(d, { f: Number(r.frgn_ntby_tr_pbmn || 0) * 1e6, o: Number(r.orgn_ntby_tr_pbmn || 0) * 1e6 });
      excl.rowsKept++;
    }
    raw.set(s, { px, flow });
  }

  const dates = [...dateSet].sort();
  const di = new Map(dates.map((d, i) => [d, i]));
  const n = dates.length;
  const series = new Map();
  for (const [s, { px, flow }] of raw) {
    const cl = new Float64Array(n), tv = new Float64Array(n);
    const ff = new Float64Array(n), oo = new Float64Array(n);
    const has = new Uint8Array(n), hasF = new Uint8Array(n);
    for (const [d, v] of px) { const i = di.get(d); cl[i] = v.cl; tv[i] = v.tv; has[i] = 1; }
    for (const [d, v] of flow) { const i = di.get(d); ff[i] = v.f; oo[i] = v.o; hasF[i] = 1; }
    // 접두합(창 평균·누적용). 결측일은 0 기여 + 건수로 분리 집계
    const ptv = new Float64Array(n + 1), pcnt = new Float64Array(n + 1);
    const pf = new Float64Array(n + 1), po = new Float64Array(n + 1), pfc = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      ptv[i + 1] = ptv[i] + (has[i] ? tv[i] : 0);
      pcnt[i + 1] = pcnt[i] + (has[i] ? 1 : 0);
      pf[i + 1] = pf[i] + (hasF[i] ? ff[i] : 0);
      po[i + 1] = po[i] + (hasF[i] ? oo[i] : 0);
      pfc[i + 1] = pfc[i] + (hasF[i] ? 1 : 0);
    }
    series.set(s, { cl, has, hasF, ptv, pcnt, pf, po, pfc });
  }
  return { dates, di, series, excl };
}

const SUBJECTS = [["외국인", "pf"], ["기관", "po"]];

function main() {
  console.log("=== #9 수급 — 외국인·기관 순매수 플로우 알파 검증 ===");
  console.log("사전 등록: 주체 2개(외국인 주/기관 보조), Bonferroni α=0.025, 판정은 롱온리.");
  console.log(`분석 유니버스: 각 D 직전 ${UNIV_W}거래일 평균 거래대금 상위 ${TOP_N} (시점 기준).`);
  console.log(`진입 close[D+1] — 수급 확정치는 장 종료 후 제공.\n`);

  const { dates, series, excl } = load();
  const n = dates.length;
  const syms = [...series.keys()];
  console.log(`[입력] 종목 ${series.size.toLocaleString()} | 거래일 ${n.toLocaleString()} (${dates[0]} ~ ${dates[n - 1]})`);
  console.log(`[수급 행] 총 ${excl.rowsTotal.toLocaleString()} → 유효 ${excl.rowsKept.toLocaleString()}`);
  console.log(`  제외: 기간 밖 ${excl.outOfRange.toLocaleString()} / 일봉에 유효 종가 없음(상장 이전 전부-0 등) ${excl.zeroRowNoPrice.toLocaleString()}`);
  console.log(`  종목 제외: 일봉 없음 ${excl.noCandles} / 수급 없음 ${excl.noInvestor}`);

  // 종목-일 표본 산술. 모든 (거래일 i, 종목 s) 쌍이 정확히 한 칸에 들어간다.
  const acct = { warmup: 0, axisEndDate: 0, dateDropped: 0, noTradeD: 0, shortHist: 0, notTopN: 0, flowMissing: 0, turnoverShort: 0, final: 0 };
  // 호라이즌별 유효 건수(공통: 분위와 무관)
  const hAcct = {};
  for (const h of HORIZONS) hAcct[h] = { valid: 0, beyondSeal: 0, halt: 0, dateDropped: 0 };

  // 주체별 집계 상태
  const st = {};
  for (const [label] of SUBJECTS) {
    st[label] = {
      byQ: new Map(),                    // h → quarter → 누적
      qd: Array.from({ length: NQ }, () => ({ n: 0, zero: 0, flow: 0, drift: 0, driftN: 0, p5: 0, p5n: 0, p20: 0, p20n: 0 })),
      zero: 0, obs: 0, hDateDropped: 0,
    };
  }

  for (let i = 0; i < n; i++) {
    if (i < UNIV_W - 1) { acct.warmup += syms.length; continue; }   // 유니버스 창 미형성
    if (i + 1 >= n) { acct.axisEndDate += syms.length; continue; }  // 진입일 D+1 이 축에 없음
    const d = dates[i];
    const lo = i - UNIV_W + 1, flo = i - FLOW_W + 1, tlo = i - TURNOVER_W + 1;

    let noTradeD = 0, shortHist = 0;
    const cand = [];
    for (const s of syms) {
      const S = series.get(s);
      if (!S.has[i]) { noTradeD++; continue; }                      // D 에 거래 없음(정지·미상장)
      const cnt = S.pcnt[i + 1] - S.pcnt[lo];
      if (cnt < UNIV_W * 0.8) { shortHist++; continue; }            // 창 80% 미만 이력
      cand.push([s, (S.ptv[i + 1] - S.ptv[lo]) / cnt]);
    }
    if (cand.length < TOP_N * 0.5) { acct.dateDropped += syms.length; continue; }
    cand.sort((a, b) => b[1] - a[1]);
    const univ = cand.slice(0, TOP_N);

    let flowMissing = 0, turnoverShort = 0;
    const rows = [];
    for (const [s] of univ) {
      const S = series.get(s);
      if (S.pfc[i + 1] - S.pfc[flo] < FLOW_W) { flowMissing++; continue; }   // 수급 5일 창 결측
      const tcnt = S.pcnt[i + 1] - S.pcnt[tlo];
      const denom = tcnt < TURNOVER_W * 0.8 ? 0 : (S.ptv[i + 1] - S.ptv[tlo]) / tcnt;
      if (!(denom > 0)) { turnoverShort++; continue; }
      rows.push({
        S,
        f: (S.pf[i + 1] - S.pf[flo]) / denom,
        o: (S.po[i + 1] - S.po[flo]) / denom,
        p5: pastRet(S, i, 5), p20: pastRet(S, i, 20),
      });
    }
    if (rows.length < MIN_ROWS) { acct.dateDropped += syms.length; continue; }

    acct.noTradeD += noTradeD;
    acct.shortHist += shortHist;
    acct.notTopN += cand.length - univ.length;
    acct.flowMissing += flowMissing;
    acct.turnoverShort += turnoverShort;
    acct.final += rows.length;

    // 전방 수익률은 분위와 무관하므로 한 번만 계산해 캐시한다 (진입 = close[D+1])
    const e0 = i + 1;
    for (const r of rows) {
      r.fwd = {};
      for (const h of HORIZONS) {
        const e = e0 + h;
        if (e >= n) { r.fwd[h] = null; hAcct[h].beyondSeal++; continue; }  // 보유 구간이 2026 을 밟음
        let halt = false;
        // 봉 결측만. 거래정지(5일 연속 동일 종가)는 봉이 있어 안 걸린다 — verify-halt.cjs 참조.
        // [각주] #9 는 사전 등록 결과로 이 규칙 그대로 둔다(재실행 금지). #10 부터는 정지일을
        // 제외한다 — bt-lib.cjs haltedDateSet (#8 pead.cjs 와 같은 규칙).
        for (let k = e0; k <= e; k++) if (!r.S.has[k]) { halt = true; break; }
        if (halt) { r.fwd[h] = null; hAcct[h].halt++; continue; }
        r.fwd[h] = (r.S.cl[e] / r.S.cl[e0] - 1) * 100;
        hAcct[h].valid++;
      }
    }

    const q = quarterOf(d);
    for (const [label, key] of SUBJECTS) {
      const fkey = key === "pf" ? "f" : "o";
      const S = st[label];
      rows.sort((a, b) => a[fkey] - b[fkey]);
      const len = rows.length;
      for (let idx = 0; idx < len; idx++) {
        const r = rows[idx];
        const qi = Math.min(NQ - 1, Math.floor((idx * NQ) / len));
        r.qi = qi;
        const z = S.qd[qi];
        z.n++; z.flow += r[fkey];
        if (r[fkey] === 0) { z.zero++; S.zero++; }
        S.obs++;
        if (r.fwd[MAIN_H] !== null) { z.drift += r.fwd[MAIN_H]; z.driftN++; }
        if (r.p5 !== null) { z.p5 += r.p5; z.p5n++; }
        if (r.p20 !== null) { z.p20 += r.p20; z.p20n++; }
      }
      for (const h of HORIZONS) {
        const top = [], bot = [], uni = [];
        for (const r of rows) {
          const v = r.fwd[h];
          if (v === null) continue;
          uni.push(v);
          if (r.qi === NQ - 1) top.push(v);
          else if (r.qi === 0) bot.push(v);
        }
        if (!top.length || !bot.length || uni.length < MIN_ROWS) { S.hDateDropped++; continue; }
        if (!S.byQ.has(h)) S.byQ.set(h, new Map());
        const m = S.byQ.get(h);
        if (!m.has(q)) m.set(q, { spread: [], longonly: [], market: [], nTop: 0, days: 0 });
        const a = m.get(q);
        const mTop = mean(top), mBot = mean(bot), mUni = mean(uni);
        a.spread.push(mTop - mBot); a.longonly.push(mTop - mUni); a.market.push(mUni);
        a.nTop += top.length; a.days++;
      }
    }
  }

  // ── 1) 표본 산술 (닫힘 확인) ──
  const grand = syms.length * n;
  const parts = [
    ["유니버스 창 미형성(앞 59거래일)", acct.warmup],
    ["진입일 D+1 이 축에 없음(마지막 거래일)", acct.axisEndDate],
    ["날짜 단위 탈락(후보<TOP_N/2 또는 적격<MIN_ROWS)", acct.dateDropped],
    ["D 에 거래 없음(정지·미상장)", acct.noTradeD],
    [`${UNIV_W}일 창 이력 80% 미만`, acct.shortHist],
    [`유니버스 상위 ${TOP_N} 밖`, acct.notTopN],
    [`수급 ${FLOW_W}일 창 결측`, acct.flowMissing],
    [`${TURNOVER_W}일 거래대금 창 부족·0`, acct.turnoverShort],
  ];
  console.log(`\n${"=".repeat(78)}\n=== 1) 표본 산술 (종목-일) ===`);
  console.log(`  총 종목-일 ${grand.toLocaleString()} (종목 ${syms.length.toLocaleString()} × 거래일 ${n.toLocaleString()})`);
  for (const [k, v] of parts) console.log(`   − ${k.padEnd(44)} ${v.toLocaleString().padStart(12)}`);
  console.log(`   = 최종 관측(분위 배정) ${" ".repeat(23)} ${acct.final.toLocaleString().padStart(12)}`);
  const residual = grand - sum(parts.map((p) => p[1])) - acct.final;
  console.log(`  사유 미상 ${residual} → ${residual === 0 ? "닫힘 ✓" : "⚠ 닫히지 않음"}`);
  console.log(`\n  호라이즌별 유효 건수 (최종 관측 ${acct.final.toLocaleString()} 기준)`);
  for (const h of HORIZONS) {
    const a = hAcct[h];
    console.log(`   ${String(h).padStart(2)}일: 유효 ${a.valid.toLocaleString().padStart(10)} | 2026 침범 제외 ${a.beyondSeal.toLocaleString().padStart(9)} | 보유 구간 봉 결측 ${a.halt.toLocaleString().padStart(8)}`
      + ` | 합 ${(a.valid + a.beyondSeal + a.halt === acct.final) ? "닫힘 ✓" : "⚠"}`);
  }

  // ── 주체별 보고 ──
  const verdicts = {};
  const outSeries = {};
  for (const [label] of SUBJECTS) {
    const S = st[label];
    const seriesByH = {};
    for (const h of HORIZONS) {
      const m = S.byQ.get(h);
      if (!m) continue;
      seriesByH[h] = [...m.keys()].sort().map((q) => {
        const a = m.get(q);
        return { q, spread: mean(a.spread), longonly: mean(a.longonly), market: mean(a.market), nTop: a.nTop, days: a.days };
      });
    }
    outSeries[label] = seriesByH;
    const rowsMain = seriesByH[MAIN_H] || [];
    console.log(`\n${"=".repeat(78)}\n### 주체: ${label} ${label === "외국인" ? "(주 가설)" : "(보조)"}`);
    if (!rowsMain.length) { console.log("  표본 부족 — 산출 불가"); continue; }

    // 2) 호라이즌 × [롱-숏 / 롱온리]
    console.log(`\n--- 2) 호라이즌별 (분기 클러스터 검정, Bonferroni α=0.025)`);
    console.log(`  p_flip = 부호뒤집기 순열 p (귀무 중심, 분기 독립 — 블록 미적용)`);
    console.log(`  CI_boot·SE_boot·MDE = 블록 부트스트랩 (obs 중심, 블록 길이 적용). p 와 SE 가 달라 t·z 가 어긋난다`);
    let main = null;
    for (const h of HORIZONS) {
      const rows = seriesByH[h];
      if (!rows?.length) continue;
      const ws = rows.map((r) => r.nTop);
      const blockLen = h <= 20 ? 1 : 2;      // 1분기 ≈ 62거래일 ≥ 호라이즌. 60일은 2분기
      const tSp = clusterTest(rows.map((r) => r.spread), ws, blockLen);
      const tLo = clusterTest(rows.map((r) => r.longonly), ws, blockLen);
      const regSp = ols(rows.map((r) => r.spread), rows.map((r) => r.market));
      const regLo = ols(rows.map((r) => r.longonly), rows.map((r) => r.market));
      const posQ = rows.filter((r) => r.longonly > 0).length;
      if (h === MAIN_H) main = { regLo, posQ, nQ: rows.length, rows, tLo };
      console.log(`\n[D+1 진입, ${h}일]${h === MAIN_H ? " ← 주 호라이즌" : h === 60 ? " (보조)" : ""} 분기 ${rows.length} / Q5 관측 ${Math.round(sum(ws)).toLocaleString()} / 블록 ${blockLen}분기`);
      console.log(`  롱-숏  ${sg(tSp.obs)}%p | p_flip=${tSp.p.toFixed(4)}${tSp.p < 0.025 ? " *(Bonf 통과)" : ""} | CI_boot [${tSp.ci[0].toFixed(3)}, ${tSp.ci[1].toFixed(3)}] | SE_boot ${tSp.se.toFixed(3)} | MDE ${tSp.mde.toFixed(3)}`);
      console.log(`         α ${sg(regSp.alpha)}%p | β ${regSp.beta.toFixed(3)} | R² ${regSp.r2.toFixed(3)}`);
      console.log(`  롱온리 ${sg(tLo.obs)}%p | p_flip=${tLo.p.toFixed(4)}${tLo.p < 0.025 ? " *(Bonf 통과)" : ""} | CI_boot [${tLo.ci[0].toFixed(3)}, ${tLo.ci[1].toFixed(3)}] | SE_boot ${tLo.se.toFixed(3)} | MDE ${tLo.mde.toFixed(3)}`);
      console.log(`         α ${sg(regLo.alpha)}%p | β ${regLo.beta.toFixed(3)} | R² ${regLo.r2.toFixed(3)}`);
      console.log(`         분기 양수 ${posQ}/${rows.length} | 비용 ${COST}% 차감 전 α ${sg(regLo.alpha)}%p → 차감 후 ${sg(regLo.alpha - COST)}%p`);
    }

    // 3) 분위별 + 진단 2
    console.log(`\n--- 3) flow 분위별 (표류는 ${MAIN_H}일) · 직전 수익률은 진단 2(게이트 아님)`);
    console.log(`  분위   flow 평균   표류(${MAIN_H}일)   직전5일   직전20일   관측`);
    for (let qi = 0; qi < NQ; qi++) {
      const z = S.qd[qi];
      if (!z.n) continue;
      const tag = qi === NQ - 1 ? "Q5↑" : qi === 0 ? "Q1↓" : `Q${qi + 1} `;
      console.log(`  ${tag}  ${sg(z.flow / z.n, 4).padStart(10)}  ${sg(z.driftN ? z.drift / z.driftN : 0).padStart(9)}%  ${sg(z.p5n ? z.p5 / z.p5n : 0, 2).padStart(8)}%  ${sg(z.p20n ? z.p20 / z.p20n : 0, 2).padStart(8)}%  ${z.n.toLocaleString().padStart(10)}`);
    }

    // 4) 진단 1
    const zr = S.obs ? S.zero / S.obs : 0;
    console.log(`\n--- 4) 진단 1: flow = 0 비율 (게이트 아님)`);
    console.log(`  전체 ${(zr * 100).toFixed(2)}% (${S.zero.toLocaleString()} / ${S.obs.toLocaleString()})`);
    console.log(`  분위별: ${S.qd.map((z, qi) => `Q${qi + 1} ${z.n ? ((z.zero / z.n) * 100).toFixed(1) : "-"}%`).join(" | ")}`);
    if (zr > ZERO_WARN) console.log(`  ⚠ 경고: ${(ZERO_WARN * 100).toFixed(0)}% 초과 — 동점 뭉치로 하위 분위 경계가 무의미하다. ${label} 분위 해석에 이 경고를 달 것.`);
    else console.log(`  → ${(ZERO_WARN * 100).toFixed(0)}% 이하 — 분위 경계 유효`);

    // 5) 분기 24행
    console.log(`\n--- 5) 분기 ${rowsMain.length}행 (${MAIN_H}일)`);
    console.log(`  분기     롱-숏    롱온리    시장      Q5관측  일수`);
    for (const r of rowsMain) {
      console.log(`  ${r.q}  ${sg(r.spread)}  ${sg(r.longonly)}  ${sg(r.market)}  ${String(r.nTop).padStart(7)}  ${String(r.days).padStart(4)}`);
    }

    // 7) 상승/하락 · 연도별
    console.log(`\n--- 7) 상승/하락 분기 분리 (진단용 · ${MAIN_H}일)`);
    for (const [lab, filt] of [["시장 상승 분기", (r) => r.market > 0], ["시장 하락 분기", (r) => r.market < 0]]) {
      const sub = rowsMain.filter(filt);
      if (!sub.length) { console.log(`  ${lab}: 없음`); continue; }
      console.log(`  ${lab}: ${sub.length}분기 (시장 ${mean(sub.map((r) => r.market)).toFixed(2)}%) | 롱-숏 ${sg(mean(sub.map((r) => r.spread)))}%p | 롱온리 ${sg(mean(sub.map((r) => r.longonly)))}%p`);
    }
    console.log(`\n  연도별 분해 (${MAIN_H}일, 롱온리)`);
    for (const y of ["2020", "2021", "2022", "2023", "2024", "2025"]) {
      const sub = rowsMain.filter((r) => r.q.startsWith(y));
      if (!sub.length) continue;
      const lo = sub.map((r) => r.longonly), sp = sub.map((r) => r.spread);
      console.log(`   ${y}: 분기 ${sub.length} | 롱온리 ${sg(mean(lo))}%p (양수 ${lo.filter((v) => v > 0).length}/${lo.length}) | 롱-숏 ${sg(mean(sp))}%p`);
    }

    // 9) 게이트
    const g1 = main.regLo.alpha >= 1.0, g2 = main.posQ >= 16;
    const up = rowsMain.filter((r) => r.market > 0).map((r) => r.longonly);
    const dn = rowsMain.filter((r) => r.market < 0).map((r) => r.longonly);
    const bad = up.length && dn.length && mean(up) < 0 && mean(dn) > 0;
    const verdict = bad || !g1 ? "탈락 — 종료" : g2 ? "1차 통과 — 홀드아웃 후보" : "2차 — 판별 불가(#10 으로)";
    console.log(`\n--- 9) 사전 등록 게이트 대입`);
    console.log(`  롱온리 α(${MAIN_H}일) ≥ +1.0%p ? ${main.regLo.alpha.toFixed(3)} → ${g1 ? "충족" : "미충족"}`);
    console.log(`  24분기 중 16분기 이상 양수 ? ${main.posQ}/${main.nQ} → ${g2 ? "충족" : "미충족"}`);
    console.log(`  상승 분기 음수 & 하락 분기만 양수 ? ${bad ? "해당 → 탈락" : "해당 없음"}`);
    console.log(`  → 판정: ${verdict}`);
    if (S.hDateDropped) console.log(`  (주체별 호라이즌-날짜 탈락 ${S.hDateDropped.toLocaleString()}건 — 상위/하위 분위 공백 또는 유효 관측 부족)`);
    verdicts[label] = { alpha: main.regLo.alpha, beta: main.regLo.beta, posQ: main.posQ, nQ: main.nQ, zeroRatio: zr, verdict };
  }

  fs.writeFileSync(path.join(L.CACHE_ROOT, "flow-result.json"), JSON.stringify({
    generatedAt: new Date().toISOString(), topN: TOP_N, flowW: FLOW_W, turnoverW: TURNOVER_W, univW: UNIV_W,
    acct, hAcct, series: outSeries, verdicts,
  }, null, 2));
  console.log(`\n저장: ${path.join(L.CACHE_ROOT, "flow-result.json")}`);
}

// 진단 2 — D 기준 직전 w 거래일 수익률(%). 게이트 아님.
function pastRet(S, i, w) {
  const j = i - w;
  if (j < 0 || !S.has[i] || !S.has[j]) return null;
  return (S.cl[i] / S.cl[j] - 1) * 100;
}

main();
