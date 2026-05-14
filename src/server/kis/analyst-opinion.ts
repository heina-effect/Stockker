import "server-only";
import { callKisApi } from "./auth";
import { withDedupeAndCache } from "./cache";
import { kisConfig } from "./config";
import type { AnalystOpinionItem, AnalystOpinionSummary } from "@/types/research";

export type { AnalystOpinionItem, AnalystOpinionSummary };

interface KisRawResponse {
  rt_cd: string;
  msg1: string;
  output?: Record<string, unknown>[] | Record<string, unknown>;
  output1?: Record<string, unknown>[] | Record<string, unknown>;
  output2?: Record<string, unknown>[] | Record<string, unknown>;
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
  const normalized = code.trim().toUpperCase();
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
  return map[normalized] || code || "—";
}

function asRows(raw: unknown): Record<string, unknown>[] {
  if (!raw) return [];
  return Array.isArray(raw) ? raw as Record<string, unknown>[] : [raw as Record<string, unknown>];
}

function pickString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }
  return "";
}

function normalizeOpinionRows(rows: Record<string, unknown>[], fallbackFirmName: string): AnalystOpinionItem[] {
  return rows
    .map(row => {
      const firmName = pickString(row, [
        "invt_opbysec_mbcr_name",
        "mbcr_name",
        "mbrc_name",
        "scrt_name",
        "firm_name",
      ]) || fallbackFirmName;

      return {
        firmName,
        opinion: mapOpinionCode(pickString(row, ["invt_opnn", "invt_opnion_cd", "opinion_cd"])),
        targetPrice: parsePrice(row.hts_goal_prc ?? row.invt_opbysec_trgt_prc ?? row.target_prc),
        date: parseDate(row.stck_bsop_date ?? row.invt_opbysec_anlys_dt ?? row.anlys_dt),
        prevOpinion: pickString(row, ["rgbf_invt_opnn", "bef_invt_opnion_cd"])
          ? mapOpinionCode(pickString(row, ["rgbf_invt_opnn", "bef_invt_opnion_cd"]))
          : undefined,
        prevTargetPrice: parsePrice(row.rgbf_hts_goal_prc ?? row.bef_invt_opbysec_trgt_prc) || undefined,
      };
    })
    .filter(item => item.targetPrice > 0 && item.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
}

/**
 * KIS Open API — 종목 투자의견 조회
 * - 국내주식 종목투자의견: invest-opinion / FHKST663300C0 / 화면 16633
 * - 국내주식 증권사별 투자의견: invest-opbysec / FHKST663400C0 / 화면 16634
 * 하루 1회 이상 갱신되므로 1시간 캐싱.
 */
export async function getStockAnalystOpinions(symbol: string): Promise<AnalystOpinionSummary> {
  return withDedupeAndCache(`analyst_opinion_v2_${symbol}`, 60 * 60 * 1000, async () => {
    try {
      const today = new Date();
      const kstDate = new Date(today.getTime() + 9 * 60 * 60 * 1000);
      const endDe = kstDate.toISOString().split("T")[0].replace(/-/g, "");
      const startDate = new Date(kstDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      const bgnDe = startDate.toISOString().split("T")[0].replace(/-/g, "");

      const baseParams = {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: symbol,
        FID_INPUT_DATE_1: bgnDe,
        FID_INPUT_DATE_2: endDe,
      };

      const opinionQuery = new URLSearchParams({
        ...baseParams,
        FID_COND_SCR_DIV_CODE: "16633",
      });

      const opBySecQuery = new URLSearchParams({
        ...baseParams,
        FID_COND_SCR_DIV_CODE: "16634",
        FID_DIV_CLS_CODE: "0",
      });

      const [opinionResult, opBySecResult] = await Promise.allSettled([
        callKisApi<KisRawResponse>(
          `/uapi/domestic-stock/v1/quotations/invest-opinion?${opinionQuery.toString()}`,
          { method: "GET", trId: "FHKST663300C0" }
        ),
        callKisApi<KisRawResponse>(
          `/uapi/domestic-stock/v1/quotations/invest-opbysec?${opBySecQuery.toString()}`,
          { method: "GET", trId: "FHKST663400C0" }
        ),
      ]);

      const rawRows: Record<string, unknown>[] = [];

      if (opinionResult.status === "fulfilled") {
        const data = opinionResult.value;
        if (data.rt_cd === "0") {
          rawRows.push(...asRows(data.output || data.output1 || data.output2));
        } else {
          console.debug(`[AnalystOpinion] invest-opinion rt_cd=${data.rt_cd} for ${symbol}: ${data.msg1}`);
        }
      }

      if (opBySecResult.status === "fulfilled") {
        const data = opBySecResult.value;
        if (data.rt_cd === "0") {
          rawRows.push(...asRows(data.output || data.output1 || data.output2));
        } else {
          console.debug(`[AnalystOpinion] invest-opbysec rt_cd=${data.rt_cd} for ${symbol}: ${data.msg1}`);
        }
      }

      if (!rawRows.length) return emptyResult();

      const items = normalizeOpinionRows(rawRows, "KIS 투자의견");

      const prices = items.map(i => i.targetPrice).filter(p => p > 0);
      const avgTargetPrice = prices.length
        ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length)
        : 0;

      return {
        items,
        avgTargetPrice,
        updatedAt: new Date().toISOString(),
        _meta: createMeta(),
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
  return { items: [], avgTargetPrice: 0, updatedAt: new Date().toISOString(), _meta: createMeta() };
}

function createMeta(): NonNullable<AnalystOpinionSummary["_meta"]> {
  return {
    source: "kis-openapi",
    kisMode: kisConfig.mode,
    endpointMode: kisConfig.mode,
    isMockData: false,
    note: kisConfig.mode === "mock"
      ? "모의투자 키/서버에서 호출했지만 Stockker mock 데이터가 아니라 KIS OpenAPI 응답입니다."
      : "실전 OpenAPI 정보성 엔드포인트 응답입니다.",
  };
}
