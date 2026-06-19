import "server-only";
import { callKisApi } from "./auth";
import { 
  normalizeKisDomesticQuote, 
  normalizeKisDomesticOrderbook,
  normalizeKisDomesticIndex
} from "./normalizers";
import { withDedupeAndCache } from "./cache";
import { type StockQuote, type StockOrderbook, type MarketIndex } from "@/types/stock";

/**
 * KIS REST API를 통한 시세 및 호가 조회 클라이언트
 */

interface KisRawResponse {
    rt_cd: string;
    msg1: string;
    output?: Record<string, unknown>;
    output1?: Record<string, unknown>;
    output2?: Record<string, unknown>;
}

/**
 * 국내 주식 현재가 조회 (FHKST01010100)
 */
export async function getDomesticStockQuote(symbol: string): Promise<StockQuote> {
  return withDedupeAndCache(`quote_${symbol}`, 15000, async () => {
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });
    
    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-price?${query.toString()}`, {
      method: "GET",
      trId: "FHKST01010100",
      useQuoteCreds: true
    });

    if (data.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    return normalizeKisDomesticQuote(data.output || data.output1 || {});
  });
}

/**
 * 국내 주식 호가 조회 (FHKST01010200)
 */
export async function getDomesticStockOrderbook(symbol: string): Promise<StockOrderbook> {
  return withDedupeAndCache(`orderbook_${symbol}`, 15000, async () => {
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });

    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn?${query.toString()}`, {
      method: "GET",
      trId: "FHKST01010200",
      useQuoteCreds: true
    });

    if (data.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    // 호가 API는 주로 output1, output2로 나뉘어 반환됨
    return normalizeKisDomesticOrderbook(data.output1 || data.output || {});
  });
}


/**
 * 국내 지수 현재가 조회 (FHKST03010100)
 * @param code 0001: KOSPI, 1001: KOSDAQ 등
 */
export async function getDomesticIndex(code: string): Promise<MarketIndex> {
  const tryFetch = async (divCode: string) => {
    const today = new Date();
    // Use KST to avoid UTC cutoff issues
    const formatKSTDate = (d: Date) => {
        const kstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
        return kstDate.toISOString().split('T')[0].replace(/-/g, '');
    };
    
    const lastWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: divCode, 
      FID_INPUT_ISCD: code,
      FID_INPUT_DATE_1: formatKSTDate(lastWeek),
      FID_INPUT_DATE_2: formatKSTDate(today), 
      FID_PERIOD_DIV_CODE: "D",
    });
    return await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-index-price?${query.toString()}`, {
      method: "GET",
      trId: "FHKUP03500100", // 업종기간별시세
      useQuoteCreds: true
    });
  };

  let data = await tryFetch("U");

  if (data.rt_cd !== "0") {
    data = await tryFetch("J");
  }

  if (data.rt_cd !== "0") {
    throw new Error(`KIS API Error: ${data.msg1}`);
  }

  const output1 = data.output1 || data.output || {};
  const output2 = Array.isArray(data.output2) && data.output2.length > 0 ? data.output2[0] : {};
  const merged = { ...output1, ...output2 };
  
  return normalizeKisDomesticIndex(merged);
}

/**
 * 국내 주식 일봉/주봉/월봉 조회 (FHKST03010100)
 */
export async function getDomesticStockDaily(symbol: string): Promise<any> {
  return withDedupeAndCache(`daily_${symbol}`, 60000, async () => {
    const d = new Date();
    const d1 = new Date(d.getTime() - 240 * 24 * 60 * 60 * 1000); // about 8 months to support 120-day MA
    const formatKSTDate = (date: Date) => {
        const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        return kst.toISOString().split('T')[0].replace(/-/g, '');
    };

    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
      FID_INPUT_DATE_1: formatKSTDate(d1),
      FID_INPUT_DATE_2: formatKSTDate(d),
      FID_PERIOD_DIV_CODE: "D",
      FID_ORG_ADJ_PRC: "0" // 0: 수정주가
    });

    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${query.toString()}`, {
      method: "GET",
      trId: "FHKST03010100",
      useQuoteCreds: true
    });

    if (data.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    // data.output2 contains the array of daily candles
    return data.output2 || [];
  });
}

/**
 * 국내 주식 당일 분봉 조회 (FHKST03010200)
 */
