// #10 (2) 보고용 (가)(나)(다) — 게이트 아님, 판정을 바꾸지 않는다.
// 입력: momentum.cjs MOM_DUMP 덤프(날짜별 유니버스 행·(2) 포트폴리오 가중치), collect-extra.cjs 산출물.
//   (가) (2) Q5 포트폴리오의 [D+1, D+61] 수익 − 지수 수익: 코스피 / 코스닥 / 혼합(그날 포트폴리오
//        가중치의 시장 구성비로 두 지수를 섞음). 분기 = 날짜 평균, 분기 간은 Q5 칸 관측 가중 — momentum.cjs 와 같은 집계.
//   (나) flow 5분위별 60일 표류와 유니버스 대비 초과
//   (다) flow Q3 집단 특성 — 시가총액(과거 종가 × 현재 상장주식수, 근사)·60일 평균 거래대금·업종·시장
// 사용법: node analysis/holdout-extra.cjs <덤프.jsonl> <라벨>
const fs = require("fs");
const path = require("path");
const os = require("os");

const CACHE = path.join(os.homedir(), "stockker-bt-cache");
const [dumpFile, label = ""] = process.argv.slice(2);
const YEAR_DAYS = 246, H = 60, NQ = 5;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const sg = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}`;
const ann = (v) => v * YEAR_DAYS / H;

const market = new Map(JSON.parse(fs.readFileSync(path.join(CACHE, "universe_st.json"), "utf8")).map((u) => [u.code, u.market]));
const idx = {};
for (const [k, code] of [["KOSPI", "0001"], ["KOSDAQ", "1001"]]) {
  idx[k] = new Map(JSON.parse(fs.readFileSync(path.join(CACHE, "extra/index", `${code}.json`), "utf8")).rows.map((r) => [r.d, r.close]));
}
const info = JSON.parse(fs.readFileSync(path.join(CACHE, "extra/stockinfo.json"), "utf8"));
const idxRet = (k, a, b) => (idx[k].has(a) && idx[k].has(b) ? (idx[k].get(b) / idx[k].get(a) - 1) * 100 : null);

const days = fs.readFileSync(dumpFile, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
console.log(`=== #10 (2) 보고용 (가)(나)(다) — ${label} ===`);
console.log(`덤프 ${path.basename(dumpFile)} | 날짜 ${days.length} (${days[0].d} ~ ${days.at(-1).d})`);

// ── (가) ──
const byQ = new Map();
let idxMiss = 0, kospiW = [];
for (const D of days) {
  if (!D.flow || !D.e) continue;
  const rK = idxRet("KOSPI", D.e0, D.e), rQ = idxRet("KOSDAQ", D.e0, D.e);
  if (rK === null || rQ === null) { idxMiss++; continue; }
  let wK = 0, wAll = 0;
  for (const [s, w] of D.flow.w) { wAll += w; if (market.get(s) === "KOSPI") wK += w; }
  wK /= wAll; kospiW.push(wK);
  const blend = wK * rK + (1 - wK) * rQ;
  if (!byQ.has(D.q)) byQ.set(D.q, { ew: [], k: [], q: [], b: [], top: [], nTop: 0 });
  const a = byQ.get(D.q);
  a.ew.push(D.flow.top - D.flow.uni); a.k.push(D.flow.top - rK); a.q.push(D.flow.top - rQ); a.b.push(D.flow.top - blend); a.top.push(D.flow.top);
  a.nTop += D.flow.nTop;
}
const qs = [...byQ.keys()].sort();
const agg = (key) => {
  const v = qs.map((q) => mean(byQ.get(q)[key])), w = qs.map((q) => byQ.get(q).nTop);
  const W = w.reduce((x, y) => x + y, 0);
  return { wmean: v.reduce((s, x, i) => s + x * w[i], 0) / W, emean: mean(v), pos: v.filter((x) => x > 0).length, v };
};
console.log(`\n--- (가) Q5 포트폴리오 초과수익 (${H}일, 분기 ${qs.length}: ${qs[0]}~${qs.at(-1)}, 지수 결측 제외 ${idxMiss}일)`);
console.log(`  포트폴리오 코스피 비중 평균 ${(mean(kospiW) * 100).toFixed(1)}% (범위 ${(Math.min(...kospiW) * 100).toFixed(0)}~${(Math.max(...kospiW) * 100).toFixed(0)}%)`);
console.log(`  기준                        이벤트가중 /60일   연환산    분기동일가중 연환산   양수 분기`);
for (const [k, name] of [["ew", "동일가중 유니버스 (판정 기준)"], ["b", "혼합 지수 (주)"], ["k", "코스피 지수 (참고)"], ["q", "코스닥 지수 (참고)"]]) {
  const r = agg(k);
  console.log(`  ${name.padEnd(26)} ${sg(r.wmean, 3).padStart(10)}%p  ${sg(ann(r.wmean)).padStart(8)}%   ${sg(ann(r.emean)).padStart(12)}%   ${r.pos}/${qs.length}`);
}
const tq = agg("top");
console.log(`  (참고) Q5 포트폴리오 절대 수익 ${sg(tq.wmean, 3)}%/60일`);
console.log(`  분기별 [유니버스 / 혼합 / 코스피 / 코스닥] 초과(%p):`);
for (let i = 0; i < qs.length; i++) {
  const a = byQ.get(qs[i]);
  console.log(`   ${qs[i]}  ${sg(mean(a.ew), 3).padStart(8)} ${sg(mean(a.b), 3).padStart(8)} ${sg(mean(a.k), 3).padStart(8)} ${sg(mean(a.q), 3).padStart(8)}  (일 ${a.ew.length})`);
}

