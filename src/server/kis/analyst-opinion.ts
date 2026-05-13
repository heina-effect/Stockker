import "server-only";
import { callKisApi } from "./auth";
import { withDedupeAndCache } from "./cache";
import type { AnalystOpinionItem, AnalystOpinionSummary } from "@/types/research";

export type { AnalystOpinionItem, AnalystOpinionSummary };

interface KisRawResponse {
  rt_cd: string;
  msg1: string;
  output?: Record<string, unknown>[];
  output1?: Record<string, unknown>[];
  output2?: Record<string, unknown>[];
}

function parsePrice(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseDate(raw: unknown): string {
  const s = String(raw || "");
  if (s.length === 8) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  return s;
}

function mapOpinionCode(code: string): string {
  const map: Record<string, string> = {
    "1": "강력매수",
    "2": "매수",
    "3": "중립",
    "4": "매도",
    "5": "강력매도",
    "BUY": "매수",
    "HOLD": "중립",
    "SELL": "매도",
    "OUTPERFORM": "시장상회",
    "NEUTRAL": "중립",
    "UNDERPERFORM": "시장하회",
  };
  return map[code] || code || "—";
}

/**
 * KIS Open API — 종목별 증권사 투자의견 조회
 * TR-ID: FHKST66430300
 * 하루 1회 이상 갱신되므로 1시간 캐싱.
 */
export async function getStockAnalystOpinions(symbol: string): Promise<AnalystOpinionSummary> {
  return withDedupeAndCache(`analyst_opinion_${symbol}`, 60 * 60 * 1000, async () => {
    try {
      const today = new Date();
      const kstDate = new Date(today.getTime() + 9 * 60 * 60 * 1000);
      const endDe = kstDate.toISOString().split("T")[0].replace(/-/g, "");
      const startDate = new Date(kstDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      const bgnDe = startDate.toISOString().split("T")[0].replace(/-/g, "");

      const query = new URLSearchParams({
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: bgnDe,
        FID_INPUT_DATE_2: endDe,
        FID_DIV_CLS_CODE: "0",
      });

      const data = await callKisApi<KisRawResponse>(
        `/uapi/domestic-stock/v1/quotations/invest-opbysec?${query.toString()}`,
        { method: "GET", trId: "FHKST66430300" }
      );

      if (data.rt_cd !== "0") {
        console.debug(`[AnalystOpinion] KIS rt_cd=${data.rt_cd} for ${symbol}: ${data.msg1}`);
        return emptyResult();
      }

      const rows = (data.output || data.output1 || []) as Record<string, unknown>[];
      if (!rows.length) return emptyResult();

      // 최신순 정렬 (날짜 기준)
      const items: AnalystOpinionItem[] = rows
        .map(row => ({
          firmName: String(row.invt_opbysec_mbcr_name || row.firm_name || ""),
          opinion: mapOpinionCode(String(row.invt_opnion_cd || row.opinion_cd || "")),
          targetPrice: parsePrice(row.invt_opbysec_trgt_prc || row.target_prc),
          date: parseDate(row.invt_opbysec_anlys_dt || row.anlys_dt),
          prevOpinion: row.bef_invt_opnion_cd
            ? mapOpinionCode(String(row.bef_invt_opnion_cd))
            : undefined,
          prevTargetPrice: parsePrice(row.bef_invt_opbysec_trgt_prc) || undefined,
        }))
        .filter(item => item.firmName && item.targetPrice > 0)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 10);

      const prices = items.map(i => i.targetPrice).filter(p => p > 0);
      const avgTargetPrice = prices.length
        ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
        : 0;

      return {
        items,
        avgTargetPrice,
        updatedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      const is404 = e?.message?.includes("404") || e?.status === 404;
      if (is404) {
        console.debug(`[AnalystOpinion] 404 for ${symbol} — endpoint not supported`);
      } else {
        console.warn(`[AnalystOpinion] Failed for ${symbol}:`, e?.message ?? e);
      }
      return emptyResult();
    }
  });
}

function emptyResult(): AnalystOpinionSummary {
  return { items: [], avgTargetPrice: 0, updatedAt: new Date().toISOString() };
}