export async function getDomesticStockIntraday(symbol: string, time: string = "093000"): Promise<any> {
    return withDedupeAndCache(`intraday_${symbol}_${time}`, 60000, async () => {
        const query = new URLSearchParams({
            FID_ETC_CLS_CODE: "",
            FID_COND_MRKT_DIV_CODE: "J",
            FID_INPUT_ISCD: symbol,
            FID_INPUT_HOUR_1: time, // KIS requires a starting time
            FID_PW_DATA_INCU_YN: "N" // Exclude after hours
        });

        const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${query.toString()}`, {
            method: "GET",
            trId: "FHKST03010200",
            useQuoteCreds: true
        });

        if (data.rt_cd !== "0") {
            throw new Error(`KIS API Error: ${data.msg1}`);
        }

        return data.output2 || [];
    });
}

/**
 * 국내 주식 뉴스 조회 (FHKST01012200)
 * 일부 종목에서 404를 반환하는 경우 silent fallback 처리.
 */
export async function getDomesticStockNews(symbol: string): Promise<any[]> {
  return withDedupeAndCache(`news_${symbol}`, 60000, async () => {
    const query = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
    });

    try {
      const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-content?${query.toString()}`, {
          method: "GET",
          trId: "FHKST01012200",
          useQuoteCreds: true
      });

      if (data.rt_cd !== "0") {
          // rt_cd 오류는 warn 레벨 (정상 케이스 포함)
          console.debug(`[KIS News] rt_cd=${data.rt_cd} for ${symbol}: ${data.msg1}`);
          return [];
      }

      return (data as any).output || [];
    } catch (e: any) {
      // 404 / 엔드포인트 미지원 종목 → debug 레벨로 조용히 처리
      const is404 = e?.message?.includes("404") || e?.status === 404;
      if (is404) {
        console.debug(`[KIS News] 404 for ${symbol} — news endpoint not available for this symbol`);
      } else {
        console.warn(`[KIS News] Unexpected error for ${symbol}:`, e?.message ?? e);
      }
      return [];
    }
  });
}

/**
 * 해외 주식 현재가 조회 (Placeholder)
 */
export async function getOverseasStockQuote(): Promise<StockQuote> {
    throw new Error("Overseas stock REST not implemented in this phase");
}

/**
 * 국내 주식 거래량 순위 조회 (FHPST01710000)
 */
export async function getDomesticVolumeRank(belongClassCode: string = "0"): Promise<any[]> {
  return withDedupeAndCache(`volume_rank_${belongClassCode}`, 60000, async () => {
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_COND_SCR_DIV_CODE: "20171",
      FID_INPUT_ISCD: "0000",
      FID_DIV_CLS_CODE: "0",
      FID_BLNG_CLS_CODE: belongClassCode,
      FID_TRGT_EXCL_CO_YN: "N",
      FID_TRGT_CLS_CODE: "0",
      FID_VOL_CNT: "0",
      FID_INPUT_PRICE_1: "0",
      FID_INPUT_PRICE_2: "0",
    });

    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/volume-rank?${query.toString()}`, {
      method: "GET",
      trId: "FHPST01710000",
      useQuoteCreds: true
    });

    if (data.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    return (data.output as unknown as any[]) || [];
  });
}

/**
 * 국내 주식 주봉 조회 (FHKST03010100, W)
 */
export async function getDomesticStockWeekly(symbol: string): Promise<any[]> {
  return withDedupeAndCache(`weekly_${symbol}`, 60000, async () => {
    const d = new Date();
    // 120주 이평을 위해 약 3년(1100일) 치의 데이터 조회
    const d1 = new Date(d.getTime() - 1100 * 24 * 60 * 60 * 1000);
    const formatKSTDate = (date: Date) => {
        const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        return kst.toISOString().split('T')[0].replace(/-/g, '');
    };

    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
      FID_INPUT_DATE_1: formatKSTDate(d1),
      FID_INPUT_DATE_2: formatKSTDate(d),
      FID_PERIOD_DIV_CODE: "W",
      FID_ORG_ADJ_PRC: "0"
    });

    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${query.toString()}`, {
      method: "GET",
      trId: "FHKST03010100",
      useQuoteCreds: true
    });

    if (data.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    return (data.output2 as unknown as any[]) || [];
  });
}

/**
 * 국내 지수 기간별 시세 조회 (FHKUP03500100)
 *
 * KIS 지수 기간별시세는 단일 호출당 약 50봉만 반환하므로, 거시필터의 120일
 * 정배열(5>20>60>120) 판정을 위해 날짜 창을 과거로 옮겨가며 페이지네이션해
 * 120봉 이상을 확보한다. 결과는 KST 날짜를 캐시 키에 포함해 하루 단위로 캐시한다.
 *
 * 모든 페이지 호출은 callKisApi를 통해 단일 통합 큐(globalKisRequestQueue)를
 * 거치므로 추가 호출도 동일 큐에서 rate limit이 보호된다.
 */
