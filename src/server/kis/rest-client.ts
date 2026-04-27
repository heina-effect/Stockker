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
      trId: "FHKST01010100"
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
      trId: "FHKST01010200"
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
      trId: "FHKUP03500100" // 업종기간별시세
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
    const d1 = new Date(d.getTime() - 100 * 24 * 60 * 60 * 1000); // about 3 months
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
      trId: "FHKST03010100"
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
            trId: "FHKST03010200"
        });

        if (data.rt_cd !== "0") {
            throw new Error(`KIS API Error: ${data.msg1}`);
        }

        return data.output2 || [];
    });
}

/**
 * 국내 주식 뉴스 조회 (FHKST01012200)
 */
export async function getDomesticStockNews(symbol: string): Promise<any[]> {
  return withDedupeAndCache(`news_${symbol}`, 60000, async () => {
    const query = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
    });

    const data = await callKisApi<KisRawResponse>(`/uapi/domestic-stock/v1/quotations/inquire-content?${query.toString()}`, {
        method: "GET",
        trId: "FHKST01012200"
    });

    if (data.rt_cd !== "0") {
        console.warn(`[KIS News] Failed for ${symbol}: ${data.msg1}`);
        return [];
    }

    return (data as any).output || [];
  });
}

/**
 * 해외 주식 현재가 조회 (Placeholder)
 */
export async function getOverseasStockQuote(_symbol: string): Promise<StockQuote> {
    throw new Error("Overseas stock REST not implemented in this phase");
}
