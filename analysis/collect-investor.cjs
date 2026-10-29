// #9 Phase 1 — 종목별 투자자매매동향(일별) 수집. TR FHPTJ04160001.
//
// 단위 주의: 같은 응답 안에서 단위가 다르다.
//   acml_tr_pbmn          = 원
//   *_ntby_tr_pbmn (순매수금액) = 백만원   ← 검산: 삼성 20250616 외국인 -6,936,197주 × 57,200원
//                                            = -396,750백만원 vs 응답 -396,865백만원 (장중 VWAP 차)
//   분석에서 flow 비율을 만들 때 ×1e6 으로 원 단위를 맞춰야 한다.
//
// 상장 이전 구간은 '행은 오지만 전부 0'으로 응답한다. 여기서는 그대로 저장하고,
// 결측 판정(일봉 캐시에 유효 종가가 없는 날)은 분석 단계에서 교차 검증한다.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const OUT_DIR = path.join(L.CACHE_ROOT, "investor");   // ~/stockker-bt-cache/investor
fs.mkdirSync(OUT_DIR, { recursive: true });

const START = "20200101";
const END = "20251231";                                 // 2026 열람 금지
const EP = "/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily";
const TR = "FHPTJ04160001";
const KEEP = ["stck_bsop_date", "stck_clpr", "acml_vol", "acml_tr_pbmn",
  "frgn_ntby_qty", "frgn_ntby_tr_pbmn", "orgn_ntby_qty", "orgn_ntby_tr_pbmn",
  "prsn_ntby_tr_pbmn", "etc_ntby_tr_pbmn"];

const LIMIT = Number(process.env.LIMIT || 0);           // 0 = 전체
const ONLY = (process.env.ONLY || "").split(",").filter(Boolean);

async function fetchOne(symbol, anchor) {
  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: symbol,
    FID_INPUT_DATE_1: anchor, FID_ORG_ADJ_PRC: "", FID_ETC_CLS_CODE: "",
  }).toString();
  const call = () => L.callKisApi(`${EP}?${qs}`, { method: "GET", trId: TR, useQuoteCreds: true });
  try {
    return await call();
  } catch (e) {
    const msg = String(e?.message || e);
    if (/EGW00201|초당 거래건수/.test(msg)) {            // rate limit → 1회 백오프
      await new Promise((r) => setTimeout(r, 1200));
      return await call();
    }
    throw e;
  }
}

const prevDay = (d) => {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) - 86400000);
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
};

// 한 종목 전 기간 — 30거래일씩 역방향 연쇄
async function collectSymbol(symbol, minNeeded) {
  const seen = new Set();
  const rows = [];
  let anchor = END;
  let calls = 0;

  for (let page = 0; page < 60; page++) {
    await L.waitIfBlackout(() => {});
    let data;
    try { data = await fetchOne(symbol, anchor); calls++; }
    catch (e) { if (page === 0) throw e; break; }
    if (data.rt_cd !== "0") { if (page === 0) throw new Error(`rt_cd=${data.rt_cd} ${data.msg1}`); break; }

    const o2 = Array.isArray(data.output2) ? data.output2 : [];
    if (!o2.length) break;
    let oldest = null, added = 0;
    for (const r of o2) {
      const d = String(r.stck_bsop_date || "");
      if (!/^\d{8}$/.test(d)) continue;
      if (!oldest || d < oldest) oldest = d;
      if (d < START || d > END) continue;                // 구간 밖·2026 차단
      if (seen.has(d)) continue;
      seen.add(d);
      const o = {};
      for (const k of KEEP) o[k] = r[k];
      rows.push(o);
      added++;
    }
    if (!oldest) break;
    if (oldest <= minNeeded || oldest <= START) break;    // 목표 시작일 도달
    if (added === 0 && oldest > START) { anchor = prevDay(oldest); continue; }
    anchor = prevDay(oldest);
  }
  rows.sort((a, b) => String(a.stck_bsop_date).localeCompare(String(b.stck_bsop_date)));
  return { rows, calls };
}

(async () => {
  const U = JSON.parse(fs.readFileSync(path.join(L.CACHE_ROOT, "universe-9.json"), "utf8"));
  let symbols = ONLY.length ? ONLY : U.symbols;
  if (LIMIT) symbols = symbols.slice(0, LIMIT);

  // 종목별 최소 필요 시작일 = 일봉 캐시의 해당 구간 최소 거래일 (상장 이후만 받는다)
  const minNeed = new Map();
  for (const s of symbols) {
    const p = L.loadCandles(s);
    let m = END;
    if (p?.candles) for (const c of p.candles) {
      const d = String(c.stck_bsop_date);
      if (d >= START && d <= END && Number(c.stck_clpr || 0) > 0 && d < m) m = d;
    }
    minNeed.set(s, m);
  }

  const t0 = Date.now();
  let done = 0, skipped = 0, failed = 0, totalCalls = 0, totalRows = 0;
  const fails = [];

  for (const s of symbols) {
    const f = path.join(OUT_DIR, `${s}.json`);
    if (fs.existsSync(f)) {                               // 체크포인트
      try {
        const prev = JSON.parse(fs.readFileSync(f, "utf8"));
        if (prev?.rows?.length && prev.minDate <= minNeed.get(s)) { skipped++; totalRows += prev.rows.length; continue; }
      } catch { /* 깨진 파일은 다시 받는다 */ }
    }
    try {
      const { rows, calls } = await collectSymbol(s, minNeed.get(s));
      totalCalls += calls; totalRows += rows.length;
      fs.writeFileSync(f, JSON.stringify({
        symbol: s, fetchedAt: new Date().toISOString(), tr: TR,
        minDate: rows.length ? rows[0].stck_bsop_date : END,
        maxDate: rows.length ? rows[rows.length - 1].stck_bsop_date : END,
        note: "ntby_tr_pbmn 단위=백만원, acml_tr_pbmn 단위=원",
        rows,
      }));
      done++;
    } catch (e) {
      failed++; fails.push(`${s}: ${String(e?.message || e).slice(0, 120)}`);
      fs.writeFileSync(path.join(OUT_DIR, `${s}.error.json`), JSON.stringify({ symbol: s, error: String(e?.message || e) }));
    }
    const n = done + skipped + failed;
    if (n % 25 === 0 || n === symbols.length) {
      const el = (Date.now() - t0) / 1000;
      const rate = done > 0 ? el / done : 0;
      const left = symbols.length - n;
      console.log(`[${n}/${symbols.length}] 신규 ${done} / 스킵 ${skipped} / 실패 ${failed} | 호출 ${totalCalls.toLocaleString()} | 경과 ${(el / 60).toFixed(1)}분 | 남은 추정 ${((rate * left) / 3600).toFixed(1)}시간`);
    }
  }

  console.log(`\n=== 수집 완료 ===`);
  console.log(`종목 ${symbols.length.toLocaleString()} (신규 ${done} / 스킵 ${skipped} / 실패 ${failed})`);
  console.log(`호출 ${totalCalls.toLocaleString()} | 행 ${totalRows.toLocaleString()} | 소요 ${((Date.now() - t0) / 3600000).toFixed(2)}시간`);
  if (fails.length) { console.log(`\n실패 목록(최대 20):`); for (const x of fails.slice(0, 20)) console.log(`  ${x}`); }
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
