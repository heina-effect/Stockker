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

/* -------------------------------------------------------------------------- */
/* 기간별시세 페이지네이션 공통 헬퍼                                            */
/* -------------------------------------------------------------------------- */

const ONE_DAY_CACHE_MS = 26 * 60 * 60 * 1000; // 다음 거래일 진입까지 안전 보존

// KST YYYYMMDD 포맷
function formatKSTDate(d: Date): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0].replace(/-/g, "");
}

// KST 15:30(정규장 마감) 이후인지 — 장중 캐시된 미확정 종가가 마감 후까지 재사용되는 문제의
// 재발 방지 가드(Phase 42 10/8 실험으로 확인된 사실 기반). trajectory-update.ts의 동일 함수를
// 여기로 승격 — 동작은 한 글자도 바꾸지 않았다(KIS 호출 캐시 키 구성에도 재사용하기 위함).
export function isAfterKSTMarketClose(): boolean {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const h = kst.getUTCHours();
  const m = kst.getUTCMinutes();
  return h > 15 || (h === 15 && m >= 30);
}

// EGW00201(초당 거래건수 초과) 등 rate limit 에러 감지
function isPaginationRateLimit(msg: string): boolean {
  const m = String(msg).toLowerCase();
  return m.includes("egw00201") || m.includes("429") || m.includes("건수") || m.includes("초과") || m.includes("limit");
}

/**
 * KIS 기간별시세 페이지네이션 공통 헬퍼.
 *
 * KIS는 단일 호출당 반환 봉수에 상한(지수 ~50봉, 일/주봉 ~100봉)이 있어, 120봉
 * 정배열(5>20>60>120) 판정에 필요한 데이터를 한 번에 못 받는다. 날짜 창을 과거로
 * 옮겨가며 targetCount 이상 누적한다.
 *
 * - 모든 페이지 호출은 buildPageFetch(callKisApi) → 단일 통합 큐를 거치므로
 *   추가 호출도 동일 큐에서 rate limit이 보호된다(수동 setTimeout으로 큐 우회 안 함).
 * - 페이지가 EGW00201로 막히면 1.2s 백오프 후 1회 재시도, 그래도 실패 시 그때까지
 *   확보한 봉으로 Graceful Break(첫 페이지 실패만 에러 전파).
 * - dateField(stck_bsop_date) 기준 중복 제거 후 최신순(인덱스 0 = 최신) 정렬.
 * - 결과는 KST 날짜를 캐시 키에 포함해 하루 단위로 캐시(종목/지수당 1일 1회 신규 조회).
 */
