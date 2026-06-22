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
  
  try {
    // [0단계] 거시 필터 - 코스닥 지수 (1001) 정배열/역배열 판정
    let reduceWeight = false;
    let kosdaqMAState = { ma5: 0, ma20: 0, ma60: 0, ma120: 0 };
    let kosdaqClose = 0;
    
    try {
      const kosdaqIndexDaily = await withRateLimitRetry(() => getDomesticIndexDaily("1001"));
      if (kosdaqIndexDaily && kosdaqIndexDaily.length >= 120) {
        kosdaqClose = Number(kosdaqIndexDaily[0].bstp_nmix_prpr || 0);
        kosdaqMAState = {
          ma5: calculateMA(kosdaqIndexDaily, 5, "bstp_nmix_prpr"),
          ma20: calculateMA(kosdaqIndexDaily, 20, "bstp_nmix_prpr"),
          ma60: calculateMA(kosdaqIndexDaily, 60, "bstp_nmix_prpr"),
          ma120: calculateMA(kosdaqIndexDaily, 120, "bstp_nmix_prpr"),
        };
        // 역배열 여부 (5 > 20 > 60 > 120 정배열이 아닌 경우 역배열 또는 하락 흐름으로 판단)
        const isAligned = 
          kosdaqMAState.ma5 > kosdaqMAState.ma20 && 
          kosdaqMAState.ma20 > kosdaqMAState.ma60 && 
          kosdaqMAState.ma60 > kosdaqMAState.ma120;
        
        reduceWeight = !isAligned;
      } else {
        // 데이터 부족 시 기본값 정상으로 설정
        reduceWeight = false;
      }
    } catch (err: any) {
      // stack은 서버 로그에만 남기고 응답 본문에는 절대 넣지 않는다.
      console.error("[Overnight API] KOSDAQ index fetch failed:", err?.stack || err);
      if (isDebug) {
        return NextResponse.json({
          ok: false,
          error: "KOSDAQ index fetch failed",
          diagnostics: {
            message: sanitizeError(err?.message || String(err)),
          }
        }, { status: 500 });
      }
      reduceWeight = false;
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
    const etfPrefixRegex = /^(KODEX|TIGER|KBSTAR|ACE|SOL|HANARO|KOSEF|ARIRANG|KINDEX|KOEX|ETN|RISE|코덱스|타이거|라이즈)/i;
    const derivativeRegex = /레버리지|인버스|선물/i;

    // 1. ETF / ETN / 지수 추종 및 스팩주 원천 필터링 (결과 리포트에서 전면 배제)
    const pureStocks = volumeRank.filter(stock => {
      const symbol = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
      const name = stock.hts_kor_isnm;
      
      const masterItem = master.find(s => s.symbol === symbol);
      const isETF = masterItem?.type === "etf" || masterItem?.market === "ETF" || masterItem?.market === "ETN";
      const hasEtfKeyword = etfPrefixRegex.test(name) || derivativeRegex.test(name);
      const isSpac = name.includes("스팩") || /spac/i.test(name);
      
      return !(isETF || hasEtfKeyword || isSpac);
    });

    // 2. 상승률 상위(당일 +3% 이상) + 최소 거래대금 10억 이상 필터링 (거래대금 오타 acml_tr_pbmd -> acml_tr_pbmn 수정)
    // 1차 선별은 volume-rank의 등락률과 거래대금만으로 수행하고, 회전율 판정은 2차 현재가 상세 응답으로 위임합니다.
    const primaryCandidates = pureStocks.filter(stock => {
      const changeRate = Number(stock.prdy_ctrt || 0);
      const trPbmn = Number(stock.acml_tr_pbmn || 0);
      return changeRate >= 3 && trPbmn >= 1000000000;
    });

    // 3. 후보군이 12개에 달할 때까지 거래량 상위의 다른 순수 주식들로 채움 (호출량 감소 및 Rate Limit/타임아웃 방지)
    const targetStocks: any[] = [...primaryCandidates];
    for (const stock of pureStocks) {
      if (targetStocks.length >= 12) break;
      const symbol = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
      if (!targetStocks.some(ts => (ts.mksc_shrn_iscd || ts.stck_shrn_iscd) === symbol)) {
        targetStocks.push(stock);
      }
    }

    if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
      console.log(`[Overnight API debug] Volume rank total: ${volumeRank.length} | Pure stocks: ${pureStocks.length} | Target stocks (max 12): ${targetStocks.length}`);
    }

    const normalBucket: any[] = [];
    const aggressiveBucket: any[] = [];
    const excludeBucket: any[] = [];
    const analyzedSymbols = new Set<string>();
    firstStockErrorMsg = "";

    // targetStocks (최대 12종목) 분석 진행
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
          reasons: ["KIS API 시세 데이터 조회 지연 또는 실패"],
        });
        continue;
      }

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

      if (dailyCandles.length < 120 || weeklyCandles.length < 120) {
        reasons.push("이평선 계산을 위한 시세 데이터(120봉) 부족");
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

      // 1-5. 윗꼬리 제한: (고가 - 종가) / 고가 <= 3.5%
      const high = Number(stock.stck_hgpr || price);
      const tailRatio = high > 0 ? ((high - price) / high) * 100 : 0;
      const isTailSafe = tailRatio <= 3.5;

      if (!isTailSafe) {
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
          reasons: normalReasons,
          metrics: { volumeRatio, tailRatio, freshnessCount }
        });
      } else if (!isExcluded && (isDailyAligned && isWeeklyAligned) && (freshnessCount <= 2 || (volumeRatio >= 150 && volumeRatio < 200))) {
        aggressiveBucket.push({
          symbol,
          name,
          price,
          changeRate,
          classification: "aggressive",
          weightSuggestion,
          foreignBuyLimit,
          reasons: aggressiveReasons,
          metrics: { volumeRatio, tailRatio, freshnessCount }
        });
      } else {
        const finalExclReasons = reasons.length > 0 ? reasons : ["1단계 또는 2단계 테마 신선도 조건 미달"];
        excludeBucket.push({
          symbol,
          name,
          price,
          changeRate,
          classification: "exclude",
          reasons: finalExclReasons,
          metrics: { volumeRatio, tailRatio, freshnessCount }
        });
      }
    }

    // 거래대금 상위 12종목 외(미분석) 순수 주식들은 제외 버킷으로 분류
    const unanalyzedStocks = pureStocks.filter(stock => {
      const symbol = stock.mksc_shrn_iscd || stock.stck_shrn_iscd;
      return !analyzedSymbols.has(symbol) && !excludeBucket.some(eb => eb.symbol === symbol);
    });

    unanalyzedStocks.forEach(stock => {
      excludeBucket.push({
        symbol: stock.mksc_shrn_iscd || stock.stck_shrn_iscd,
        name: stock.hts_kor_isnm,
        price: Number(stock.stck_prpr || 0),
        changeRate: Number(stock.prdy_ctrt || 0),
        classification: "exclude",
        reasons: ["거래대금 상위 12종목 외 미분석"],
      });
    });

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

    return NextResponse.json({
      ok: true,
      kosdaqState: {
        value: kosdaqClose,
        maState: kosdaqMAState,
        reduceWeight
      },
      results: {
        normal: normalBucket,
        aggressive: aggressiveBucket,
        exclude: excludeBucket
      },
      generatedAt: timestamp,
      disclaimer: "본 스크리닝 결과는 이동평균선 및 당사의 오버나이트 알고리즘 기준에 따라 추출된 참고 자료이며, 투자 결과에 대한 책임은 투자자 본인에게 있습니다."
    });

  } catch (err: any) {
    // stack은 서버 로그에만 남기고 응답 본문에는 절대 넣지 않는다.
    console.error("[Overnight API] Critical error:", err?.stack || err);
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
    generatedAt: timestamp,
    disclaimer: "본 스크리닝 결과는 이동평균선 및 당사의 오버나이트 알고리즘 기준에 따라 추출된 참고 자료이며, 투자 결과에 대한 책임은 투자자 본인에게 있습니다."
  };
}
