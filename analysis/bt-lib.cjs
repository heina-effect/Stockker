// 백테스트 공용 라이브러리.
//
// 설계 원칙 2개:
//  1) 지표는 프로덕션 src/server/screening/indicators.ts 를 그대로 컴파일해 import 한다.
//     재구현하면 프로덕션과 1%라도 달라지는 순간 비교가 무의미해진다(#1에서 61봉 윈도
//     불일치를 실측으로 잡아낸 전례가 있다).
//  2) 원본 데이터(일봉·DART)는 저장소 밖 영속 경로에 둔다. 스크래치패드는 세션 정리로
//     날아간다(실제로 2회 소실).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const PROJECT = "/Users/hyuna/Desktop/heina/stockker";
const CACHE_ROOT = path.join(os.homedir(), "stockker-bt-cache");
const CANDLE_DIR = path.join(CACHE_ROOT, "candles");
const DART_DIR = path.join(CACHE_ROOT, "dart");
const BUILD_DIR = path.join(CACHE_ROOT, "build");

for (const d of [CANDLE_DIR, DART_DIR, BUILD_DIR]) fs.mkdirSync(d, { recursive: true });

// ── .env.local 로드 (프로덕션과 동일한 KIS 자격증명·토큰 캐시 재사용) ──
function loadEnv() {
  const raw = fs.readFileSync(path.join(PROJECT, ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
}
loadEnv();

// ── 프로덕션 모듈 컴파일(없거나 소스가 더 새로우면 재컴파일) ──
function ensureBuild() {
  const out = path.join(BUILD_DIR, "out");
  const indicatorsJs = path.join(out, "server/screening/indicators.js");
  const srcIndicators = path.join(PROJECT, "src/server/screening/indicators.ts");
  const fresh = fs.existsSync(indicatorsJs) &&
    fs.statSync(indicatorsJs).mtimeMs > fs.statSync(srcIndicators).mtimeMs;
  if (fresh) return out;

  const tsconfig = path.join(BUILD_DIR, "tsconfig.build.json");
  fs.writeFileSync(tsconfig, JSON.stringify({
    compilerOptions: {
      target: "ES2022", module: "CommonJS", moduleResolution: "node",
      outDir: out, rootDir: path.join(PROJECT, "src"), baseUrl: PROJECT,
      paths: { "@/*": ["./src/*"] },
      esModuleInterop: true, skipLibCheck: true, strict: false, noEmitOnError: false, resolveJsonModule: true,
    },
    files: [
      path.join(PROJECT, "src/server/screening/indicators.ts"),
      path.join(PROJECT, "src/server/kis/auth.ts"),
      path.join(PROJECT, "src/server/screening/quant-signal.ts"),
    ],
  }, null, 2));

  try {
    execFileSync("npx", ["tsc", "-p", tsconfig], { cwd: PROJECT, stdio: "pipe" });
  } catch {
    // 타입 에러(@types/node 미해결 등)는 무시 — JS 산출물은 정상 생성된다
  }

  // server-only 스텁 + 외부 패키지 심링크 (프로덕션 소스를 건드리지 않고 Node에서 로드하기 위함)
  const nm = path.join(out, "node_modules");
  fs.mkdirSync(path.join(nm, "server-only"), { recursive: true });
  fs.writeFileSync(path.join(nm, "server-only/package.json"), JSON.stringify({ name: "server-only", version: "0.0.0-stub", main: "index.js" }));
  fs.writeFileSync(path.join(nm, "server-only/index.js"), "module.exports = {};");
  for (const p of ["@upstash", "zod", "@supabase"]) {
    const target = path.join(PROJECT, "node_modules", p);
    const link = path.join(nm, p);
    if (fs.existsSync(target) && !fs.existsSync(link)) fs.symlinkSync(target, link);
  }
  if (!fs.existsSync(indicatorsJs)) throw new Error("indicators.js 컴파일 실패 — 수동 확인 필요");
  return out;
}

const OUT = ensureBuild();
const { computeIndicatorSeries } = require(path.join(OUT, "server/screening/indicators.js"));
const { callKisApi } = require(path.join(OUT, "server/kis/auth.js"));

// ── KST 유틸 ──
const KST_OFFSET = 9 * 60 * 60 * 1000;
function formatKSTDate(d) {
  const k = new Date(d.getTime() + KST_OFFSET);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
}
function kstNow() {
  const k = new Date(Date.now() + KST_OFFSET);
  return { day: k.getUTCDay(), min: k.getUTCHours() * 60 + k.getUTCMinutes(), hh: k.getUTCHours(), mm: k.getUTCMinutes() };
}

// 15:30~15:50 KST 가드 — launchd 자동 스크리닝(15:40)과 KIS 호출이 겹치지 않게 대기
const BLACKOUT_START = 15 * 60 + 30, BLACKOUT_END = 15 * 60 + 50;
async function waitIfBlackout(log = console.log) {
  for (;;) {
    const t = kstNow();
    const weekday = t.day >= 1 && t.day <= 5;
    if (!weekday || t.min < BLACKOUT_START || t.min >= BLACKOUT_END) return;
    log(`[일시정지] ${String(t.hh).padStart(2, "0")}:${String(t.mm).padStart(2, "0")} KST — 자동 스크리닝 구간(15:30~15:50) 회피`);
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

/**
 * 일봉 수집. rest-client.ts 의 fetchPaginatedCandles 는 모듈 private 이라 import 할 수 없어
 * 동일한 페이지네이션 규칙(창 150일, 날짜 중복 제거, 가장 오래된 일자 직전으로 이동,
 * EGW00201 백오프 1회 재시도)을 따르고 KIS 호출만 프로덕션 callKisApi(350ms 큐·토큰 캐시
 * 공유)로 수행한다. 파라미터는 getDomesticStockDaily 와 동일(수정주가 "0", 시장 "J").
 */
async function fetchDailyCandles(symbol, { minDate = "20200101", maxPages = 22, windowDays = 150 } = {}) {
  const merged = [];
  const seen = new Set();
  let endDate = new Date();

  for (let page = 0; page < maxPages; page++) {
    const startDate = new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const qs = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
      FID_INPUT_DATE_1: formatKSTDate(startDate),
      FID_INPUT_DATE_2: formatKSTDate(endDate),
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0", // 0: 수정주가
    }).toString();
    const call = () => callKisApi(`/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`,
      { method: "GET", trId: "FHKST03010100", useQuoteCreds: true });

    let data;
    try {
      data = await call();
    } catch (e) {
      const msg = String(e?.message || e);
      if (/EGW00201|초당 거래건수/.test(msg)) {
        await new Promise((r) => setTimeout(r, 1200));
        try { data = await call(); } catch (e2) { if (page === 0) throw e2; break; }
      } else if (page === 0) throw e;
      else break;
    }
    if (data.rt_cd !== "0") { if (page === 0) throw new Error(`KIS: ${data.msg1}`); break; }

    const rows = data.output2 || data.output || [];
    if (rows.length === 0) break;
    let oldest = null, added = 0;
    for (const r of rows) {
      const dt = String(r.stck_bsop_date || "");
      if (!dt) continue;
      if (!oldest || dt < oldest) oldest = dt;
      if (!seen.has(dt)) { seen.add(dt); merged.push(r); added++; }
    }
    if (added === 0 || !oldest) break;
    if (oldest <= minDate) break; // 목표 시작일 도달 → 더 과거는 받지 않는다
    const od = new Date(Date.UTC(+oldest.slice(0, 4), +oldest.slice(4, 6) - 1, +oldest.slice(6, 8)));
    endDate = new Date(od.getTime() - 24 * 60 * 60 * 1000);
  }
  merged.sort((a, b) => String(a.stck_bsop_date).localeCompare(String(b.stck_bsop_date))); // 오름차순
  return merged;
}

// 프로덕션(overnight/route.ts 559~567행)과 동일한 매핑으로 지표 시계열 산출
function indicatorsFor(candlesAsc) {
  return computeIndicatorSeries(candlesAsc.map((c) => ({
    tradeDate: c.stck_bsop_date || "",
    close: Number(c.stck_clpr || 0),
    volume: Number(c.acml_vol || 0),
  })));
}

function loadCandles(symbol) {
  const f = path.join(CANDLE_DIR, `${symbol}.json`);
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; }
}
function listCachedSymbols() {
  return fs.readdirSync(CANDLE_DIR)
    .filter((f) => f.endsWith(".json") && !f.includes("error"))
    .map((f) => f.replace(".json", ""));
}
const quietKisDebug = () => {
  const orig = console.log;
  console.log = (...a) => { if (!String(a[0] ?? "").startsWith("[KIS API debug]")) orig(...a); };
};

module.exports = {
  PROJECT, CACHE_ROOT, CANDLE_DIR, DART_DIR, BUILD_DIR,
  fetchDailyCandles, indicatorsFor, computeIndicatorSeries, callKisApi,
  formatKSTDate, kstNow, waitIfBlackout, loadCandles, listCachedSymbols, quietKisDebug,
};
