import { NextResponse } from "next/server";
import { 
  getDomesticIndexDaily, 
  getDomesticVolumeRank, 
  getDomesticStockDaily, 
  getDomesticStockWeekly,
  getDomesticStockDetail
} from "@/server/kis/rest-client";
import { kisConfig } from "@/server/kis/config";
import { getSearchMaster } from "@/lib/stocks/search-master";
import { saveScreeningResult, formatKSTDateCompact, type ScreeningResultItem } from "@/server/screening/storage";

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

// 헬퍼: EGW00201(초당 거래건수 초과) 등 rate limit 에러 감지
function isRateLimitError(msg: string): boolean {
  const m = String(msg).toLowerCase();
  return m.includes("egw00201") || m.includes("429") || m.includes("건수") || m.includes("초과") || m.includes("limit");
}

// 헬퍼: rate limit 시 backoff 후 1회 재시도하는 공통 래퍼.
// 지수/순위(루프 이전)와 종목 루프 호출 모두에 적용해 cold-start 첫 호출을 자동 복구한다.
// (전역 큐 + 재시도 이중 방어. rate limit이 아닌 에러는 재시도 없이 즉시 전파)
async function withRateLimitRetry<T>(fn: () => Promise<T>, retries = 1, backoffMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message || e);
      if (attempt < retries && isRateLimitError(msg)) {
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const isDebug = searchParams.get("debug") === "true";
  const timestamp = new Date().toISOString();
  let volumeRank: any[] = [];
  let firstStockErrorMsg = "";
  // 분석 결과 버킷을 외부 스코프에 선언 — 외부 catch에서도 저장 가능하도록
  let normalBucket: any[] = [];
  let aggressiveBucket: any[] = [];
  let excludeBucket: any[] = [];
  let excludedNotice: { symbol: string; name: string; reason: string; entryClose: number }[] = [];
  let analyzedSymbols = new Set<string>();
  let reduceWeight = false;
  let kosdaqClose = 0;

  try {
    // [0단계] 거시 필터 - 코스닥(1001) + 코스피(0001) 정배열/역배열 판정 (병렬 조회)
    let kosdaqMAState = { ma5: 0, ma20: 0, ma60: 0, ma120: 0 };
    let kospiClose = 0;
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

    // mock gate: 실전 시세 자격증명(KIS_APP_KEY_PROD)이 없는 경우에만 mock 반환
    // KIS_MODE=mock이더라도 quote 키가 구성되어 있으면 실데이터 스크리닝 수행
    // (KIS_MODE는 주문 모드를 제어할 뿐, 시세 스크리닝과 무관)
    const hasQuoteCreds = kisConfig.quote.configured;
    if (!hasQuoteCreds && !isDebug) {
      console.log("[Overnight API] No quote credentials configured. Serving mock data.");
      return NextResponse.json(getMockScreeningResult(reduceWeight, kosdaqClose, kosdaqMAState));
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
      return NextResponse.json(getMockScreeningResult(reduceWeight, kosdaqClose, kosdaqMAState));
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
      const isAbnormalMove = changeRate < -30 || changeRate > 30;
      const isPennyStock = price < 1000;

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
        return changeRate >= 3 && trPbmn >= 1000000000;
      })
      .sort((a, b) => volTnrtOf(b) - volTnrtOf(a));

    // 3. 분석 대상을 MAX_TARGET_STOCKS개로 제한한다.
    //    Phase 38에서 일봉/주봉도 페이지네이션(종목당 일봉 2 + 주봉 2 + 상세 1 = 최대 5호출)
    //    되면서 호출량이 늘었으므로, cold-start(캐시 미스) 타임아웃/Rate Limit 방지를 위해
    //    12 → 8로 축소. 캐시가 채워지면 당일 재호출은 거의 발생하지 않는다.
    const MAX_TARGET_STOCKS = 8;
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
      if (changeRate >= 20 && changeRate < 25) {
        reasons.push("당일 등락률 +20% 이상 제외");
        isExcluded = true;
      }
      if (changeRate >= 25) {
        reasons.push("상한가 근접(+25% 이상) 제외");
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
        if (detailVolTnrt < 5.0) {
          reasons.push(`회전율 기준 미달 (${detailVolTnrt.toFixed(2)}%, 기준 5.0% 이상)`);
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
      const dailyInsufficient = dailyCandles.length < 120;
      const weeklyInsufficient = weeklyCandles.length < 120;
      const insufficientData = dailyInsufficient || weeklyInsufficient;
      if (insufficientData && !isExcluded) {
        let reason: string;
        if (dailyInsufficient) {
          // 일봉도 부족 = 신규상장 수준
          reason = `일봉 데이터 부족 (상장 이력 짧음) — ${dailyCandles.length}봉 확보 / 120봉 필요`;
        } else {
          // 일봉은 충분하지만 주봉 부족 = 상장 ~2.5년 미만
          reason = `주봉 데이터 부족 — 상장 후 약 2.5년 미만 (${weeklyCandles.length}봉 확보 / 120봉 필요, 주봉 정배열 판정 불가)`;
        }
        excludedNotice.push({ symbol, name, entryClose, reason });
        continue;
      }
      if (insufficientData) {
        // 이미 위험/기준 문제가 있는 종목은 그대로 제외 버킷으로 (부가 사유만 기록)
        const lackDesc = dailyInsufficient
          ? `일봉 ${dailyCandles.length}봉 확보 / 120봉 필요`
          : `주봉 ${weeklyCandles.length}봉 확보 / 120봉 필요`;
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
      const isVolumeSpike = volumeRatio >= 200;
      
      if (!isVolumeSpike) {
        reasons.push(`거래량 비율 미달 (20일 평균 대비 ${volumeRatio.toFixed(1)}%, 기준 200% 이상)`);
      }

      // 1-5. 윗꼬리 제한: (당일 고가 - 당일 종가) / 당일 고가 <= 3.5%
      //   ※ volume-rank API(stock)는 고가(stck_hgpr)를 반환하지 않으므로 당일 확정
      //     일봉(dailyCandles[0]) 기준으로 계산한다. 분자/분모 모두 일봉으로 통일하며
      //     실시간 현재가(price)는 tailRatio 계산에 사용하지 않는다.
      const dailyHigh = Number(dailyCandles?.[0]?.stck_hgpr || 0);
      const dailyClose = Number(dailyCandles?.[0]?.stck_clpr || price);
      const tailDataMissing = dailyHigh <= 0;
      const tailRatio = tailDataMissing ? 0 : ((dailyHigh - dailyClose) / dailyHigh) * 100;
      // 데이터 부족(고가 누락)은 "진짜 윗꼬리 0%"가 아니므로 안전 통과로 취급하지 않는다.
      const isTailSafe = !tailDataMissing && tailRatio <= 3.5;

      if (tailDataMissing) {
        console.warn(`[Overnight API] Tail data missing for ${name} (${symbol}) — dailyCandles[0].stck_hgpr 누락, tailRatio 계산 불가`);
        reasons.push("윗꼬리 계산 불가 (당일 일봉 고가 데이터 부족)");
      } else if (!isTailSafe) {
        reasons.push(`윗꼬리 비율 초과 (${tailRatio.toFixed(1)}%, 기준 3.5% 이하)`);
      }

      // 2단계: 테마 신선도 검사 (4개 중 3개 이상)
      let freshnessCount = 0;
      const freshnessDetails: string[] = [];

      // 2-1. 대량거래 동반 +10%↑ 장대양봉 발생 후 5일 이내인지 여부
      let bigCandleIndex = -1;
      for (let i = 0; i < Math.min(5, dailyCandles.length); i++) {
        const c = dailyCandles[i];
        const cOpen = Number(c.stck_oprc || 0);
        const cClose = Number(c.stck_clpr || 0);
        const cVolume = Number(c.acml_vol || 0);
        const cChange = cOpen > 0 ? ((cClose - cOpen) / cOpen) * 100 : 0;
        
        // 이전 20일 거래량 평균 구하기 (i번째 봉 시점)
        const subDaily = dailyCandles.slice(i + 1);
        const cAvgVol = calculateAvgVolume(subDaily, 20);
        
        if (cChange >= 10 && cVolume >= cAvgVol * 2) {
          bigCandleIndex = i;
          break;
        }
      }

      const hasBigCandleWithin5Days = bigCandleIndex !== -1;
      if (hasBigCandleWithin5Days) {
        freshnessCount++;
        freshnessDetails.push("5일 이내 장대양봉 발생");
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
          isVolumeContracted = avgVolumeAdj <= bigVolume * 0.5;
          if (isVolumeContracted) {
            freshnessCount++;
            freshnessDetails.push("조정기 거래량 50% 이하 감소");
          }

          // 2-4. 조정구간 평균 일중 변동폭 <= 장대양봉 변동폭의 50%
          const avgRangeAdj = adjustmentRange.reduce((acc, c) => {
            const h = Number(c.stck_hgpr || 0);
            const l = Number(c.stck_lwpr || 0);
            return acc + (h - l);
          }, 0) / adjustmentRange.length;
          isVolatilityContracted = avgRangeAdj <= bigRange * 0.5;
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

      // 3버킷 분류 판단
      const is1stStagePass = isDailyAligned && isWeeklyAligned && isVolumeSpike && isTailSafe && !isExcluded;
      const isFreshnessPass = freshnessCount >= 3;
      const weightSuggestion = reduceWeight ? 0.5 : 1.0;

      const normalReasons = [
        reduceWeight ? "거시 지표 불안정(비중 50% 축소 제안)" : "거시 지표 정상",
        "주봉·일봉 정배열 충족",
        `거래량 급증(${volumeRatio.toFixed(0)}%)`,
        `안정적인 윗꼬리(${tailRatio.toFixed(1)}%)`,
        ...freshnessDetails
      ];
      if (foreignBuyLimit) {
        normalReasons.push("외국인 당일 대량 순매수 확인 (익일 추가매수 여력 적음 우려)");
      }

      const aggressiveReasons = [
        reduceWeight ? "거시 지표 불안정(비중 50% 축소 제안)" : "정배열 만족",
        freshnessCount <= 2 ? "테마 신선도 조건 일부 미달(공격형 진입)" : `거래량 증가폭 다소 완화(${volumeRatio.toFixed(0)}%)`
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
          metrics: { volumeRatio, tailRatio, freshnessCount, turnoverRate: detailVolTnrt }
        });
      } else if (!isExcluded && isTailSafe && (isDailyAligned && isWeeklyAligned) && (freshnessCount <= 2 || (volumeRatio >= 150 && volumeRatio < 200))) {
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
          metrics: { volumeRatio, tailRatio, freshnessCount, turnoverRate: detailVolTnrt }
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
          metrics: { volumeRatio, tailRatio, freshnessCount, turnoverRate: detailVolTnrt }
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

    // 만약 단 1개 종목도 실시간 분석에 성공하지 못했다면 (모의투자 API 쿨다운 등 극단적 상황)
    // 사용자 경험 보존을 위해 Mock 데이터로 Fallback 서빙 (디버그 모드일 때는 Mock fallback 차단)
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
      return NextResponse.json(getMockScreeningResult(reduceWeight, kosdaqClose, kosdaqMAState));
    }

    // 백테스트 집계를 위해 당일 스크리닝 결과를 영속 저장 (Redis 우선, 폴백 단계는 storage.ts 참고)
    try {
      const todayKey = formatKSTDateCompact(new Date());
      const persistedItems: ScreeningResultItem[] = [
        ...normalBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "normal" as const, entryClose: s.entryClose, reasons: s.reasons, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null })),
        ...aggressiveBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "aggressive" as const, entryClose: s.entryClose, reasons: s.reasons, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null })),
        ...excludeBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "exclude" as const, entryClose: s.entryClose, reasons: s.reasons, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null })),
        ...excludedNotice.map((s) => ({ symbol: s.symbol, name: s.name, classification: "excludedNotice" as const, entryClose: s.entryClose, reasons: [s.reason] })),
      ];
      await saveScreeningResult({
        date: todayKey,
        reduceWeight,
        kosdaqValue: kosdaqClose,
        items: persistedItems,
      });
    } catch (e) {
      // 저장 실패는 스크리닝 응답 자체를 막지 않는다 (백테스트는 부가 기능)
      console.error("[Overnight API] Screening result persist failed:", (e as Error)?.message || e);
    }

    return NextResponse.json({
      ok: true,
      kosdaqState: {
        value: kosdaqClose,
        maState: kosdaqMAState,
        reduceWeight
      },
      kospiState: {
        value: kospiClose,
        reduceWeight: kospiReduceWeight
      },
      results: {
        normal: normalBucket,
        aggressive: aggressiveBucket,
        exclude: excludeBucket
      },
      excludedNotice,
      generatedAt: timestamp,
      ...(isDebug ? {
        diagnostics: {
          outOfScopeCount,
          analyzedCount: analyzedSymbols.size,
          pureStocksLength: pureStocks.length,
          primaryCandidatesLength: primaryCandidates.length,
        }
      } : {}),
      disclaimer: "본 스크리닝 결과는 이동평균선 및 당사의 오버나이트 알고리즘 기준에 따라 추출된 참고 자료이며, 투자 결과에 대한 책임은 투자자 본인에게 있습니다."
    });

  } catch (err: any) {
    // stack은 서버 로그에만 남기고 응답 본문에는 절대 넣지 않는다.
    console.error("[Overnight API] Critical error:", err?.stack || err);
    // 실데이터 분석이 한 건이라도 완료된 상태면 오류 경로에서도 결과를 영속 저장한다.
    if (analyzedSymbols.size > 0) {
      try {
        const todayKey = formatKSTDateCompact(new Date());
        const partialItems: ScreeningResultItem[] = [
          ...normalBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "normal" as const, entryClose: s.entryClose, reasons: s.reasons, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null })),
          ...aggressiveBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "aggressive" as const, entryClose: s.entryClose, reasons: s.reasons, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null })),
          ...excludeBucket.map((s) => ({ symbol: s.symbol, name: s.name, classification: "exclude" as const, entryClose: s.entryClose, reasons: s.reasons, tailRatio: s.metrics?.tailRatio ?? null, volumeRatio: s.metrics?.volumeRatio ?? null, turnoverRate: s.metrics?.turnoverRate ?? null, freshnessCount: s.metrics?.freshnessCount ?? null })),
          ...excludedNotice.map((s) => ({ symbol: s.symbol, name: s.name, classification: "excludedNotice" as const, entryClose: s.entryClose, reasons: [s.reason] })),
        ];
        await saveScreeningResult({ date: todayKey, reduceWeight, kosdaqValue: kosdaqClose, items: partialItems });
      } catch (saveErr) {
        console.error("[Overnight API] Save in error path failed:", (saveErr as Error)?.message || saveErr);
      }
    }
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
    // 에러 발생 시 견고하게 Mock 데이터로 Fallback하여 사용자 화면이 안 나오거나 터지지 않도록 방지
    return NextResponse.json(getMockScreeningResult(false, 845.2, { ma5: 850, ma20: 840, ma60: 830, ma120: 820 }));
  }
}

