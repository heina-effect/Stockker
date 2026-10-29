// #9 선행 — KIS 종목별 투자자매매동향(일별) 가용성 실측. 읽기 전용, 수집 아님.
// TR: FHPTJ04160001 / GET /uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily
// 출처: koreainvestment/open-trading-api examples_llm/domestic_stock/investor_trade_by_stock_daily
//
// 2026 열람 금지 — 기준일(FID_INPUT_DATE_1)에 2026 날짜를 넣지 않고, 응답 행 중
// 2026 이후는 출력에서 가린다.
const L = require("./bt-lib.cjs");
L.quietKisDebug();

const SEAL = "20251231";
const EP = "/uapi/domestic-stock/v1/quotations/investor-trade-by-stock-daily";
const TR = "FHPTJ04160001";

async function call(symbol, date1, extra = {}) {
  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: "J",
    FID_INPUT_ISCD: symbol,
    FID_INPUT_DATE_1: date1,
    FID_ORG_ADJ_PRC: "",
    FID_ETC_CLS_CODE: "",
    ...extra,
  }).toString();
  try {
    return { ok: true, data: await L.callKisApi(`${EP}?${qs}`, { method: "GET", trId: TR, useQuoteCreds: true }) };
  } catch (e) {
    return { ok: false, err: String(e?.message || e).slice(0, 220) };
  }
}

// 응답에서 일자 필드를 찾아 행 범위를 요약
function summarize(data) {
  const o1 = Array.isArray(data.output1) ? data.output1 : data.output1 ? [data.output1] : [];
  const o2 = Array.isArray(data.output2) ? data.output2 : data.output2 ? [data.output2] : [];
  const rows = o2.length ? o2 : o1;
  const dateKey = rows.length ? Object.keys(rows[0]).find((k) => /dt|date/i.test(k) && /^\d{8}$/.test(String(rows[0][k]))) : null;
  const dates = dateKey ? rows.map((r) => String(r[dateKey])).filter((d) => /^\d{8}$/.test(d)).sort() : [];
  return { o1n: o1.length, o2n: o2.length, rows, dateKey, dates, o1keys: o1[0] ? Object.keys(o1[0]) : [], o2keys: o2[0] ? Object.keys(o2[0]) : [] };
}

