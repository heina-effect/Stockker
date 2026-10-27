// DART 정기공시(pblntf_ty=A) 수집 — 2020~2025, 코스피(Y)+코스닥(K), 분기 단위 페이지네이션.
// 사전 확정 규칙: 정정·첨부류 제외, 원본 정기보고서만 이벤트로 사용.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const L = require("./bt-lib.cjs");

const KEY = fs.readFileSync(path.join(L.PROJECT, ".env.local"), "utf8").match(/^DART_API_KEY=(.*)$/m)[1].trim();
const YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const CORP_XML = path.join(L.DART_DIR, "CORPCODE.xml");

// 종목코드 정규화 — 양쪽(KIS 마스터 / DART CORPCODE)을 같은 형태로 맞춘다
const normCode = (c) => String(c).trim().toUpperCase().padStart(6, "0");

// 정정·첨부류 판별 — 신규 실적 정보가 아니고 같은 기업-분기를 중복 계상시킨다
const isAmendment = (nm) => /\[(기재정정|첨부정정|첨부추가|변경등록|연장결정|정정)\]/.test(nm);
const reportKind = (nm) =>
  nm.includes("사업보고서") ? "사업보고서" : nm.includes("반기보고서") ? "반기보고서" : nm.includes("분기보고서") ? "분기보고서" : "기타";

async function ensureCorpCode() {
  if (!fs.existsSync(CORP_XML)) {
    const zip = path.join(L.DART_DIR, "corpcode.zip");
    execFileSync("curl", ["-s", "--max-time", "300", "-o", zip, `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${KEY}`]);
    execFileSync("unzip", ["-o", "-q", zip, "-d", L.DART_DIR]);
  }
  const xml = fs.readFileSync(CORP_XML, "utf8");
  const map = new Map();
  const re = /<list>([\s\S]*?)<\/list>/g;
  let m, total = 0;
  while ((m = re.exec(xml)) !== null) {
    total++;
    const b = m[1];
    const corp = (b.match(/<corp_code>(.*?)<\/corp_code>/) || [])[1];
    const stock = ((b.match(/<stock_code>(.*?)<\/stock_code>/) || [])[1] || "").trim();
    // 숫자 6자리로 거르면 안 된다 — 한국 종목코드에는 문자 포함 코드가 있다
    // (0068Y0 스팩, 0030R0 리츠, 00088K 전환우선주 등 DART에 68건). 초기 버전이 이를
    // 버려 매핑률이 95.8% → 87.2%로 떨어졌다. 대문자·선행 0으로 정규화해 그대로 수용한다.
    if (stock) map.set(normCode(stock), corp);
  }
  console.log(`[corpCode] 총 법인 ${total.toLocaleString()}건 / 상장(종목코드 보유) ${map.size.toLocaleString()}건`);
  return map;
}

async function collect() {
  const quarters = [];
  for (const y of YEARS) {
    quarters.push([`${y}0101`, `${y}0331`], [`${y}0401`, `${y}0630`], [`${y}0701`, `${y}0930`], [`${y}1001`, `${y}1231`]);
  }
  const out = [];
  let calls = 0;
  for (const cls of ["Y", "K"]) {
    for (const [bgn, end] of quarters) {
      let page = 1, totalPage = 1;
      do {
        const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&bgn_de=${bgn}&end_de=${end}&pblntf_ty=A&corp_cls=${cls}&page_no=${page}&page_count=100`;
        const d = await (await fetch(url)).json();
        calls++;
        if (d.status !== "000") {
          if (d.status !== "013") console.log(`  [경고] ${cls} ${bgn} p${page}: ${d.status} ${d.message}`);
          break;
        }
        totalPage = Number(d.total_page || 1);
        for (const r of d.list || []) out.push(r);
        page++;
        await new Promise((r) => setTimeout(r, 120));
      } while (page <= totalPage);
    }
    console.log(`  ${cls} 완료: 누적 ${out.length.toLocaleString()}건 (호출 ${calls})`);
  }
  console.log(`[수집] 총 호출 ${calls}회`);
  return out;
}

(async () => {
  const map = await ensureCorpCode();
  const raw = await collect();
  const amend = raw.filter((r) => isAmendment(r.report_nm));
  const fresh = raw.filter((r) => !isAmendment(r.report_nm));

  console.log(`\n=== 수집 결과 (${YEARS[0]}~${YEARS[YEARS.length - 1]}) ===`);
  console.log(`원시 ${raw.length.toLocaleString()}건`);
  console.log(`  - 정정·첨부류 제외 ${amend.length.toLocaleString()}건 (${((amend.length / raw.length) * 100).toFixed(1)}%)`);
  console.log(`  = 원본 정기보고서 ${fresh.length.toLocaleString()}건`);
  const kinds = {};
  for (const r of fresh) kinds[reportKind(r.report_nm)] = (kinds[reportKind(r.report_nm)] || 0) + 1;
  console.log(`  종류: ${JSON.stringify(kinds)}`);

  // 캐시 유니버스 ∩ DART 매핑
  const cached = new Set(L.listCachedSymbols());
  const inBoth = fresh.filter((r) => { const s = normCode(r.stock_code || ""); return cached.has(s) && map.has(s); });
  const symbols = new Set(inBoth.map((r) => r.stock_code.trim()));
  console.log(`\n캐시 유니버스(${cached.size.toLocaleString()}종목) ∩ DART 매핑: 공시 ${inBoth.length.toLocaleString()}건 / 종목 ${symbols.size.toLocaleString()}개`);
  if (symbols.size) console.log(`  종목당 평균 ${(inBoth.length / symbols.size).toFixed(2)}건`);

  const q = (d) => `${d.slice(0, 4)}Q${Math.floor((+d.slice(4, 6) - 1) / 3) + 1}`;
  const byQ = {};
  for (const r of fresh) byQ[q(r.rcept_dt)] = (byQ[q(r.rcept_dt)] || 0) + 1;
  console.log(`\n분기별 접수(원본 전체, ${Object.keys(byQ).length}분기):`);
  for (const k of Object.keys(byQ).sort()) console.log(`  ${k}: ${String(byQ[k]).padStart(6)}건`);

  fs.writeFileSync(path.join(L.DART_DIR, "filings.json"), JSON.stringify(fresh));
  fs.writeFileSync(path.join(L.DART_DIR, "mapping.json"), JSON.stringify([...map]));
  console.log(`\n저장: ${path.join(L.DART_DIR, "filings.json")} (${fresh.length.toLocaleString()}건)`);
})().catch((e) => { console.error("FAIL:", e); process.exit(1); });