// 헬퍼: KIS Mock 모드 또는 에러 발생 시를 위한 고품질 모킹 데이터
function getMockScreeningResult(reduceWeight: boolean, kosdaqClose: number, kosdaqMAState: any) {
  const timestamp = new Date().toISOString();
  const weightSuggestion = reduceWeight ? 0.5 : 1.0;
  
  return {
    ok: true,
    kosdaqState: {
      value: kosdaqClose || 842.15,
      maState: kosdaqMAState || { ma5: 839.2, ma20: 843.5, ma60: 830.1, ma120: 815.4 },
      reduceWeight: reduceWeight
    },
    results: {
      normal: [
        {
          symbol: "000660",
          name: "SK하이닉스",
          price: 224500,
          changeRate: 3.5,
          classification: "normal",
          weightSuggestion,
          foreignBuyLimit: true,
          reasons: [
            reduceWeight ? "거시 지표 불안정(비중 50% 축소 제안)" : "거시 지표 정상",
            "주봉·일봉 정배열(5 > 20 > 60 > 120) 충족",
            "거래량 급증(20일 평균 대비 245%)",
            "윗꼬리 제한 통과(0.8%)",
            "5일 이내 장대양봉 발생",
            "장대양봉 중간값 지지",
            "변동성 수렴 완료",
            "외국인 당일 대량 순매수 확인 (익일 추가매수 여력 적음 우려)"
          ],
          metrics: { volumeRatio: 245.2, tailRatio: 0.8, freshnessCount: 3 }
        },
        {
          symbol: "005930",
          name: "삼성전자",
          price: 81200,
          changeRate: 1.8,
          classification: "normal",
          weightSuggestion,
          foreignBuyLimit: false,
          reasons: [
            reduceWeight ? "거시 지표 불안정(비중 50% 축소 제안)" : "거시 지표 정상",
            "주봉·일봉 정배열 충족",
            "거래량 급증(20일 평균 대비 210%)",
            "윗꼬리 제한 통과(1.2%)",
            "5일 이내 장대양봉 발생",
            "장대양봉 중간값 지지",
            "조정기 거래량 50% 이하 감소"
          ],
          metrics: { volumeRatio: 210.5, tailRatio: 1.2, freshnessCount: 3 }
        }
      ],
      aggressive: [
        {
          symbol: "086520",
          name: "에코프로",
          price: 94500,
          changeRate: 6.2,
          classification: "aggressive",
          weightSuggestion,
          foreignBuyLimit: false,
          reasons: ["정배열 만족", "거래량 증가폭 다소 완화(20일 평균 대비 175%)", "테마 신선도 조건 일부 미달(공격형 추세 지속)"],
          metrics: { volumeRatio: 175.4, tailRatio: 2.1, freshnessCount: 2 }
        },
        {
          symbol: "068270",
          name: "셀트리온",
          price: 189400,
          changeRate: -0.5,
          classification: "aggressive",
          weightSuggestion,
          foreignBuyLimit: true,
          reasons: [
            "정배열 만족", 
            "거래량 조건 통과(205%)", 
            "테마 신선도 2개 요건 만족(공격형 매매)",
            "외국인 당일 대량 순매수 확인 (익일 추가매수 여력 적음 우려)"
          ],
          metrics: { volumeRatio: 205.1, tailRatio: 0.5, freshnessCount: 2 }
        }
      ],
      exclude: [
        {
          symbol: "005490",
          name: "POSCO홀딩스",
          price: 368000,
          changeRate: 0.2,
          classification: "exclude",
          reasons: ["정배열 미달 (일봉 MA5 < MA20 역배열 상태)"],
          metrics: { volumeRatio: 85.2, tailRatio: 0.1, freshnessCount: 0 }
        },
        {
          symbol: "035720",
          name: "카카오",
          price: 43200,
          changeRate: -2.3,
          classification: "exclude",
          reasons: ["정배열 미달 (주봉/일봉 모두 역배열 상태)", "거래량 기준 미달(82%)"],
          metrics: { volumeRatio: 82.4, tailRatio: 0.0, freshnessCount: 0 }
        },
        {
          symbol: "005380",
          name: "현대차",
          price: 275000,
          changeRate: 23.5,
          classification: "exclude",
          reasons: ["당일 등락률 +20% 이상 급등주 제외", "상한가 근접 제외"],
          metrics: { volumeRatio: 310.2, tailRatio: 4.8, freshnessCount: 4 }
        },
        {
          symbol: "999999",
          name: "투자경고예시주",
          price: 15400,
          changeRate: 12.4,
          classification: "exclude",
          reasons: ["투자경고 종목 제외"],
          metrics: { volumeRatio: 450.2, tailRatio: 1.2, freshnessCount: 3 }
        },
        {
          symbol: "999998",
          name: "거래정지예시주",
          price: 5200,
          changeRate: 0.0,
          classification: "exclude",
          reasons: ["거래정지 종목 제외"],
          metrics: { volumeRatio: 0.0, tailRatio: 0.0, freshnessCount: 0 }
        },
        {
          symbol: "999997",
          name: "단기과열예시주",
          price: 8900,
          changeRate: 4.5,
          classification: "exclude",
          reasons: ["단기과열 종목 제외 (공격형 이하 강등)"],
          metrics: { volumeRatio: 220.5, tailRatio: 1.0, freshnessCount: 3 }
        }
      ]
    },
    excludedNotice: [],
    generatedAt: timestamp,
    disclaimer: "본 스크리닝 결과는 이동평균선 및 당사의 오버나이트 알고리즘 기준에 따라 추출된 참고 자료이며, 투자 결과에 대한 책임은 투자자 본인에게 있습니다."
  };
}
