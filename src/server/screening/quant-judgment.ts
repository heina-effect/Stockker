import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/client";

// 판정 기록(2026-11-06). 저장 창의 첫 판정을 quant_signal_judgments 에 한 번만 남긴다.
// 나중에 바뀌는 overnight_screening_items 와 달리 이 표는 트리거로 UPDATE·DELETE 를 막는다.
export const QUANT_CRITERIA_VERSION = "rsi50-60_vol200-400_wilder";

interface JudgedStock {
  symbol: string;
  // 조회 실패로 제외된 종목은 지표가 없어 판정하지 않은 것이다
  metrics?: {
    rsi14?: number | null;
    quantSignal?: boolean;
    latestIndicator?: { volRatio20?: number | null } | null;
    day0Close?: number;
    currentVolume?: number;
  };
}

export interface QuantJudgmentRow {
  date: string;
  symbol: string;
  judged_at: string;
  rsi14: number | null;
  vol_ratio_20: number | null;
  volume_basis: "incl_today";
  close_at_judgment: number | null;
  volume_at_judgment: number | null;
  quant_signal: boolean;
  criteria_version: string;
  source: "live";
}

// excludedNotice 는 판정 지표를 계산하지 않아 호출자가 넘기지 않는다
export function buildQuantJudgmentRows(date: string, judgedAt: string, stocks: JudgedStock[]): QuantJudgmentRow[] {
  return stocks.flatMap(({ symbol, metrics }) =>
    metrics
      ? [{
          date,
          symbol,
          judged_at: judgedAt,
          rsi14: metrics.rsi14 ?? null,
          vol_ratio_20: metrics.latestIndicator?.volRatio20 ?? null,
          volume_basis: "incl_today" as const,
          close_at_judgment: metrics.day0Close ?? null,
          volume_at_judgment: metrics.currentVolume ?? null,
          quant_signal: metrics.quantSignal === true,
          criteria_version: QUANT_CRITERIA_VERSION,
          source: "live" as const,
        }]
      : []
  );
}

// 호출 시점은 스크리닝 저장이 성공한 뒤다. 이미 있는 (date, symbol) 은 건드리지 않아 첫 기록이 남는다.
// 기록 실패는 스크리닝 응답을 막지 않는다. 소급해서 채우지 않으므로 그날 판정은 비고, 로그로만 드러난다.
export async function recordQuantJudgments(rows: QuantJudgmentRow[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase || rows.length === 0) return;
  try {
    const { error } = await supabase
      .from("quant_signal_judgments")
      .upsert(rows, { onConflict: "date,symbol", ignoreDuplicates: true });
    if (error) throw error;
    console.log(`[Quant Judgment] ${rows.length}건 기록 시도 완료 (date=${rows[0].date}, 있던 건은 유지)`);
  } catch (e) {
    console.error("[Quant Judgment] Record failed:", (e as Error)?.message || e);
  }
}
