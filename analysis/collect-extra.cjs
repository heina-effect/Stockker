// #10 홀드아웃 보고용 (가)(다) 보조 데이터 수집 — 게이트 아님.
//   index/{0001,1001}.json  코스피·코스닥 지수 일봉 (FHKUP03500100), 2020-01-01 ~ END
//   stockinfo.json          종목별 현재가 상세 (FHKST01010100) — 상장주식수·시가총액·업종명
// 상장주식수는 현재값이라 과거 시가총액은 '과거 종가 × 현재 상장주식수' 근사다(증자·소각 무시).
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const OUT = path.join(L.CACHE_ROOT, "extra");
fs.mkdirSync(path.join(OUT, "index"), { recursive: true });
const START = "20200101";
const END = process.env.EXTRA_END || "20261026";
const ymd = (t) => `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
const toDate = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)));

async function call(url, trId) {
  try { return await L.callKisApi(url, { method: "GET", trId, useQuoteCreds: true }); }
  catch (e) {
    if (!/EGW00201|초당 거래건수/.test(String(e?.message || e))) throw e;
    await new Promise((r) => setTimeout(r, 1200));
    return L.callKisApi(url, { method: "GET", trId, useQuoteCreds: true });
  }
}

async function indexDaily(code) {
  const seen = new Map();
  let end = toDate(END);
  for (let page = 0; page < 60; page++) {
    await L.waitIfBlackout(() => {});
    const start = new Date(end.getTime() - 90 * 86400000);
    const data = await call(`/uapi/domestic-stock/v1/quotations/inquire-index-price?${new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "U", FID_INPUT_ISCD: code, FID_INPUT_DATE_1: ymd(start), FID_INPUT_DATE_2: ymd(end), FID_PERIOD_DIV_CODE: "D",
    })}`, "FHKUP03500100");
    if (data.rt_cd !== "0") throw new Error(`${code}: ${data.msg1}`);
    const rows = (data.output2 || []).filter((r) => /^\d{8}$/.test(String(r.stck_bsop_date || "")));
    if (!rows.length) break;
    let oldest = null;
    for (const r of rows) {
      const d = String(r.stck_bsop_date);
      if (!oldest || d < oldest) oldest = d;
      if (d >= START && d <= END) seen.set(d, { d, close: Number(r.bstp_nmix_prpr) });
    }
    if (oldest <= START) break;
    end = new Date(toDate(oldest).getTime() - 86400000);
  }
  const rows = [...seen.values()].sort((a, b) => a.d.localeCompare(b.d));
  fs.writeFileSync(path.join(OUT, "index", `${code}.json`), JSON.stringify({ code, fetchedAt: new Date().toISOString(), rows }));
  console.log(`[지수 ${code}] ${rows.length}일 (${rows[0]?.d} ~ ${rows.at(-1)?.d})`);
}

async function stockInfo() {
  const f = path.join(OUT, "stockinfo.json");
  const have = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {};   // 체크포인트
  const U = JSON.parse(fs.readFileSync(path.join(L.CACHE_ROOT, "universe-9.json"), "utf8")).symbols;
  let n = 0, fail = 0;
  for (const s of U) {
    n++;
    if (have[s]) continue;
    await L.waitIfBlackout(() => {});
    try {
      const data = await call(`/uapi/domestic-stock/v1/quotations/inquire-price?${new URLSearchParams({ FID_COND_MRKT_DIV_CODE: "J", FID_INPUT_ISCD: s })}`, "FHKST01010100");
      const o = data.output || {};
      have[s] = { shares: Number(o.lstn_stcn || 0), mcapEok: Number(o.hts_avls || 0), industry: String(o.bstp_kor_isnm || "").trim(), rt: data.rt_cd };
    } catch (e) { fail++; have[s] = { error: String(e?.message || e).slice(0, 120) }; }
    if (n % 200 === 0) { fs.writeFileSync(f, JSON.stringify(have)); console.log(`[종목정보] ${n}/${U.length} 실패 ${fail}`); }
  }
  fs.writeFileSync(f, JSON.stringify(have));
  console.log(`[종목정보] 완료 ${Object.keys(have).length}/${U.length} 실패 ${fail}`);
}

(async () => {
  for (const c of ["0001", "1001"]) await indexDaily(c);
  await stockInfo();
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