(async () => {
  await L.waitIfBlackout();

  const symbols = [
    ["005930", "삼성전자 (KOSPI 초대형)"],
    ["035720", "카카오 (KOSPI 대형)"],
    ["067170", "오텍 (KOSDAQ 소형)"],
  ];
  const probes = [["20200115", "2020-01"], ["20220615", "2022-06"], ["20250616", "2025-06"]];

  console.log("=".repeat(80));
  console.log(`TR ${TR} | ${EP}`);
  console.log("필수 파라미터: FID_COND_MRKT_DIV_CODE(J/NX/UN), FID_INPUT_ISCD(6자리), FID_INPUT_DATE_1(YYYYMMDD)");
  console.log("              FID_ORG_ADJ_PRC(공란), FID_ETC_CLS_CODE(공란)");
  console.log("=".repeat(80));

  // ── 1) 스키마·응답 건수 (최신 구간 1건으로 필드 전수 확인) ──
  const probe0 = await call("005930", "20250616");
  if (!probe0.ok) { console.log(`\n[치명] 첫 호출 실패: ${probe0.err}`); return; }
  if (probe0.data.rt_cd !== "0") { console.log(`\n[치명] rt_cd=${probe0.data.rt_cd} msg=${probe0.data.msg1}`); return; }
  const s0 = summarize(probe0.data);
  console.log(`\n=== 응답 구조 ===`);
  console.log(`  output1 ${s0.o1n}행 / output2 ${s0.o2n}행 | 일자 필드 '${s0.dateKey}'`);
  console.log(`  output1 필드(${s0.o1keys.length}): ${s0.o1keys.join(", ")}`);
  console.log(`  output2 필드(${s0.o2keys.length}): ${s0.o2keys.join(", ")}`);
  if (s0.rows[0]) {
    console.log(`\n  샘플 1행 (최신):`);
    for (const [k, v] of Object.entries(s0.rows[0])) console.log(`    ${k.padEnd(22)} ${v}`);
  }

  // ── 2) 종목 3개 × 날짜 3구간 ──
  console.log(`\n${"=".repeat(80)}\n=== 종목 3개 × 날짜 3구간 조회 가능성 ===`);
  for (const [sym, label] of symbols) {
    console.log(`\n--- ${sym} ${label}`);
    for (const [d, dl] of probes) {
      const r = await call(sym, d);
      if (!r.ok) { console.log(`  ${dl} (기준일 ${d}): 호출 실패 — ${r.err}`); continue; }
      if (r.data.rt_cd !== "0") { console.log(`  ${dl} (기준일 ${d}): rt_cd=${r.data.rt_cd} ${r.data.msg_cd} ${r.data.msg1}`); continue; }
      const s = summarize(r.data);
      const vis = s.dates.filter((x) => x <= SEAL);
      if (!vis.length) { console.log(`  ${dl} (기준일 ${d}): 행 ${s.o2n || s.o1n}건이나 일자 없음/봉인 밖`); continue; }
      console.log(`  ${dl} (기준일 ${d}): ${vis.length}행 | ${vis[0]} ~ ${vis[vis.length - 1]} | 기준일 포함 ${vis.includes(d) ? "O" : "X"}`);
    }
  }

  // ── 3) 가장 오래된 조회 가능일 실측 (삼성전자로 과거 탐침) ──
  // 실측 결과(2026-10-27): 19970115 기준일에도 30행(19961211~19970115) 응답.
  // 2020~2025 구간에는 과거 한계 제약이 전혀 없다.
  console.log(`\n${"=".repeat(80)}\n=== 과거 한계 탐침 (005930) ===`);
  for (const d of ["19970115", "20000115", "20050115", "20100115", "20150115", "20200115"]) {
    const r = await call("005930", d);
    if (!r.ok) { console.log(`  기준일 ${d}: 호출 실패 — ${r.err}`); continue; }
    if (r.data.rt_cd !== "0") { console.log(`  기준일 ${d}: rt_cd=${r.data.rt_cd} ${r.data.msg1}`); continue; }
    const s = summarize(r.data);
    const vis = s.dates.filter((x) => x <= SEAL);
    console.log(`  기준일 ${d}: ${vis.length}행 ${vis.length ? `| ${vis[0]} ~ ${vis[vis.length - 1]}` : "| (빈 응답)"}`);
  }

  // ── 4) 페이지네이션 연속성: 기준일을 30거래일씩 물려 내려도 겹치지 않는가 ──
  // 겹침이 있으면 1종목 50회 산정이 무너지므로 비용 산정의 전제다.
  console.log(`\n${"=".repeat(80)}\n=== 페이지네이션 연속성 (005930) ===`);
  {
    const a1 = await call("005930", "20250616");
    const d1 = (a1.data.output2 || []).map((x) => String(x.stck_bsop_date)).sort();
    const prev = d1[0];
    const pd = new Date(Date.UTC(+prev.slice(0, 4), +prev.slice(4, 6) - 1, +prev.slice(6, 8)) - 86400000);
    const nextAnchor = `${pd.getUTCFullYear()}${String(pd.getUTCMonth() + 1).padStart(2, "0")}${String(pd.getUTCDate()).padStart(2, "0")}`;
    const a2 = await call("005930", nextAnchor);
    const d2 = (a2.data.output2 || []).map((x) => String(x.stck_bsop_date)).sort();
    const ov = d2.filter((x) => d1.includes(x));
    console.log(`  1구간 ${d1.length}행 ${d1[0]} ~ ${d1[d1.length - 1]}`);
    console.log(`  2구간 ${d2.length}행 ${d2[0]} ~ ${d2[d2.length - 1]} (기준일 ${nextAnchor})`);
    console.log(`  중복 ${ov.length}건 → ${ov.length === 0 ? "겹침 없음 ✓" : "겹침 있음 — 호출 수 재산정 필요"}`);
  }

  // ── 5) 수급 데이터 밀도 + 항등식 ──
  // 상장 이전 구간은 '행은 오지만 전부 0'으로 응답한다. 0을 '순매수 0'으로 읽으면
  // 미상장 구간이 관측치로 섞인다 — 수집 시 반드시 상장일·가격 유효성과 교차 검증해야 한다.
  console.log(`\n${"=".repeat(80)}\n=== 수급 데이터 밀도 (0이 아닌 행 수 / 30) ===`);
  for (const [sym, label] of [["005930", "삼성전자"], ["067170", "오텍(소형)"], ["348030", "모비릭스(초소형)"]]) {
    for (const d of ["20200115", "20250616"]) {
      const r = await call(sym, d);
      const o2 = (r.ok && r.data.output2) || [];
      if (!o2.length) { console.log(`  ${label} ${d}: 응답 없음`); continue; }
      const nz = (k) => o2.filter((x) => Number(x[k] || 0) !== 0).length;
      console.log(`  ${label.padEnd(16)} ${d}: 외국인 ${nz("frgn_ntby_qty")} | 기관 ${nz("orgn_ntby_qty")} | 개인 ${nz("prsn_ntby_qty")} | 투신 ${nz("ivtr_ntby_qty")} | 연기금 ${nz("fund_ntby_qty")}`);
    }
  }
  {
    const r = await call("005930", "20250616");
    const row = (r.data.output2 || [])[0];
    const id = ["frgn_ntby_qty", "orgn_ntby_qty", "prsn_ntby_qty", "etc_ntby_qty"].reduce((a, k) => a + Number(row[k] || 0), 0);
    const org = ["scrt_ntby_qty", "ivtr_ntby_qty", "pe_fund_ntby_vol", "bank_ntby_qty", "insu_ntby_qty", "mrbn_ntby_qty", "fund_ntby_qty"]
      .reduce((a, k) => a + Number(row[k] || 0), 0);
    console.log(`\n  항등식(${row.stck_bsop_date}): 외국인+기관+개인+기타 = ${id.toLocaleString()}주 (0이어야 함)`);
    console.log(`  기관 세부 합 ${org.toLocaleString()} vs 기관 합계 ${Number(row.orgn_ntby_qty).toLocaleString()} → 차 ${(org - Number(row.orgn_ntby_qty)).toLocaleString()}주`);
  }
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
