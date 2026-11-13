import { NextResponse } from "next/server";
import { 
  getDomesticIndexDaily, 
  getDomesticVolumeRank, 
  getDomesticStockDaily, 
  getDomesticStockWeekly,
  getDomesticStockDetail,
  getKSTPersistWindow,
  kstAfterHoursPriceWarning
} from "@/server/kis/rest-client";
import { cacheScopeDataSource, createCacheScope, runInCacheScope, type CacheScope } from "@/server/kis/cache";
import { kisConfig } from "@/server/kis/config";
import { getSearchMaster } from "@/lib/stocks/search-master";
import {
  saveScreeningResult,
  getScreeningSavedInfo,
  logForceOverwrite,
  formatKSTDateCompact,
  type ScreeningResultItem,
  type ScreeningSavedInfo,
} from "@/server/screening/storage";
import { runDailyTrajectoryUpdate } from "@/server/screening/trajectory-update";
import { buildQuantJudgmentRows, recordQuantJudgments } from "@/server/screening/quant-judgment";
import { warnEntryDay0Mismatches } from "@/server/screening/entry-invariant";
import { computeIndicatorSeries } from "@/server/screening/indicators";
import { QUANT_SIGNAL_CRITERIA } from "@/server/screening/quant-signal";
import { getSupabaseAdmin } from "@/lib/supabase/client";
import { isRateLimitError, withRateLimitRetry } from "@/server/screening/rate-limit-retry";
import { OVERNIGHT_CRITERIA as C } from "@/lib/screening/overnight-criteria";
import { OVERNIGHT_DISCLAIMER } from "@/lib/screening/saved-result";

// 헬퍼: 이동평균선(MA) 계산 (최신 데이터가 0번 인덱스임)
function calculateMA(candles: any[], period: number, key: string = "stck_clpr"): number {
  if (!candles || candles.length < period) return 0;
  const slice = candles.slice(0, period);
  const sum = slice.reduce((acc, c) => acc + Number(c[key] || 0), 0);
  return sum / period;
}

// 헬퍼: 20일 평균 거래량 계산
function calculateAvgVolume(candles: any[], period: number = 20): number {
  if (!candles || candles.length < period) return 0;
  const slice = candles.slice(0, period);
  const sum = slice.reduce((acc, c) => acc + Number(c.acml_vol || 0), 0);
  return sum / period;
}

