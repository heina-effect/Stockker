// 매핑 실패 잔여분(114건) 원인 검증 — 우선주/복수종목 가설
// DART corp_code는 "법인" 단위다. 한 법인이 보통주+우선주를 상장하면 CORPCODE.xml에는
// 보통주 종목코드 하나만 실린다 → 우선주는 설계상 매핑 불가.
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");

const xml = fs.readFileSync(path.join(L.DART_DIR, "CORPCODE.xml"), "utf8");
const dart = new Map();     // 정규화 코드 → {corp, name}
const re = /<list>([\s\S]*?)<\/list>/g;
let m;
while ((m = re.exec(xml)) !== null) {
  const b = m[1];
  const stock = String((b.match(/<stock_code>(.*?)<\/stock_code>/) || [])[1] || "").trim();
  if (!stock) continue;
  dart.set(stock.toUpperCase().padStart(6, "0"), {
    corp: (b.match(/<corp_code>(.*?)<\/corp_code>/) || [])[1],
    name: (b.match(/<corp_name>(.*?)<\/corp_name>/) || [])[1],
  });
}

const universe = JSON.parse(fs.readFileSync(path.join(L.CACHE_ROOT, "universe_st.json"), "utf8"));
const norm = (c) => String(c).trim().toUpperCase().padStart(6, "0");
const missing = universe.map((u) => norm(u.code)).filter((c) => !dart.has(c));

// 우선주 추정 규칙: 보통주 코드는 끝자리 0. 우선주는 끝자리 5/7/9 또는 문자 접미(K/L/M…).
// 각 실패 코드의 "보통주 후보"를 만들어 DART에 존재하는지 확인한다.
function baseCandidates(code) {
  const out = new Set();
  if (/^\d{6}$/.test(code)) out.add(code.slice(0, 5) + "0");          // 005935 → 005930
  if (/[A-Z]$/.test(code)) out.add(code.slice(0, 5) + "0");           // 00088K → 000880
  if (/^\d{5}[A-Z]$/.test(code)) out.add(code.slice(0, 5) + "0");
  if (/^\d{2}[0-9A-Z]{3}[A-Z]$/.test(code)) out.add(code.slice(0, 5) + "0");
  return [...out].filter((c) => c !== code);
}

let explained = 0, unexplained = [];
const examples = [];
for (const code of missing) {
  const hit = baseCandidates(code).find((c) => dart.has(c));
  if (hit) {
    explained++;
    if (examples.length < 12) examples.push({ code, base: hit, name: dart.get(hit).name, corp: dart.get(hit).corp });
  } else {
    unexplained.push(code);
  }
}

console.log(`=== 실패 ${missing.length}건의 원인 분해 ===`);
console.log(`보통주 코드가 DART에 존재 → 우선주/복수종목으로 설명됨: ${explained}건 (${((explained / missing.length) * 100).toFixed(1)}%)`);
console.log(`설명 안 됨: ${unexplained.length}건 ${unexplained.length ? "→ " + unexplained.join(", ") : ""}`);
console.log(`\n확인 샘플 (실패코드 → 같은 법인의 보통주):`);
for (const e of examples) console.log(`  ${e.code} → ${e.base} ${e.name} (corp_code ${e.corp})`);

// 결정적 검증: 삼성전자 보통주/우선주
console.log(`\n=== 결정적 검증 ===`);
for (const c of ["005930", "005935", "000880", "00088K"]) {
  const r = dart.get(c);
  console.log(`  ${c}: ${r ? `DART 존재 — ${r.name} (corp ${r.corp})` : "DART 없음"}`);
}

// 실제로 공시가 있는지 API로 확인(설명 안 된 건 중 최대 5개)
const KEY = fs.readFileSync(path.join(L.PROJECT, ".env.local"), "utf8").match(/^DART_API_KEY=(.*)$/m)[1].trim();
(async () => {
  const targets = unexplained.slice(0, 5);
  if (targets.length === 0) { console.log(`\n(설명 안 된 코드가 없어 API 개별 조회 생략)`); return; }
  console.log(`\n=== 설명 안 된 코드의 DART 공시 존재 여부(API 직접 조회) ===`);
  for (const code of targets) {
    // corp_code를 모르니 보통주 후보로 조회 시도
    const cand = baseCandidates(code)[0] || code;
    const r = dart.get(cand);
    if (!r) { console.log(`  ${code}: corp_code 미확보 → DART에 해당 법인 없음(최근 상장/비상장 추정)`); continue; }
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${KEY}&corp_code=${r.corp}&bgn_de=20200101&end_de=20251231&pblntf_ty=A&page_count=10`;
    const d = await (await fetch(url)).json();
    console.log(`  ${code} (법인 ${r.name}): status=${d.status} 공시 ${d.total_count ?? 0}건`);
    await new Promise((x) => setTimeout(x, 150));
  }
})();