// ── (나) ──
const qd = Array.from({ length: NQ }, () => ({ raw: [], ex: [] }));
for (const D of days) {
  const valid = D.rows.filter((r) => r[5] !== null);
  if (valid.length < 100) continue;
  const u = mean(valid.map((r) => r[5]));
  for (let f = 0; f < NQ; f++) {
    const v = valid.filter((r) => r[1] === f).map((r) => r[5]);
    if (v.length) { qd[f].raw.push(mean(v)); qd[f].ex.push(mean(v) - u); }
  }
}
console.log(`\n--- (나) flow 분위별 ${H}일 표류 (날짜 평균, 분기 가중 아님)`);
console.log(`  ${qd.map((z, f) => `Q${f + 1} ${sg(mean(z.raw))}% (유니버스 대비 ${sg(mean(z.ex))})`).join(" | ")}`);

// ── (다) ──
const grp = { Q1: [], Q3: [], Q5: [], 전체: [] };
for (const D of days) {
  for (const [s, fq, , tv, cl] of D.rows) {
    const sh = info[s]?.shares;
    const rec = { s, mcap: sh ? (cl * sh) / 1e8 : null, tv: tv / 1e8, ind: info[s]?.industry || "(미상)", mk: market.get(s) || "(미상)" };
    grp["전체"].push(rec);
    if (fq === 0) grp.Q1.push(rec); else if (fq === 2) grp.Q3.push(rec); else if (fq === 4) grp.Q5.push(rec);
  }
}
console.log(`\n--- (다) flow 분위 집단 특성 (종목-일 풀링, 시가총액 = 과거 종가 × 현재 상장주식수 근사, 억원)`);
console.log(`  집단    종목-일     시총 중앙값   60일 거래대금 중앙값   코스닥 비중`);
for (const [k, v] of Object.entries(grp)) {
  const mc = v.map((r) => r.mcap).filter((x) => x !== null);
  console.log(`  ${k.padEnd(4)} ${String(v.length).padStart(10)}  ${Math.round(median(mc)).toLocaleString().padStart(12)}  ${Math.round(median(v.map((r) => r.tv))).toLocaleString().padStart(18)}  ${((v.filter((r) => r.mk === "KOSDAQ").length / v.length) * 100).toFixed(1).padStart(10)}%`);
}
const share = (v) => { const m = new Map(); for (const r of v) m.set(r.ind, (m.get(r.ind) || 0) + 1); return m; };
const s3 = share(grp.Q3), sAll = share(grp["전체"]);
const top = [...s3.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`  Q3 업종 상위 8 (Q3 비중 / 전체 비중):`);
for (const [ind, c] of top) console.log(`   ${ind.padEnd(14)} ${((c / grp.Q3.length) * 100).toFixed(1).padStart(5)}% / ${(((sAll.get(ind) || 0) / grp["전체"].length) * 100).toFixed(1).padStart(5)}%`);
const miss = grp["전체"].filter((r) => r.mcap === null).length;
console.log(`  상장주식수 미상 종목-일 ${miss.toLocaleString()} (시총 중앙값에서 제외)`);
