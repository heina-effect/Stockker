// 일봉 수집기 — 2020-01-01~ 6년, 종목당 1파일, 체크포인트·진행률·15:30~15:50 가드.
// 사용법: node analysis/collect-candles.cjs [count|all] [seed]
const fs = require("fs");
const path = require("path");
const L = require("./bt-lib.cjs");

L.quietKisDebug();

const MIN_DATE = "20200101";
const UNIVERSE_FILE = path.join(L.CACHE_ROOT, "universe_st.json");

// ── KIS 종목마스터에서 주권(ST) 유니버스 확보 ──
async function ensureUniverse() {
  if (fs.existsSync(UNIVERSE_FILE)) {
    const u = JSON.parse(fs.readFileSync(UNIVERSE_FILE, "utf8"));
    console.log(`[유니버스] 기존 파일 재사용: ${u.length}종목`);
    return u;
  }
  const { execFileSync } = require("child_process");
  const dir = path.join(L.CACHE_ROOT, "universe");
  fs.mkdirSync(dir, { recursive: true });
  for (const m of ["kospi", "kosdaq"]) {
    execFileSync("curl", ["-s", "--max-time", "180", "-o", path.join(dir, `${m}.zip`),
      `https://new.real.download.dws.co.kr/common/master/${m}_code.mst.zip`]);
    execFileSync("unzip", ["-o", "-q", path.join(dir, `${m}.zip`), "-d", dir]);
  }
  // 꼬리 고정폭의 2번째 바이트부터가 증권그룹구분코드(ST=주권). 1번째부터 자르면 전부 빗나간다.
  const parse = (file, tailLen, market) => {
    const lines = fs.readFileSync(path.join(dir, file), "latin1").split("\n").filter((l) => l.trim());
    const out = [];
    for (const line of lines) {
      const code = line.slice(0, 9).trim();
      const group = line.slice(line.length - tailLen).slice(1, 3);
      if (group === "ST" && /^[0-9A-Z]{6}$/.test(code)) out.push({ code, market });
    }
    return out;
  };
  const universe = [...parse("kospi_code.mst", 228, "KOSPI"), ...parse("kosdaq_code.mst", 222, "KOSDAQ")];
  fs.writeFileSync(UNIVERSE_FILE, JSON.stringify(universe));
  console.log(`[유니버스] 신규 생성: 주권 ${universe.length}종목 (KOSPI ${universe.filter((u) => u.market === "KOSPI").length} / KOSDAQ ${universe.filter((u) => u.market === "KOSDAQ").length})`);
  return universe;
}

function seededShuffle(arr, seed) {
  let s = seed;
  const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function main() {
  const countArg = process.argv[2] || "all";
  const universe = await ensureUniverse();
  let targets = universe.map((u) => u.code);
  if (countArg !== "all") targets = seededShuffle(targets, Number(process.argv[3] || 20261026)).slice(0, Number(countArg));

  console.log(`[수집] 대상 ${targets.length}종목 | 시작일 ${MIN_DATE} | 저장 ${L.CANDLE_DIR}`);
  const t0 = Date.now();
  let done = 0, skipped = 0, failed = 0, bars = 0;

  for (let i = 0; i < targets.length; i++) {
    const symbol = targets[i];
    const file = path.join(L.CANDLE_DIR, `${symbol}.json`);
    if (fs.existsSync(file)) {                       // 체크포인트
      const prev = L.loadCandles(symbol);
      if (prev?.candles?.length > 0 && prev.minDate <= MIN_DATE) { skipped++; bars += prev.candles.length; continue; }
    }
    await L.waitIfBlackout();
    try {
      const candles = await L.fetchDailyCandles(symbol, { minDate: MIN_DATE, maxPages: 22 });
      const first = candles.length ? String(candles[0].stck_bsop_date) : null;
      fs.writeFileSync(file, JSON.stringify({ symbol, fetchedAt: new Date().toISOString(), minDate: first, candles }));
      done++; bars += candles.length;
    } catch (e) {
      failed++;
      fs.writeFileSync(path.join(L.CANDLE_DIR, `${symbol}.error.json`), JSON.stringify({ symbol, error: String(e?.message || e) }));
    }
    if ((i + 1) % 25 === 0 || i === targets.length - 1) {
      const el = (Date.now() - t0) / 1000;
      const rate = done + failed > 0 ? el / (done + failed) : 0;
      const left = targets.length - (i + 1);
      console.log(`[진행] ${i + 1}/${targets.length} | 신규 ${done} 스킵 ${skipped} 실패 ${failed} | 누적봉 ${bars.toLocaleString()} | 경과 ${(el / 60).toFixed(1)}분 | 종목당 ${rate.toFixed(2)}s | 잔여 추정 ${((left * rate) / 60).toFixed(0)}분`);
    }
  }
  const el = (Date.now() - t0) / 1000;
  console.log(`[완료] 신규 ${done} / 스킵 ${skipped} / 실패 ${failed} / 총 ${bars.toLocaleString()}봉 / ${(el / 60).toFixed(1)}분`);
}
main().catch((e) => { console.error("FAIL:", e); process.exit(1); });