export async function getDomesticIndexDaily(code: string): Promise<any[]> {
  const formatKSTDate = (d: Date) => {
    const kstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    return kstDate.toISOString().split('T')[0].replace(/-/g, '');
  };

  // 하루 단위 캐시: KST 날짜를 키에 포함해 매 거래일 1회만 신규 조회
  const kstToday = formatKSTDate(new Date());
  const cacheKey = `index_daily_${code}_${kstToday}`;
  const ONE_DAY_MS = 26 * 60 * 60 * 1000; // 다음 거래일 진입까지 안전 보존

  return withDedupeAndCache(cacheKey, ONE_DAY_MS, async () => {
    const TARGET = 130;     // 120 MA + 여유분
    const MAX_PAGES = 4;    // 약 50봉/페이지 × 4 = 최대 ~200봉
    const WINDOW_DAYS = 90; // 페이지당 약 90 캘린더일(≈ 60거래일) 요청
    const DATE_FIELD = "stck_bsop_date";

    const merged: any[] = [];
    const seen = new Set<string>();
    let endDate = new Date();

    for (let page = 0; page < MAX_PAGES && merged.length < TARGET; page++) {
      const startDate = new Date(endDate.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

      const query = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "U",
        FID_INPUT_ISCD: code,
        FID_INPUT_DATE_1: formatKSTDate(startDate),
        FID_INPUT_DATE_2: formatKSTDate(endDate),
        FID_PERIOD_DIV_CODE: "D",
      });

      const fetchPage = () => callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-index-price?${query.toString()}`, {
        method: "GET",
        trId: "FHKUP03500100",
        useQuoteCreds: true
      });

      const isRateLimitError = (msg: string) =>
        msg.includes("egw00201") || msg.includes("429") || msg.includes("건수") || msg.includes("초과") || msg.includes("limit");

      let data: KisRawResponse;
      try {
        data = await fetchPage();
      } catch (e) {
        const errMsg = String((e as Error).message || e).toLowerCase();
        // rate limit(EGW00201)으로 같은 초에 페이지 버스트가 막히면 1.2s 백오프 후 1회 재시도한다.
        // (route.ts 종목별 루프와 동일한 패턴) 큐는 그대로 사용하며 종목 기준은 변경하지 않는다.
        if (isRateLimitError(errMsg)) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          try {
            data = await fetchPage();
          } catch (retryErr) {
            // 재시도도 실패하면 Graceful Break: 그때까지 확보한 봉으로 진행.
            // 단 첫 페이지조차 못 받으면 데이터가 전혀 없으므로 에러를 전파한다.
            if (page === 0) throw retryErr;
            console.warn(`[Index Pagination] page ${page} failed after retry, using ${merged.length} bars:`, (retryErr as Error).message);
            break;
          }
        } else {
          if (page === 0) throw e;
          console.warn(`[Index Pagination] page ${page} failed, using ${merged.length} bars:`, (e as Error).message);
          break;
        }
      }

      if (data.rt_cd !== "0") {
        if (page === 0) throw new Error(`KIS API Error: ${data.msg1}`);
        break;
      }

      const rows = (data.output2 as unknown as any[]) || [];
      if (rows.length === 0) break;

      let oldest: string | null = null;
      let added = 0;
      for (const r of rows) {
        const dt = String(r[DATE_FIELD] || "");
        if (!dt) continue;
        if (!oldest || dt < oldest) oldest = dt;
        if (!seen.has(dt)) {
          seen.add(dt);
          merged.push(r);
          added++;
        }
      }
      if (added === 0 || !oldest) break; // 더 이상 진척 없음

      // 다음 창은 가장 오래된 일자 직전 영업일까지로 이동
      const od = new Date(Date.UTC(
        Number(oldest.slice(0, 4)),
        Number(oldest.slice(4, 6)) - 1,
        Number(oldest.slice(6, 8))
      ));
      endDate = new Date(od.getTime() - 24 * 60 * 60 * 1000);
    }

    // 최신순(인덱스 0 = 최신) 정렬 — calculateMA가 slice(0, period)로 최신부터 사용
    merged.sort((a, b) => String(b[DATE_FIELD]).localeCompare(String(a[DATE_FIELD])));
    return merged;
  });
}

/**
 * 국내 주식 현재가 상세 조회 (FHKST01010100) - 원본 output 데이터 반환
 */
export async function getDomesticStockDetail(symbol: string): Promise<any> {
  return withDedupeAndCache(`detail_${symbol}`, 15000, async () => {
    const query = new URLSearchParams({
      FID_COND_MRKT_DIV_CODE: "J",
      FID_INPUT_ISCD: symbol,
    });
    
    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-price?${query.toString()}`, {
      method: "GET",
      trId: "FHKST01010100",
      useQuoteCreds: true
    });

    if (data.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${data.msg1}`);
    }

    return data.output || data.output1 || {};
  });
}