async function fetchPaginatedCandles(opts: {
  cacheKey: string;
  targetCount: number;
  maxPages: number;
  windowDays: number;
  dateField: string;
  label: string;
  buildPageFetch: (date1: string, date2: string) => Promise<KisRawResponse>;
  // 기본은 "오늘"부터 과거로 페이지네이션. 과거 특정 날짜 주변 조회(백테스트 등)에는
  // anchorEndDate로 페이지네이션 시작점을 옮긴다.
  anchorEndDate?: Date;
  cacheTtlMs?: number;
}): Promise<any[]> {
  const { cacheKey, targetCount, maxPages, windowDays, dateField, label, buildPageFetch, anchorEndDate, cacheTtlMs } = opts;

  return withDedupeAndCache(cacheKey, cacheTtlMs ?? ONE_DAY_CACHE_MS, async () => {
    const merged: any[] = [];
    const seen = new Set<string>();
    let endDate = anchorEndDate ?? new Date();

    for (let page = 0; page < maxPages && merged.length < targetCount; page++) {
      const startDate = new Date(endDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
      const fetchPage = () => buildPageFetch(formatKSTDate(startDate), formatKSTDate(endDate));

      let data: KisRawResponse;
      try {
        data = await fetchPage();
      } catch (e) {
        if (isPaginationRateLimit(String((e as Error).message || e))) {
          await new Promise(resolve => setTimeout(resolve, 1200));
          try {
            data = await fetchPage();
          } catch (retryErr) {
            if (page === 0) throw retryErr;
            console.warn(`[${label} Pagination] page ${page} failed after retry, using ${merged.length} bars:`, (retryErr as Error).message);
            break;
          }
        } else {
          if (page === 0) throw e;
          console.warn(`[${label} Pagination] page ${page} failed, using ${merged.length} bars:`, (e as Error).message);
          break;
        }
      }

      if (data.rt_cd !== "0") {
        if (page === 0) throw new Error(`KIS API Error: ${data.msg1}`);
        break;
      }

      const rows = ((data.output2 || data.output) as unknown as any[]) || [];
      if (rows.length === 0) break;

      let oldest: string | null = null;
      let added = 0;
      for (const r of rows) {
        const dt = String(r[dateField] || "");
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
    merged.sort((a, b) => String(b[dateField]).localeCompare(String(a[dateField])));
    return merged;
  });
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
 * 국내 주식 일봉 조회 (FHKST03010100, D)
 *
 * KIS는 단일 호출당 약 100봉만 반환하므로 120일 MA 정배열 판정을 위해
 * 날짜 창을 과거로 옮겨가며 페이지네이션해 120봉 이상을 확보한다.
 * 결과는 하루 단위 캐시(종목당 1일 1회 신규 조회).
 */
export async function getDomesticStockDaily(symbol: string): Promise<any> {
  return fetchPaginatedCandles({
    // 날짜만 키로 쓰면 마감 전(장중 미확정 종가) 캐시가 마감 후 재호출까지 26시간 그대로
    // 재사용돼, 마감 후 재실행해도 종가가 안 갱신되는 문제가 있었다(Phase 42 10/19 사례:
    // 삼성SDI 11:15 KST 조회값이 15:46 KST 재실행에도 그대로 남음). pre/post 구간을 키에
    // 포함해, 마감 후 첫 호출은 반드시 새로 조회하도록 한다.
    cacheKey: `daily_${symbol}_${formatKSTDate(new Date())}_${isAfterKSTMarketClose() ? "post" : "pre"}`,
    targetCount: 130,   // 120 MA + 여유분
    maxPages: 3,        // ~100봉/페이지 → 2페이지로 130봉 확보
    windowDays: 150,    // 페이지당 약 150 캘린더일(≈ 100거래일) 요청
    dateField: "stck_bsop_date",
    label: "Daily",
    buildPageFetch: (date1, date2) => callKisApi<KisRawResponse>(
      `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: date1,
        FID_INPUT_DATE_2: date2,
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "0", // 0: 수정주가
      }).toString()}`,
      { method: "GET", trId: "FHKST03010100", useQuoteCreds: true }
    ),
  });
}

/**
 * 국내 주식 일봉 조회 — 과거 특정 날짜 주변 조회용 (백테스트/소급 시드 전용).
 *
 * getDomesticStockDaily는 "오늘"부터 과거로 페이지네이션하므로 최근 ~6개월치만
 * 확보된다. 백테스트는 1년 이상 지난 날짜도 조회해야 하므로, anchorDate(보통
 * entryDate + 2주)를 페이지네이션 시작점으로 삼아 entryDate의 종가와 그 다음
 * 거래일의 시가/저가를 모두 포함하는 창을 확보한다. 과거 데이터는 변하지 않으므로
 * 장기 캐시(30일)를 사용한다.
 */
export async function getDomesticStockDailyAround(symbol: string, anchorDateYYYYMMDD: string): Promise<any[]> {
  const y = Number(anchorDateYYYYMMDD.slice(0, 4));
  const m = Number(anchorDateYYYYMMDD.slice(4, 6)) - 1;
  const d = Number(anchorDateYYYYMMDD.slice(6, 8));
  // 다음 거래일(주말/공휴일 포함 최대 ~10일 휴장 가정) 확보를 위해 2주 뒤로 앵커를 잡되,
  // KIS에 미래 날짜를 end_date로 넘기면 날짜 태깅이 잘못된 봉을 반환하는 버그가 있으므로
  // anchor를 오늘 자정(KST)으로 cap한다.
  const now = new Date();
  const futureAnchor = new Date(Date.UTC(y, m, d + 14));
  const anchor = futureAnchor < now ? futureAnchor : now;

  // anchorDate + 14가 오늘보다 미래이면(= 최근 날짜 조회) 일 단위 캐시 갱신.
  // 이미 충분히 과거이면 해당 창의 데이터는 불변이므로 30일 장기 캐시.
  // near-current 쪽은 "오늘" 몫이 마감 전후로 값이 바뀌는 데이터라, 날짜 키에 마감 전후
  // 구분(pre/post)을 더해 마감 후 재조회가 장중 캐시를 재사용하지 않도록 한다(getDomesticStockDaily와
  // 동일 이유). 과거 전용(30일 장기 캐시) 쪽은 그대로 둔다 — 고정된 과거 값이라 필요 없음.
  const isNearCurrent = futureAnchor > now;
  const cacheKey = isNearCurrent
    ? `daily_around_v2_${symbol}_${anchorDateYYYYMMDD}_${formatKSTDate(now)}_${isAfterKSTMarketClose() ? "post" : "pre"}`
    : `daily_around_v2_${symbol}_${anchorDateYYYYMMDD}`;
  const cacheTtlMs = isNearCurrent ? ONE_DAY_CACHE_MS : 30 * 24 * 60 * 60 * 1000;

  return fetchPaginatedCandles({
    cacheKey,
    targetCount: 150,
    maxPages: 4,
    windowDays: 150,
    dateField: "stck_bsop_date",
    label: "DailyAround",
    anchorEndDate: anchor,
    cacheTtlMs,
    buildPageFetch: (date1, date2) => callKisApi<KisRawResponse>(
      `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: date1,
        FID_INPUT_DATE_2: date2,
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "1", // 비수정주가 — 실제 거래가(백테스트 entryClose/nextOpen 정확도용)
      }).toString()}`,
      { method: "GET", trId: "FHKST03010100", useQuoteCreds: true }
    ),
  });
}

/**
 * 국내 주식 특정 일자 단일 원주가(수정주가 미반영) 조회.
 * KIS 버그(기간 조회 시 강제 수정주가 반환) 우회를 위해,
 * 단일 날짜(date1 == date2)로 조회하여 HTS 기준 실거래가를 가져온다.
 */
export async function getDomesticStockDailyRawPrice(symbol: string, dateYYYYMMDD: string): Promise<any> {
  // 조회 대상이 "오늘"이면(백테스트가 당일 발굴 건의 다음거래일=오늘 가격을 조회하는 경우)
  // 마감 전후로 값이 바뀌므로 구분을 더한다. 과거 날짜는 고정값이라 그대로 둔다(30일 캐시 유지).
  const isToday = dateYYYYMMDD === formatKSTDate(new Date());
  const cacheKey = `raw_price_${symbol}_${dateYYYYMMDD}${isToday ? `_${isAfterKSTMarketClose() ? "post" : "pre"}` : ""}`;
  return withDedupeAndCache(cacheKey, 30 * 24 * 60 * 60 * 1000, async () => {
    const res = await callKisApi<KisRawResponse>(
      `/uapi/domestic-stock/v1/quotations/inquire-daily-price?${new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: dateYYYYMMDD,
        FID_INPUT_DATE_2: dateYYYYMMDD,
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "1", // 수정주가 미반영
      }).toString()}`,
      { method: "GET", trId: "FHKST01010400", useQuoteCreds: true }
    );
    
    if (res.rt_cd !== "0") {
      throw new Error(`KIS API Error: ${res.msg1}`);
    }
    
    const rows = ((res.output2 || res.output) as unknown as any[]) || [];
    const target = rows.find(r => r.stck_bsop_date === dateYYYYMMDD);
    if (!target) {
      throw new Error(`Raw price not found for ${symbol} on ${dateYYYYMMDD}`);
    }
    return target;
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
 *
 * 120주 정배열 판정에는 약 2.5년치(120주)가 필요하나 단일 호출은 ~100주만
 * 반환하므로 날짜 창을 과거로 옮겨가며 페이지네이션한다. 하루 단위 캐시.
 */
export async function getDomesticStockWeekly(symbol: string): Promise<any[]> {
  return fetchPaginatedCandles({
    // 진행 중인 이번 주 봉의 종가는 장중/마감 후 값이 바뀌므로(daily와 동일 이유) 마감 전후
    // 구분을 키에 더한다.
    cacheKey: `weekly_${symbol}_${formatKSTDate(new Date())}_${isAfterKSTMarketClose() ? "post" : "pre"}`,
    targetCount: 130,   // 120주 MA + 여유분
    maxPages: 3,        // ~100주/페이지 → 2페이지로 130주(약 2.5년) 확보
    windowDays: 760,    // 페이지당 약 760 캘린더일(≈ 108주) 요청
    dateField: "stck_bsop_date",
    label: "Weekly",
    buildPageFetch: (date1, date2) => callKisApi<KisRawResponse>(
      `/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: date1,
        FID_INPUT_DATE_2: date2,
        FID_PERIOD_DIV_CODE: "W",
        FID_ORG_ADJ_PRC: "0",
      }).toString()}`,
      { method: "GET", trId: "FHKST03010100", useQuoteCreds: true }
    ),
  });
}

// YYYYMMDD → UTC 자정 Date (rest-client 내부 전용)
function parseYYYYMMDDToUTCDate(dateStr: string): Date {
  return new Date(Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(4, 6)) - 1,
    Number(dateStr.slice(6, 8))
  ));
}

/**
 * 국내 지수 기간별 시세 조회 (FHKUP03500100)
 *
 * KIS 지수 기간별시세는 단일 호출당 약 50봉만 반환하므로, 거시필터의 120일
 * 정배열(5>20>60>120) 판정을 위해 페이지네이션해 120봉 이상을 확보한다.
 * (일/주봉과 동일한 fetchPaginatedCandles 공통 헬퍼 사용, 하루 단위 캐시)
 *
 * opts는 거래일 캘린더(trading-calendar.ts) 용도로 추가됐다 — anchorDate로 특정 날짜 기준
 * 과거 조회를(기본은 "오늘" 기준), targetCount/maxPages로 조회량을 조절할 수 있다. 기존
 * 호출부(거시필터)는 opts 없이 그대로 호출하므로 기본값(130/4)에 영향이 없다.
 */
export async function getDomesticIndexDaily(
  code: string,
  opts: { anchorDate?: string; targetCount?: number; maxPages?: number } = {}
): Promise<any[]> {
  const { anchorDate, targetCount = 130, maxPages = 4 } = opts;
  const anchorEndDate = anchorDate ? parseYYYYMMDDToUTCDate(anchorDate) : undefined;
  const resolvedDateKey = anchorDate ?? formatKSTDate(new Date());
  // 조회 기준일이 "오늘"이면(거시필터의 묵시적 anchorDate 미지정 호출, 또는 캘린더 갱신의
  // 명시적 anchorDate=오늘 호출) 그날 종가가 마감 전후로 바뀌므로 키에 구분을 더한다.
  // anchorDate가 과거 날짜로 명시된 소급 조회는 고정값이라 영향 없음(그대로 유지).
  const isToday = resolvedDateKey === formatKSTDate(new Date());
  const cacheKey = `index_daily_${code}_${resolvedDateKey}_${targetCount}_${maxPages}${isToday ? `_${isAfterKSTMarketClose() ? "post" : "pre"}` : ""}`;
  return fetchPaginatedCandles({
    cacheKey,
    targetCount,   // 120 MA + 여유분(기본값)
    maxPages,      // ~50봉/페이지(기본 4 = 최대 ~200봉)
    windowDays: 90,     // 페이지당 약 90 캘린더일(≈ 60거래일) 요청
    dateField: "stck_bsop_date",
    label: "Index",
    anchorEndDate,
    buildPageFetch: (date1, date2) => callKisApi<KisRawResponse>(
      `/uapi/domestic-stock/v1/quotations/inquire-index-price?${new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "U",
        FID_INPUT_ISCD: code,
        FID_INPUT_DATE_1: date1,
        FID_INPUT_DATE_2: date2,
        FID_PERIOD_DIV_CODE: "D",
      }).toString()}`,
      { method: "GET", trId: "FHKUP03500100", useQuoteCreds: true }
    ),
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