// 헬퍼: 디버그 응답에 들어가는 에러 문자열에서 자격증명류 토큰을 마스킹한다.
// 응답 본문에는 stack을 절대 넣지 않으며, message류만 정제해 노출한다.
function sanitizeError(msg: string | undefined | null): string {
  if (!msg) return "";
  let out = String(msg);
  const patterns: RegExp[] = [
    /(appkey["':=\s]+)[^\s"',}]+/gi,
    /(appsecret["':=\s]+)[^\s"',}]+/gi,
    /(secret["':=\s]+)[^\s"',}]+/gi,
    /(authorization["':=\s]+)[^\s"',}]+/gi,
    /(bearer\s+)[^\s"',}]+/gi,
  ];
  for (const re of patterns) {
    out = out.replace(re, "$1***");
  }
  return out;
}

// 스크리닝 실패 응답 — 가짜 결과로 대신 채우지 않는다(2026-10-30). 종목·지수값 없이 사유만 돌려주고
// DB 에 저장하지 않는다. launchd 가 응답 본문을 screening.log 에 그대로 남기므로 이 본문만 봐도
// 그날 실패했는지와 사유를 알 수 있다.
function screeningFailed(reason: string, detail?: string) {
  const failedAt = new Date().toISOString();
  console.error(`[Overnight API] SCREENING FAILED reason=${reason}${detail ? ` detail=${detail}` : ""} at=${failedAt}`);
  return NextResponse.json(
    { ok: false, error: "screening_failed", reason, ...(detail ? { detail } : {}), failedAt },
    { status: 503 }
  );
}

// ?fresh=1 (2026-11-05) — 캐시를 읽지도 쓰지도 않고 KIS 에서 새로 받는다. 값 1 만 인정한다.
// ?save=1 과 함께 오면 저장 시점 값의 출처가 불분명해지므로 KIS 를 부르기 전에 거부한다.
// 정기 실행(?save=1)은 기존 캐시 경로 그대로다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const fresh = searchParams.get("fresh") === "1";
  if (fresh && searchParams.get("save") === "1") {
    return NextResponse.json(
      { ok: false, error: "fresh_with_save", persisted: false, persistSkippedReason: "fresh_with_save" },
      { status: 400 }
    );
  }
  const scope = createCacheScope(fresh);
  return runInCacheScope(scope, () => runScreening(req, scope));
}

async function runScreening(req: Request, scope: CacheScope) {
  const { searchParams } = new URL(req.url);
  const isDebug = searchParams.get("debug") === "true";
  // 저장은 ?save=1 이 있을 때만 시도한다. 파라미터 없는 호출은 조회 전용이다(아래 저장 판정 참고)
  const saveRequested = searchParams.get("save") === "1";
  const force = searchParams.get("force") === "true";
  const timestamp = new Date().toISOString();

  // Vercel Cron은 CRON_SECRET이 설정되어 있으면 Authorization: Bearer <CRON_SECRET>
  // 헤더를 자동으로 붙여 호출한다. 이 헤더가 "있는데" 값이 틀리면 스푸핑으로 간주해 거부하고,
  // 헤더 자체가 없으면(기존 수동 실행 버튼 등) 기존 동작을 그대로 유지한다.
  const authHeader = req.headers.get("authorization");
  if (kisConfig.cronSecret && authHeader && authHeader !== `Bearer ${kisConfig.cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let volumeRank: any[] = [];
  let firstStockErrorMsg = "";
  // 분석 결과 버킷 — try 블록 전체에서 공유한다
  let normalBucket: any[] = [];
  let aggressiveBucket: any[] = [];
  let excludeBucket: any[] = [];
  let excludedNotice: { symbol: string; name: string; reason: string; entryClose: number }[] = [];
  let analyzedSymbols = new Set<string>();
  let reduceWeight = false;
  let kosdaqClose = 0;
  let latestTradingDate = "";
  // 조회 시작 시각의 저장 창. 저장 판정은 이것과 저장 직전 시각 둘 다 본다(아래 저장 시간대 제한 참고)
  const fetchStartWindow = getKSTPersistWindow();

  try {
    // [0단계] 거시 필터 - 코스닥(1001) + 코스피(0001) 정배열/역배열 판정 (병렬 조회)
    let kosdaqMAState = { ma5: 0, ma20: 0, ma60: 0, ma120: 0 };
    let kospiClose = 0;
    let kospiMAState: { ma5: number; ma20: number; ma60: number; ma120: number } | null = null;
    let kospiReduceWeight = false;

    try {
      const [kosdaqIndexDaily, kospiIndexDaily] = await Promise.all([
        withRateLimitRetry(() => getDomesticIndexDaily("1001")),
        withRateLimitRetry(() => getDomesticIndexDaily("0001")).catch((e: any) => {
          // 코스피 실패는 코스닥 판정을 막지 않는다
          console.warn("[Overnight API] KOSPI index fetch failed:", e?.message || e);
          return [] as any[];
        }),
      ]);

      if (kosdaqIndexDaily && kosdaqIndexDaily.length > 0) {
        latestTradingDate = kosdaqIndexDaily[0].stck_bsop_date || "";
      }

      if (kosdaqIndexDaily && kosdaqIndexDaily.length >= 120) {
        kosdaqClose = Number(kosdaqIndexDaily[0].bstp_nmix_prpr || 0);
        kosdaqMAState = {
          ma5: calculateMA(kosdaqIndexDaily, 5, "bstp_nmix_prpr"),
          ma20: calculateMA(kosdaqIndexDaily, 20, "bstp_nmix_prpr"),
          ma60: calculateMA(kosdaqIndexDaily, 60, "bstp_nmix_prpr"),
          ma120: calculateMA(kosdaqIndexDaily, 120, "bstp_nmix_prpr"),
        };
        const isAligned =
          kosdaqMAState.ma5 > kosdaqMAState.ma20 &&
          kosdaqMAState.ma20 > kosdaqMAState.ma60 &&
          kosdaqMAState.ma60 > kosdaqMAState.ma120;
        reduceWeight = !isAligned;
      }

      if (kospiIndexDaily && kospiIndexDaily.length >= 120) {
        kospiClose = Number(kospiIndexDaily[0].bstp_nmix_prpr || 0);
        const kospiMA5 = calculateMA(kospiIndexDaily, 5, "bstp_nmix_prpr");
        const kospiMA20 = calculateMA(kospiIndexDaily, 20, "bstp_nmix_prpr");
        const kospiMA60 = calculateMA(kospiIndexDaily, 60, "bstp_nmix_prpr");
        const kospiMA120 = calculateMA(kospiIndexDaily, 120, "bstp_nmix_prpr");
        kospiMAState = { ma5: kospiMA5, ma20: kospiMA20, ma60: kospiMA60, ma120: kospiMA120 };
        const kospiAligned = kospiMA5 > kospiMA20 && kospiMA20 > kospiMA60 && kospiMA60 > kospiMA120;
        kospiReduceWeight = !kospiAligned;
      }
    } catch (err: any) {
      console.error("[Overnight API] Index fetch failed:", err?.stack || err);
      if (isDebug) {
        return NextResponse.json({
          ok: false,
          error: "Index fetch failed",
          diagnostics: { message: sanitizeError(err?.message || String(err)) },
        }, { status: 500 });
      }
    }

    // 거래일 가드: 코스닥 지수 일봉의 최신 영업일(stck_bsop_date)이 오늘(KST)과 다르면
    // 주말/공휴일로 휴장인 날이다. 매년 바뀌는 공휴일 달력을 별도로 관리하는 대신,
    // 실제 시장이 오늘 거래됐는지를 지수 데이터로 직접 확인해 스킵한다.
    // (Vercel Cron은 평일에만 호출하도록 설정하지만, 그래도 공휴일은 걸러야 함)
    const todayKST = formatKSTDateCompact(new Date());
    if (!isDebug && latestTradingDate && latestTradingDate !== todayKST) {
      console.log(
        `[Overnight API] Not a trading day (latest index trade date: ${latestTradingDate}, today: ${todayKST}). Skipping scan.`
      );
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "not_a_trading_day",
        latestTradingDate,
        today: todayKST,
      });
    }

    // 실전 시세 자격증명(KIS_APP_KEY_PROD)이 없으면 실패로 끝낸다.
    // KIS_MODE=mock이더라도 quote 키가 구성되어 있으면 실데이터 스크리닝 수행
    // (KIS_MODE는 주문 모드를 제어할 뿐, 시세 스크리닝과 무관)
    const hasQuoteCreds = kisConfig.quote.configured;
    if (!hasQuoteCreds && !isDebug) {
      return screeningFailed("no_quote_credentials");
    }

    // [실제 KIS API 연동 분석 수행] 거래량순 조회로 후보군 풀 확보 (순차 호출로 큐 동시 점유 방지)
    volumeRank = [];
    try {
      // 평균거래량 순위 우선 조회 (cold-start rate limit 시 1회 자동 재시도)
      const volRank = await withRateLimitRetry(() => getDomesticVolumeRank("0"));
      // 거래대금 순위 추가 조회 (큐가 직렬화하므로 순차로 rate limit 안전)
      const amtRank = await withRateLimitRetry(() => getDomesticVolumeRank("3"));

      // 병합 및 중복 제거
      const combined = [...volRank];
      for (const stock of amtRank) {
        const symbol = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
        if (!combined.some(s => (s.mksc_shrn_iscd || s.stck_shrn_iscd) === symbol)) {
          combined.push(stock);
        }
      }
      volumeRank = combined;
    } catch (err: any) {
      console.warn("[Overnight API] Failed to fetch volume rank from KIS:", err.message || err);
      if (isDebug) {
        throw err;
      }
    }

    if (volumeRank && volumeRank.length > 0 && typeof window === "undefined" && process.env.NODE_ENV === "development") {
      const first = volumeRank[0];
      console.log(`[Overnight API debug] Volume rank first stock fields: name=${first.hts_kor_isnm}, vol_tnrt=${first.vol_tnrt}, lstn_stcn=${first.lstn_stcn}`);
    }

    if (!volumeRank || volumeRank.length === 0) {
      if (isDebug) {
        return NextResponse.json({
          ok: false,
          diagnostics: {
            volumeRankLength: 0,
            pureStocksLength: 0,
            primaryCandidatesLength: 0,
            error: "Volume rank API returned empty list"
          }
        });
      }
      return screeningFailed("volume_rank_empty");
    }

    const master = getSearchMaster();
    // ETF/ETN 접두어 필터 (영문/한글 자산 운용사 브랜드 오탐 방지) 및 파생 상품 필터
    const etfPrefixRegex = /^(KODEX|TIGER|KBSTAR|ACE|SOL|HANARO|KOSEF|ARIRANG|KINDEX|KOEX|ETN|RISE|TIME|코덱스|타이거|라이즈)/i;
    const derivativeRegex = /레버리지|인버스|선물|액티브/i;

    // 1. 분석 전 "그냥 폐기" 필터 — 후보/결과/안내 어디에도 넣지 않고 조용히 제외한다.
    //    (분석 슬롯도 차지하지 않음). 다음을 원천 배제:
    //    - ETF / ETN / 지수 추종 / 스팩 (기존 로직)
    //    - 가격제한폭 초과 등락률(±30% 초과): 감자/병합/거래재개 등 비정상 이벤트
    //    - 동전주: 현재가 1,000원 미만 (가격 누락=0 포함)
    //    ※ 거래정지/정리매매는 volume-rank 단계에서 신뢰성 있게 판별 불가하므로
    //      기존대로 2차 현재가 상세(temp_stop_yn/sltr_yn)에서 배제한다.
    const pureStocks = volumeRank.filter(stock => {
      const symbol = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
      const name = stock.hts_kor_isnm;
      const changeRate = Number(stock.prdy_ctrt || 0);
      const price = Number(stock.stck_prpr || 0);

      const masterItem = master.find(s => s.symbol === symbol);
      const isETF = masterItem?.type === "etf" || masterItem?.market === "ETF" || masterItem?.market === "ETN";
      const hasEtfKeyword = etfPrefixRegex.test(name) || derivativeRegex.test(name);
      const isSpac = name.includes("스팩") || /spac/i.test(name);
      const isAbnormalMove = changeRate < -C.prefilter.abnormalMovePct || changeRate > C.prefilter.abnormalMovePct;
      const isPennyStock = price < C.prefilter.minPrice;

      return !(isETF || hasEtfKeyword || isSpac || isAbnormalMove || isPennyStock);
    });

    // 2. 1차 후보: 등락률 +3% 이상 + 최소 거래대금 10억(유동성 안전장치).
    //    정렬은 거래대금순이 아니라 회전율(vol_tnrt) 높은 순으로 한다.
    //    거래대금순은 대형주(삼성전자/SK하이닉스 등)가 후보를 독점하는데, 대형주는
    //    회전율 5%를 구조적으로 못 넘겨 정석/공격형이 거의 안 나온다. 회전율 우선
    //    정렬로 중소형 테마주를 분석 대상에 우선 편입한다.
    //    (volume-rank의 vol_tnrt는 정렬 우선순위로만 사용. 최종 5% 회전율 PASS/FAIL은
    //     기존대로 2차 현재가 상세의 detail.vol_tnrt로 판정한다.)
    const volTnrtOf = (s: any) => Number(s.vol_tnrt || 0);
    const primaryCandidates = pureStocks
      .filter(stock => {
        const changeRate = Number(stock.prdy_ctrt || 0);
        const trPbmn = Number(stock.acml_tr_pbmn || 0);
        return changeRate >= C.primary.minChangeRate && trPbmn >= C.primary.minTradingValue;
      })
      .sort((a, b) => volTnrtOf(b) - volTnrtOf(a));

    // 3. 분석 대상을 MAX_TARGET_STOCKS개로 제한한다.
    //    Phase 38에서 일봉/주봉도 페이지네이션(종목당 일봉 2 + 주봉 2 + 상세 1 = 최대 5호출)
    //    되면서 호출량이 늘었으므로, cold-start(캐시 미스) 타임아웃/Rate Limit 방지를 위해
    //    12 → 8로 축소. 캐시가 채워지면 당일 재호출은 거의 발생하지 않는다.
    const MAX_TARGET_STOCKS = C.primary.maxTargets;
    const targetStocks: any[] = primaryCandidates.slice(0, MAX_TARGET_STOCKS);
    // 후보가 8개 미만이면 나머지도 회전율 높은 순으로 채운다. 단 하락종목 가드 적용
    // (등락률 음수 제외). 폐기 조건(±30%/동전주/ETF 등)은 pureStocks에서 이미 걸러짐.
    const fillPool = pureStocks
      .filter(stock => {
        const sym = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
        const already = targetStocks.some(ts => (ts.mksc_shrn_iscd || ts.stck_shrn_iscd) === sym);
        const changeRate = Number(stock.prdy_ctrt || 0);
        return !already && changeRate >= 0;
      })
      .sort((a, b) => volTnrtOf(b) - volTnrtOf(a));
    for (const stock of fillPool) {
      if (targetStocks.length >= MAX_TARGET_STOCKS) break;
      targetStocks.push(stock);
    }

    if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
      console.log(`[Overnight API debug] Volume rank total: ${volumeRank.length} | Pure stocks: ${pureStocks.length} | Target stocks (max ${MAX_TARGET_STOCKS}): ${targetStocks.length}`);
    }

    normalBucket = [];
    aggressiveBucket = [];
    excludeBucket = [];
    excludedNotice = [];
    analyzedSymbols = new Set<string>();
    firstStockErrorMsg = "";

    // targetStocks (최대 MAX_TARGET_STOCKS종목) 분석 진행
    for (const stock of targetStocks) {
      const symbol = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
      const name = stock.hts_kor_isnm;
      const price = Number(stock.stck_prpr || 0);
      const changeRate = Number(stock.prdy_ctrt || 0);
      
      const reasons: string[] = [];
      let isExcluded = false;

      // 1-2. 등락률 제한 (조기 마킹)
      if (changeRate >= C.main.excludeChangeRate && changeRate < C.main.limitUpChangeRate) {
        reasons.push(`당일 등락률 +${C.main.excludeChangeRate}% 이상 제외`);
        isExcluded = true;
      }
      if (changeRate >= C.main.limitUpChangeRate) {
        reasons.push(`상한가 근접(+${C.main.limitUpChangeRate}% 이상) 제외`);
        isExcluded = true;
      }

      let detail: any = null;
      let dailyCandles: any[] = [];
      let weeklyCandles: any[] = [];

      try {
        // withRateLimitRetry로 EGW00201 시 1.5s 백오프 후 1회 자동 재시도 (전역 큐 + 재시도 이중 방어)
        detail = await withRateLimitRetry(() => getDomesticStockDetail(symbol));
        dailyCandles = await withRateLimitRetry(() => getDomesticStockDaily(symbol));
        weeklyCandles = await withRateLimitRetry(() => getDomesticStockWeekly(symbol));
        analyzedSymbols.add(symbol); // 성공적 분석 완료 기록
      } catch (e: any) {
        const errMsg = String(e?.message || e);
        if (!firstStockErrorMsg) firstStockErrorMsg = errMsg;

        if (isRateLimitError(errMsg)) {
          // 재시도까지 소진한 rate limit → 이후 종목도 막힐 가능성이 크므로 루프 종료(부분 결과 보존)
          console.warn(`[Overnight API] Rate limit persists at ${name} (${symbol}) after retry. Stopping loop.`);
          break;
        }

        console.warn(`[Overnight API] Failed to fetch data for ${name} (${symbol}):`, errMsg);
        if (isDebug) throw e; // 일반적인 치명적 에러는 디버그 모드에서 전파
        excludeBucket.push({
          symbol,
          name,
          price,
          changeRate,
          classification: "exclude",
          entryClose: price,
          reasons: ["KIS API 시세 데이터 조회 지연 또는 실패"],
        });
        continue;
      }

      // 백테스트 entryClose = 스크리닝 당일 종가(일봉[0].stck_clpr). 일봉이 비면 현재가로 대체.
      const entryClose = dailyCandles.length > 0 ? Number(dailyCandles[0].stck_clpr || price) : price;

      let detailVolTnrt = 0;

      // 1-1. 위험종목 필터 기준 확정 및 2차 회전율 판정
      if (detail) {
        detailVolTnrt = Number(detail.vol_tnrt || 0);
        if (detailVolTnrt < C.main.minTurnoverRate) {
          reasons.push(`회전율 기준 미달 (${detailVolTnrt.toFixed(2)}%, 기준 ${C.main.minTurnoverRate.toFixed(1)}% 이상)`);
          isExcluded = true;
        }

        // mrkt_warn_cls_code: "00"없음 / "01"투자주의 / "02"투자경고 / "03"투자위험
        const mrktWarn = String(detail.mrkt_warn_cls_code || "00");
        if (mrktWarn !== "00") {
          const warnLabel = mrktWarn === "01" ? "투자주의" : mrktWarn === "02" ? "투자경고" : "투자위험";
          reasons.push(`${warnLabel} 종목 제외`);
          isExcluded = true;
        }

        // invt_caful_yn === "Y" -> 투자유의, 제외
        if (detail.invt_caful_yn === "Y") {
          reasons.push("투자유의 종목 제외");
          isExcluded = true;
        }

        // temp_stop_yn === "Y" -> 거래정지, 제외
        if (detail.temp_stop_yn === "Y") {
          reasons.push("거래정지 종목 제외");
          isExcluded = true;
        }

        // sltr_yn === "Y" -> 정리매매, 제외
        if (detail.sltr_yn === "Y") {
          reasons.push("정리매매 종목 제외");
          isExcluded = true;
        }

        // short_over_yn === "Y" -> 단기과열, 제외 (공격형에서도 강등)
        if (detail.short_over_yn === "Y") {
          reasons.push("단기과열 종목 제외 (공격형 이하 강등)");
          isExcluded = true;
        }
      } else {
        reasons.push("현재가 상세 데이터 없음 (회전율 및 위험 필터 검사 불가)");
        isExcluded = true;
      }

      // 이력 부족(120봉 미만)인데 위험/기준 문제는 없는 "정상이나 분석 불가"
      // 종목은 results.exclude가 아니라 excludedNotice로 분리한다.
      const dailyInsufficient = dailyCandles.length < C.main.minHistoryBars;
      const weeklyInsufficient = weeklyCandles.length < C.main.minHistoryBars;
      const insufficientData = dailyInsufficient || weeklyInsufficient;
      if (insufficientData && !isExcluded) {
        let reason: string;
        if (dailyInsufficient) {
          // 일봉도 부족 = 신규상장 수준
          reason = `일봉 데이터 부족 (상장 이력 짧음) — ${dailyCandles.length}봉 확보 / ${C.main.minHistoryBars}봉 필요`;
        } else {
          // 일봉은 충분하지만 주봉 부족 = 상장 ~2.5년 미만
          reason = `주봉 데이터 부족 — 상장 후 약 2.5년 미만 (${weeklyCandles.length}봉 확보 / ${C.main.minHistoryBars}봉 필요, 주봉 정배열 판정 불가)`;
        }
        excludedNotice.push({ symbol, name, entryClose, reason });
        continue;
      }
      if (insufficientData) {
        // 이미 위험/기준 문제가 있는 종목은 그대로 제외 버킷으로 (부가 사유만 기록)
        const lackDesc = dailyInsufficient
          ? `일봉 ${dailyCandles.length}봉 확보 / ${C.main.minHistoryBars}봉 필요`
          : `주봉 ${weeklyCandles.length}봉 확보 / ${C.main.minHistoryBars}봉 필요`;
        reasons.push(`이평선 계산 데이터 부족 (${lackDesc})`);
        isExcluded = true;
      }

      // 이평선 계산
      const dailyMA5 = calculateMA(dailyCandles, 5);
      const dailyMA20 = calculateMA(dailyCandles, 20);
      const dailyMA60 = calculateMA(dailyCandles, 60);
      const dailyMA120 = calculateMA(dailyCandles, 120);

      const weeklyMA5 = calculateMA(weeklyCandles, 5);
      const weeklyMA20 = calculateMA(weeklyCandles, 20);
      const weeklyMA60 = calculateMA(weeklyCandles, 60);
      const weeklyMA120 = calculateMA(weeklyCandles, 120);

      const isDailyAligned = dailyMA5 > dailyMA20 && dailyMA20 > dailyMA60 && dailyMA60 > dailyMA120;
      const isWeeklyAligned = weeklyMA5 > weeklyMA20 && weeklyMA20 > weeklyMA60 && weeklyMA60 > weeklyMA120;

      // 1-3. 주봉 + 일봉 정배열 검사
      if (!isDailyAligned || !isWeeklyAligned) {
        reasons.push(`정배열 미달 (일봉 정배열: ${isDailyAligned ? "OK" : "NO"}, 주봉 정배열: ${isWeeklyAligned ? "OK" : "NO"})`);
      }

      // 1-4. 거래량 20일 평균 200% 이상 여부 (오늘 제외한 20일 평균 계산)
      const currentVolume = dailyCandles.length > 0 ? Number(dailyCandles[0].acml_vol || 0) : 0;
      const avgVolume20 = calculateAvgVolume(dailyCandles.slice(1, 21), 20);
      const volumeRatio = avgVolume20 > 0 ? (currentVolume / avgVolume20) * 100 : 0;
      const isVolumeSpike = volumeRatio >= C.main.minVolumeRatio;
      
      if (!isVolumeSpike) {
        reasons.push(`거래량 비율 미달 (20일 평균 대비 ${volumeRatio.toFixed(1)}%, 기준 ${C.main.minVolumeRatio}% 이상)`);
      }

      // 1-5. 윗꼬리 비율: (당일 고가 - 당일 종가) / 당일 고가
      //   2026-11-13 부터 진입 게이트가 아니다 — 운영 기록 4구간 측정에서 예측력이 없었다
      //   (docs/release/known-issues.md "윗꼬리(tail_ratio)는 결과를 예측하지 못한다"). 계산·metrics·DB 저장은
      //   그대로 둔다. normal 버킷이 쌓이면 그 안에서 다시 재야 하기 때문이다.
      //   ※ volume-rank API(stock)는 고가(stck_hgpr)를 반환하지 않으므로 당일 확정
      //     일봉(dailyCandles[0]) 기준으로 계산한다. 분자/분모 모두 일봉으로 통일하며
      //     실시간 현재가(price)는 tailRatio 계산에 사용하지 않는다.
      const dailyHigh = Number(dailyCandles?.[0]?.stck_hgpr || 0);
      const dailyClose = Number(dailyCandles?.[0]?.stck_clpr || price);
      const tailDataMissing = dailyHigh <= 0;
      const tailRatio = tailDataMissing ? 0 : ((dailyHigh - dailyClose) / dailyHigh) * 100;
      // 고가 누락은 데이터 결손이라 사유에 남긴다(진입을 막지는 않는다). 결손 행의 tailRatio 0 은 "진짜 0%"가 아니다.
      if (tailDataMissing) {
        console.warn(`[Overnight API] Tail data missing for ${name} (${symbol}) — dailyCandles[0].stck_hgpr 누락, tailRatio 계산 불가`);
        reasons.push("윗꼬리 계산 불가 (당일 일봉 고가 데이터 부족)");
      }

      // 2단계: 테마 신선도 검사 (4개 중 3개 이상)
      let freshnessCount = 0;
      const freshnessDetails: string[] = [];

      // 2-1. 대량거래 동반 +10%↑ 장대양봉 발생 후 5일 이내인지 여부
      let bigCandleIndex = -1;
      for (let i = 0; i < Math.min(C.freshness.bigCandleWithinDays, dailyCandles.length); i++) {
        const c = dailyCandles[i];
        const cOpen = Number(c.stck_oprc || 0);
        const cClose = Number(c.stck_clpr || 0);
        const cVolume = Number(c.acml_vol || 0);
        const cChange = cOpen > 0 ? ((cClose - cOpen) / cOpen) * 100 : 0;
        
        // 이전 20일 거래량 평균 구하기 (i번째 봉 시점)
        const subDaily = dailyCandles.slice(i + 1);
        const cAvgVol = calculateAvgVolume(subDaily, 20);
        
        if (cChange >= C.freshness.bigCandlePct && cVolume >= cAvgVol * C.freshness.bigCandleVolumeMultiple) {
          bigCandleIndex = i;
          break;
        }
      }

      const hasBigCandleWithin5Days = bigCandleIndex !== -1;
      if (hasBigCandleWithin5Days) {
        freshnessCount++;
        freshnessDetails.push(`${C.freshness.bigCandleWithinDays}일 이내 장대양봉 발생`);
      }

      // 2-2. 현재가 >= 장대양봉 몸통 중간값
      let isAboveHalfBody = false;
      if (hasBigCandleWithin5Days) {
        const bigCandle = dailyCandles[bigCandleIndex];
        const bOpen = Number(bigCandle.stck_oprc || 0);
        const bClose = Number(bigCandle.stck_clpr || 0);
        const halfBodyPrice = (bOpen + bClose) / 2;
        isAboveHalfBody = price >= halfBodyPrice;
        if (isAboveHalfBody) {
          freshnessCount++;
          freshnessDetails.push("장대양봉 중간값 지지");
        }
      }

      // 2-3 & 2-4. 조정기 거래량 수축 및 변동성 수렴 여부 판정
      let isVolumeContracted: boolean | null = null;
      let isVolatilityContracted: boolean | null = null;

      if (hasBigCandleWithin5Days) {
        const bigCandle = dailyCandles[bigCandleIndex];
        const bigVolume = Number(bigCandle.acml_vol || 0);
        const bigHigh = Number(bigCandle.stck_hgpr || 0);
        const bigLow = Number(bigCandle.stck_lwpr || 0);
        const bigRange = bigHigh - bigLow;

        // 조정 구간: 장대양봉 발생일 다음 거래일(인덱스 bigCandleIndex - 1)부터 오늘 직전 영업일(인덱스 1)까지
        const adjustmentRange = dailyCandles.slice(1, bigCandleIndex);

        if (adjustmentRange.length === 0) {
          // 장대양봉이 어제 발생하여 조정 기간이 존재하지 않는 경우 판정보류(null) 처리
          isVolumeContracted = null;
          isVolatilityContracted = null;
        } else {
          // 2-3. 조정구간 평균 거래량 <= 장대양봉 거래량의 50%
          const avgVolumeAdj = adjustmentRange.reduce((acc, c) => acc + Number(c.acml_vol || 0), 0) / adjustmentRange.length;
          isVolumeContracted = avgVolumeAdj <= bigVolume * C.freshness.contractionRatio;
          if (isVolumeContracted) {
            freshnessCount++;
            freshnessDetails.push(`조정기 거래량 ${C.freshness.contractionRatio * 100}% 이하 감소`);
          }

          // 2-4. 조정구간 평균 일중 변동폭 <= 장대양봉 변동폭의 50%
          const avgRangeAdj = adjustmentRange.reduce((acc, c) => {
            const h = Number(c.stck_hgpr || 0);
            const l = Number(c.stck_lwpr || 0);
            return acc + (h - l);
          }, 0) / adjustmentRange.length;
          isVolatilityContracted = avgRangeAdj <= bigRange * C.freshness.contractionRatio;
          if (isVolatilityContracted) {
            freshnessCount++;
            freshnessDetails.push("변동성 수렴 완료");
          }
        }
      }

      // 외국인 순매수 여력 자동화 판정
      let foreignBuyLimit = false;
      if (detail) {
        const frgnNtbyQty = Number(detail.frgn_ntby_qty || 0);
        const lstnStcn = Number(detail.lstn_stcn || 1);
        const acmlVol = Number(detail.acml_vol || 1);
        
        // 외국인 순매수량이 상장주식수의 0.5% 이상이거나 당일 거래량의 15% 이상일 때
        const isFrgnHeavyBuy = frgnNtbyQty > 0 && (frgnNtbyQty >= lstnStcn * 0.005 || frgnNtbyQty >= acmlVol * 0.15);
        if (isFrgnHeavyBuy) {
          foreignBuyLimit = true;
        }
      }

      // ── 퀀트 진입 조건 (RSI 50~60 + 거래량 200~400%) ──
      // 진입 조건 근거는 비공개 문서 참조. 현행 조건은 quant-signal.ts
      let rsi14: number | null = null;
      let quantSignal = false;
      let latestIndicator: any = null;
      if (dailyCandles.length >= 15) {
        // computeIndicatorSeries는 오름차순(과거→현재) 기준이므로 뒤집어서 전달
        const ascending = [...dailyCandles].reverse();
        const series = computeIndicatorSeries(
          ascending.map((c) => ({
            tradeDate: c.stck_bsop_date || "",
            close: Number(c.stck_clpr || 0),
            volume: Number(c.acml_vol || 0),
          }))
        );
        // 시계열 마지막 = 최신(포착일) RSI
        latestIndicator = series[series.length - 1];
        rsi14 = latestIndicator?.rsi14 ?? null;
      }
      
      const day0Open = dailyCandles.length > 0 ? Number(dailyCandles[0].stck_oprc || 0) : 0;
      const day0High = dailyCandles.length > 0 ? Number(dailyCandles[0].stck_hgpr || 0) : 0;
      const day0Low = dailyCandles.length > 0 ? Number(dailyCandles[0].stck_lwpr || 0) : 0;
      if (rsi14 !== null) {
        const volRatio20 = latestIndicator?.volRatio20 ?? null;
        quantSignal =
          volRatio20 !== null &&
          rsi14 >= QUANT_SIGNAL_CRITERIA.rsiMin &&
          rsi14 <= QUANT_SIGNAL_CRITERIA.rsiMax &&
          volRatio20 >= QUANT_SIGNAL_CRITERIA.volumeRatioMin &&
          volRatio20 <= QUANT_SIGNAL_CRITERIA.volumeRatioMax;
      }

      // 3버킷 분류 판단
      const is1stStagePass = isDailyAligned && isWeeklyAligned && isVolumeSpike && !isExcluded;
      const isFreshnessPass = freshnessCount >= C.freshness.minPass;
      const weightSuggestion = reduceWeight ? 0.5 : 1.0;

      const normalReasons = [
        reduceWeight ? "거시 지표 불안정" : "거시 지표 정상",
        "주봉·일봉 정배열 충족",
        `거래량 급증(${volumeRatio.toFixed(0)}%)`,
        tailDataMissing ? "윗꼬리 계산 불가 (참고값, 판정 미사용)" : `윗꼬리 ${tailRatio.toFixed(1)}% (참고값, 판정 미사용)`,
        ...freshnessDetails
      ];
      if (foreignBuyLimit) {
        normalReasons.push("외국인 당일 대량 순매수 확인 (익일 추가매수 여력 적음 우려)");
      }

      const aggressiveReasons = [
        reduceWeight ? "거시 지표 불안정" : "정배열 만족",
        freshnessCount < C.freshness.minPass ? "테마 신선도 조건 일부 미달(공격형 진입)" : `거래량 증가폭 다소 완화(${volumeRatio.toFixed(0)}%)`
      ];
      if (foreignBuyLimit) {
        aggressiveReasons.push("외국인 당일 대량 순매수 확인 (익일 추가매수 여력 적음 우려)");
      }

      if (!isExcluded && is1stStagePass && isFreshnessPass) {
        normalBucket.push({
          symbol,
          name,
          price,
          changeRate,
          classification: "normal",
          weightSuggestion,
          foreignBuyLimit,
          entryClose,
          reasons: normalReasons,
          metrics: { volumeRatio, tailRatio, freshnessCount, turnoverRate: detailVolTnrt, rsi14, quantSignal, latestIndicator, day0Open, day0High, day0Low, day0Close: entryClose, currentVolume }
        });
      } else if (!isExcluded && (isDailyAligned && isWeeklyAligned) && (freshnessCount < C.freshness.minPass || (volumeRatio >= C.aggressiveVolumeRatio.min && volumeRatio < C.aggressiveVolumeRatio.max))) {
        aggressiveBucket.push({
          symbol,
          name,
          price,
          changeRate,
          classification: "aggressive",
          weightSuggestion,
          foreignBuyLimit,
          entryClose,
          reasons: aggressiveReasons,
          metrics: { volumeRatio, tailRatio, freshnessCount, turnoverRate: detailVolTnrt, rsi14, quantSignal, latestIndicator, day0Open, day0High, day0Low, day0Close: entryClose, currentVolume }
        });
      } else {
        const finalExclReasons = reasons.length > 0 ? reasons : ["1단계 또는 2단계 테마 신선도 조건 미달"];
        excludeBucket.push({
          symbol,
          name,
          price,
          changeRate,
          classification: "exclude",
          entryClose,
          reasons: finalExclReasons,
          metrics: { volumeRatio, tailRatio, freshnessCount, turnoverRate: detailVolTnrt, rsi14, quantSignal, latestIndicator, day0Open, day0High, day0Low, day0Close: entryClose, currentVolume }
        });
      }
    }

    // 분석 대상(MAX_TARGET_STOCKS) 밖이라 분석되지 않은 종목은 results.exclude에 넣지 않는다.
    // (results.exclude는 "분석 후 기준 미달"만 담는다.) 노이즈 제거를 위해 카운트만 집계해
    // 디버그 응답에 outOfScopeCount로 노출한다.
    const accountedSymbols = new Set<string>([
      ...normalBucket.map(s => s.symbol),
      ...aggressiveBucket.map(s => s.symbol),
      ...excludeBucket.map(s => s.symbol),
      ...excludedNotice.map(s => s.symbol),
    ]);
    const outOfScopeCount = pureStocks.filter(stock =>
      !accountedSymbols.has(stock.mksc_shrn_iscd || stock.stck_shrn_iscd)
    ).length;

    // 단 1개 종목도 실시간 분석에 성공하지 못했다면 (모의투자 API 쿨다운 등 극단적 상황) 실패로 끝낸다
    if (analyzedSymbols.size === 0) {
      console.warn("[Overnight API] No symbols analyzed successfully.");
      if (isDebug) {
        return NextResponse.json({
          ok: false,
          error: "No symbols analyzed successfully",
          diagnostics: {
            volumeRankLength: volumeRank.length,
            pureStocksLength: pureStocks.length,
            primaryCandidatesLength: primaryCandidates.length,
            firstStockError: sanitizeError(firstStockErrorMsg) || "No stock fetch attempted"
          }
        });
      }
      return screeningFailed("no_symbols_analyzed", sanitizeError(firstStockErrorMsg) || undefined);
    }

    // 응답에 든 값의 출처를 여기서 굳힌다. 아래 궤적 갱신도 같은 범위에서 일봉을 받지만 그 값은 응답에 들지 않는다.
    const dataSource = cacheScopeDataSource(scope);
    const dataFetchedAt = scope.oldestReceivedAt ? new Date(scope.oldestReceivedAt).toISOString() : timestamp;
    const priceWarning = kstAfterHoursPriceWarning(scope.newestReceivedAt ?? Date.now());

    // 명시적 저장(2026-11-05) — 화면·수동 호출은 ?save=1 없이 부르므로 저장하지 않는다(view_only). 저장은 launchd
    // 15:41 실행(?save=1)만 한다. 덮어쓰기는 ?save=1&force=true 뿐이고 force 단독은 저장하지 않는다.
    // vercel.json cron 은 배포하지 않아 그대로 두었다. 배포하면 path 에 ?save=1 을 붙여야 저장된다.
    //
    // 저장 시간대 제한(2026-11-02, 11/03·11/05 개정) — 15:40~16:00 밖에서는(장중 잠정 종가, 종가 단일가 임의 종료 구간,
    // 애프터마켓 중·후 종가 오염)
    // day0·궤적을 남기지 않는다. 10/6~10/20 장중 실행분 29건, 마감 후 애프터마켓 구간 실행분 178행이 틀린 종가로
    // 저장된 원인(docs/release/known-issues.md). 조회·응답은 그대로 한다. 판정은 getKSTPersistWindow 하나만 쓴다.
    // 휴장일·주말은 위 거래일 가드가 이미 건너뛴다.
    //
    // 실행 중 창 재판정(2026-11-03): 종목별 일봉은 위 루프에서 차례로 받는다. 조회 시작과 저장 직전 두 시각이
    // 모두 창 안이어야 그 사이 받은 모든 종목이 창 안에서 받은 값이다. 15:39 에 시작해 15:40 을 넘긴 실행은 창 밖에서
    // 받은 값을, 16:00 을 넘긴 실행은 뒤쪽 종목의 애프터마켓 체결가를 담고 있을 수 있어 둘 다 저장하지 않는다.
    // 종목별로 나눠 일부만 저장하지 않는 이유: saveScreeningResult 는 그날 항목 전체를 지우고 다시 넣으며 빠진
    // 종목의 궤적까지 지운다. 일부만 저장하면 앞선 정상 실행의 기록이 지워진다. 건너뛴 day0 는 다음 날 궤적 갱신이
    // 확정 일봉으로 메운다(앞선 실행이 저장한 항목이 있을 때).
    //
    // 첫 저장 보호(2026-11-05) — ?save=1 이어도 그날 항목이 이미 있으면 쓰지 않는다.
    // 재저장은 항목 삭제·재삽입에 그치지 않고 탈락 종목의 궤적 그룹까지 지운다(10/28, 10/29 소실).
    // 정기 실행 실패 뒤 수동 재실행처럼 덮어써야 할 때만 ?save=1&force=true 를 쓴다. 저장 창은 force 로도 넘지 못한다.
    // 저장 여부 조회가 실패하면 쓰지 않는다. 있는 기록을 덮는 쪽이 하루 저장을 놓치는 쪽보다 되돌리기 어렵다.
    const saveDate = formatKSTDateCompact(new Date());
    let alreadySaved: ScreeningSavedInfo | null = null;
    let saveCheckFailed = false;
    if (saveRequested && fetchStartWindow.allowed) {
      try {
        alreadySaved = await getScreeningSavedInfo(saveDate);
      } catch (e) {
        saveCheckFailed = true;
        console.error("[Overnight API] Saved screening check failed:", (e as Error)?.message || e);
      }
    }
    const persistWindow = fetchStartWindow.allowed ? getKSTPersistWindow() : fetchStartWindow;
    const allBucketsForPersist = [...normalBucket, ...aggressiveBucket, ...excludeBucket];
    let persistSkippedReason: string | null = !saveRequested
      ? "view_only"
      : !persistWindow.allowed
        ? (persistWindow.reason ?? null)
        : saveCheckFailed
          ? "save_check_failed"
          : alreadySaved && !force
            ? "already_saved"
            : null;
    if (!persistSkippedReason && alreadySaved) {
      try {
        await logForceOverwrite(saveDate, [...allBucketsForPersist.map((i) => i.symbol), ...excludedNotice.map((i) => i.symbol)]);
      } catch (e) {
        persistSkippedReason = "force_log_failed";
        console.error("[Overnight API] Force overwrite log failed:", (e as Error)?.message || e);
      }
    }
    const persisted = persistSkippedReason === null;
    const unsaved = persisted
      ? null
      : {
          items: allBucketsForPersist.length + excludedNotice.length,
          day0: allBucketsForPersist.filter((i) => i.metrics?.day0Close !== undefined).length,
          closedDuringRun: saveRequested && fetchStartWindow.allowed && !persistWindow.allowed,
        };
    if (saveRequested && !persistWindow.allowed) {
      console.log(
        `[Overnight API] Persist window closed (${persistWindow.reason}${unsaved?.closedDuringRun ? ", 실행 중 닫힘" : ""}) — ` +
        `screening ${unsaved?.items ?? 0}건 / day0 ${unsaved?.day0 ?? 0}건 저장 안 함 (view only).`
      );
    } else if (!persisted) {
      console.log(`[Overnight API] Persist skipped (${persistSkippedReason}, savedAt=${alreadySaved?.savedAt ?? "-"}) — view only.`);
    }

    // 백테스트 집계를 위해 당일 스크리닝 결과를 영속 저장 (Redis 우선, 폴백 단계는 storage.ts 참고)
    if (persisted) try {
      const todayKey = formatKSTDateCompact(new Date());
      const persistedItems: ScreeningResultItem[] = [
        ...normalBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "normal" as const, entryClose: s.entryClose, reasons: s.reasons, changeRate: s.changeRate ?? null, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null, rsi14: s.metrics?.rsi14 ?? null, quantSignal: s.metrics?.quantSignal ?? false })),
        ...aggressiveBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "aggressive" as const, entryClose: s.entryClose, reasons: s.reasons, changeRate: s.changeRate ?? null, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null, rsi14: s.metrics?.rsi14 ?? null, quantSignal: s.metrics?.quantSignal ?? false })),
        ...excludeBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "exclude" as const, entryClose: s.entryClose, reasons: s.reasons, changeRate: s.changeRate ?? null, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null, rsi14: s.metrics?.rsi14 ?? null, quantSignal: s.metrics?.quantSignal ?? false })),
        ...excludedNotice.map((s) => ({ symbol: s.symbol, name: s.name, classification: "excludedNotice" as const, entryClose: s.entryClose, reasons: [s.reason] })),
      ];
      const { supabaseSaved } = await saveScreeningResult({
        date: todayKey,
        reduceWeight,
        kosdaqValue: kosdaqClose,
        items: persistedItems,
      });
      // 판정 기록 — 저장이 된 실행만 남긴다. persisted 가 곧 저장 창 판정이라 허용 시각도 같다
      if (supabaseSaved) await recordQuantJudgments(buildQuantJudgmentRows(todayKey, dataFetchedAt, allBucketsForPersist));
    } catch (e) {
      // 저장 실패는 스크리닝 응답 자체를 막지 않는다 (백테스트는 부가 기능)
      console.error("[Overnight API] Screening result persist failed:", (e as Error)?.message || e);
    }

    // [핵심 로직 변경] 당일 스크리닝 분석 대상 종목들의 days_after=0 궤적을 지표와 함께 DB에 직행 저장한다.
    // 기존에는 runDailyTrajectoryUpdate가 이를 수행 후 backfill-indicators가 지표를 채웠으나,
    // 이제 스크리닝 과정에서 계산된 일봉(최대 130봉)을 재사용해 지표 공백을 완전히 원천 차단한다.
    if (persisted) try {
      const todayKey = formatKSTDateCompact(new Date());
      const supabase = getSupabaseAdmin();
      if (supabase) {
        const trajectoryPayloads: any[] = [];
        const allBuckets = [...normalBucket, ...aggressiveBucket, ...excludeBucket];
        for (const item of allBuckets) {
          const m = item.metrics;
          if (!m || m.day0Close === undefined) continue;
          
          trajectoryPayloads.push({
            symbol: item.symbol,
            name: item.name,
            discovery_date: todayKey,
            trade_date: todayKey,
            days_after: 0,
            open: m.day0Open,
            high: m.day0High,
            low: m.day0Low,
            close: m.day0Close,
            volume: m.currentVolume,
            return_from_entry: 0,
            is_pre_discovery: false,
            rsi14: m.latestIndicator?.rsi14 ?? null,
            macd: m.latestIndicator?.macd ?? null,
            macd_signal: m.latestIndicator?.macdSignal ?? null,
            macd_hist: m.latestIndicator?.macdHist ?? null,
            bb_upper: m.latestIndicator?.bbUpper ?? null,
            bb_mid: m.latestIndicator?.bbMid ?? null,
            bb_lower: m.latestIndicator?.bbLower ?? null,
            bb_pct_b: m.latestIndicator?.bbPctB ?? null,
            ma5: m.latestIndicator?.ma5 ?? null,
            ma20: m.latestIndicator?.ma20 ?? null,
            ma60: m.latestIndicator?.ma60 ?? null,
            vol_ratio_5: m.latestIndicator?.volRatio5 ?? null,
            vol_ratio_20: m.latestIndicator?.volRatio20 ?? null,
            stoch_slow_k: m.latestIndicator?.stochSlowK ?? null,
            stoch_slow_d: m.latestIndicator?.stochSlowD ?? null,
            williams_r: m.latestIndicator?.williamsR ?? null,
            is_halted: m.latestIndicator?.isHalted ?? false,
          });
        }
        
        if (trajectoryPayloads.length > 0) {
          const { error } = await supabase.from("stock_trajectory").upsert(trajectoryPayloads, { onConflict: "symbol,discovery_date,trade_date" });
          if (error) {
            console.error("[Overnight API] Failed to upsert day0 trajectories:", error);
          } else {
            console.log(`[Overnight API] Successfully upserted ${trajectoryPayloads.length} day0 trajectories with indicators`);
            // 불변식: 방금 저장한 스크리닝 항목 entry_close 와 day0 종가가 같아야 한다(다르면 경고만)
            await warnEntryDay0Mismatches(supabase, trajectoryPayloads.map((p) => ({ symbol: p.symbol, date: todayKey })), "overnight");
          }
        }
      }
    } catch (e) {
      console.error("[Overnight API] Day0 trajectory persist failed:", (e as Error)?.message || e);
    }

    // 발굴 종목 궤적(stock_trajectory) 일일 갱신 — 실패해도 스크리닝 응답을 막지 않는다
    let trajectoryUpdate: Awaited<ReturnType<typeof runDailyTrajectoryUpdate>> = null;
    if (persisted) try {
      trajectoryUpdate = await runDailyTrajectoryUpdate();
    } catch (e) {
      console.error("[Overnight API] Trajectory update failed:", (e as Error)?.message || e);
    }

    return NextResponse.json({
      ok: true,
      persisted,
      ...(persisted ? {} : { persistSkippedReason, unsaved }),
      ...(alreadySaved ? { alreadySaved } : {}),
      ...(trajectoryUpdate ? { trajectoryUpdate } : {}),
      kosdaqState: {
        value: kosdaqClose,
        maState: kosdaqMAState,
        reduceWeight
      },
      kospiState: {
        value: kospiClose,
        // 120봉 미만이면 null — 화면은 지수값만 그린다
        maState: kospiMAState,
        reduceWeight: kospiReduceWeight
      },
      results: {
        normal: normalBucket,
        aggressive: aggressiveBucket,
        exclude: excludeBucket
      },
      excludedNotice,
      generatedAt: timestamp,
      // 어느 경로로 받았는지와, 응답에 든 값 중 가장 오래된 수신 시각. 캐시 경로의 generatedAt 은 응답 시각일 뿐이다.
      // priceWarning 은 가장 늦게 받은 값의 시각으로 판정한다 — 16:00 을 넘겨 끝난 조회도 뒤쪽 값에 체결가가 섞인다
      dataSource,
      dataFetchedAt,
      priceWarning,
      ...(isDebug ? {
        diagnostics: {
          outOfScopeCount,
          analyzedCount: analyzedSymbols.size,
          pureStocksLength: pureStocks.length,
          primaryCandidatesLength: primaryCandidates.length,
        }
      } : {}),
      disclaimer: OVERNIGHT_DISCLAIMER
    });

  } catch (err: any) {
    // stack은 서버 로그에만 남기고 응답 본문에는 절대 넣지 않는다.
    console.error("[Overnight API] Critical error:", err?.stack || err);
    // 실패 시 DB 저장은 하지 않는다 — 일부만 분석된 결과를 그날의 스크리닝으로 남기지 않는다(2026-10-30).
    if (isDebug) {
      return NextResponse.json({
        ok: false,
        error: sanitizeError(err?.message || String(err)),
        diagnostics: {
          volumeRankLength: typeof volumeRank !== "undefined" ? volumeRank.length : undefined,
          firstStockError: sanitizeError(firstStockErrorMsg)
        }
      }, { status: 500 });
    }
    return screeningFailed("critical_error", sanitizeError(err?.message || String(err)));
  }
}
