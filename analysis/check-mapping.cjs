// 매핑 누락 원인 진단 — 캐시 유니버스 ∩ DART corp_code 매핑 실패 종목 분석
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");

const CORP_XML = path.join(L.DART_DIR, "CORPCODE.xml");
const xml = fs.readFileSync(CORP_XML, "utf8");

// ── DART 측 파싱: 필터 없이 전부 긁어 자료형을 그대로 본다 ──
const dartRows = [];
const re = /<list>([\s\S]*?)<\/list>/g;
let m;
while ((m = re.exec(xml)) !== null) {
  const b = m[1];
  const corp = (b.match(/<corp_code>(.*?)<\/corp_code>/) || [])[1];
  const stockRaw = (b.match(/<stock_code>(.*?)<\/stock_code>/) || [])[1];
  const name = (b.match(/<corp_name>(.*?)<\/corp_name>/) || [])[1];
  if (stockRaw === undefined) continue;
  const stock = String(stockRaw).trim();
  if (stock === "" || stock === " ") continue;
  dartRows.push({ corp, stock, name });
}

console.log("=== 2) 자료형 확인 ===");
console.log(`DART stock_code: 총 ${dartRows.length}건`);
const sample = dartRows.slice(0, 3);
for (const r of sample) console.log(`  예: typeof=${typeof r.stock} value="${r.stock}" (길이 ${r.stock.length}) name=${r.name}`);
const dartNonDigit = dartRows.filter((r) => !/^\d{6}$/.test(r.stock));
console.log(`  6자리 숫자 패턴이 아닌 코드: ${dartNonDigit.length}건`);
if (dartNonDigit.length) console.log(`   샘플: ${dartNonDigit.slice(0, 8).map((r) => `"${r.stock}"(${r.name})`).join(", ")}`);
const dartLeadingZero = dartRows.filter((r) => r.stock.startsWith("0")).length;
console.log(`  0으로 시작: ${dartLeadingZero}건 (${((dartLeadingZero / dartRows.length) * 100).toFixed(1)}%) → 선행 0 보존됨`);

const universe = JSON.parse(fs.readFileSync(path.join(L.CACHE_ROOT, "universe_st.json"), "utf8"));
console.log(`\nuniverse_st.json: 총 ${universe.length}종목`);
for (const u of universe.slice(0, 3)) console.log(`  예: typeof=${typeof u.code} value="${u.code}" (길이 ${String(u.code).length}) market=${u.market}`);
const uniNonDigit = universe.filter((u) => !/^\d{6}$/.test(String(u.code)));
console.log(`  6자리 숫자 패턴이 아닌 코드: ${uniNonDigit.length}건`);
if (uniNonDigit.length) console.log(`   샘플: ${uniNonDigit.slice(0, 8).map((u) => `"${u.code}"`).join(", ")}`);

// ── 정규화 후 재매칭 ──
const norm = (c) => String(c).trim().toUpperCase().padStart(6, "0");
const mapOld = new Map();          // 기존(수집 스크립트와 동일): ^\d{6}$ 필터
for (const r of dartRows) if (/^\d{6}$/.test(r.stock)) mapOld.set(r.stock, r.corp);
const mapNew = new Map();          // 정규화: 문자 포함 코드도 수용
for (const r of dartRows) mapNew.set(norm(r.stock), r.corp);

const cached = L.listCachedSymbols();
console.log(`\n=== 1) 매핑 실패 종목 (현재 캐시 ${cached.length}종목 스냅샷) ===`);
const missOld = cached.filter((s) => !mapOld.has(s));
const missNew = cached.filter((s) => !mapNew.has(norm(s)));
console.log(`기존 필터(^\\d{6}$) 매핑: ${cached.length - missOld.length}/${cached.length} (${(((cached.length - missOld.length) / cached.length) * 100).toFixed(1)}%), 실패 ${missOld.length}건`);
console.log(`실패 코드 전체: ${missOld.join(", ") || "(없음)"}`);
const zeroLead = missOld.filter((s) => s.startsWith("0")).length;
if (missOld.length) console.log(`  그중 0으로 시작: ${zeroLead}/${missOld.length} (${((zeroLead / missOld.length) * 100).toFixed(0)}%)`);
const letterCode = missOld.filter((s) => /[A-Z]/i.test(s));
console.log(`  그중 문자 포함: ${letterCode.length}건 ${letterCode.length ? "→ " + letterCode.join(", ") : ""}`);

console.log(`\n=== 4) 정규화(padStart+toUpperCase) 후 재매칭 ===`);
console.log(`정규화 매핑: ${cached.length - missNew.length}/${cached.length} (${(((cached.length - missNew.length) / cached.length) * 100).toFixed(1)}%), 실패 ${missNew.length}건`);
if (missNew.length) {
  console.log(`여전히 실패: ${missNew.join(", ")}`);
  // 유니버스 쪽 이름 정보가 없으니 DART에서 유사 코드 탐색
  for (const s of missNew.slice(0, 25)) {
    const near = dartRows.filter((r) => r.stock.replace(/[^0-9]/g, "") === s.replace(/[^0-9]/g, ""));
    console.log(`  ${s}: DART 내 숫자부 일치 후보 ${near.length}건 ${near.slice(0, 3).map((r) => `"${r.stock}"(${r.name})`).join(", ")}`);
  }
}

// 전체 유니버스 기준으로도 산출(캐시 진행과 무관한 상한)
const missUni = universe.filter((u) => !mapNew.has(norm(u.code)));
console.log(`\n=== 전체 유니버스 ${universe.length}종목 기준(캐시 진행과 무관) ===`);
console.log(`정규화 매핑: ${universe.length - missUni.length}/${universe.length} (${(((universe.length - missUni.length) / universe.length) * 100).toFixed(1)}%), 실패 ${missUni.length}건`);
if (missUni.length) console.log(`실패 코드: ${missUni.slice(0, 40).map((u) => u.code).join(", ")}${missUni.length > 40 ? ` ... 외 ${missUni.length - 40}건` : ""}`);
