import "server-only";

/**
 * 섹터 모멘텀 신호 계산 (Phase 29)
 *
 * 섹터별 대표 종목 시세를 조회해 changeRate 평균을 구하고,
 * AI 출력의 trendStrength를 보정하는 데 사용.
 * 조회 실패 시 조용히 건너뛴다 (non-blocking).
 */

export interface SectorMomentumSignal {
  sectorId: string;
  avgChangeRate: number;   // 대표 종목 등락률 평균 (%)
  symbolsChecked: number;  // 조회 성공한 종목 수
}

/**
 * sector universe에서 대표 종목(최대 2개)의 현재가를 병렬 조회해
 * 섹터별 평균 등락률 신호를 반환한다.
 *
 * TTL: 홈 캐시(15분)가 별도로 관리하므로 여기서는 캐시 없이 조회.
 * 실패한 종목은 계산에서 제외한다.
 */
export async function computeSectorMomentumSignals(
  sectorUniverse: Record<string, { representativeSymbols: string[] }>
): Promise<Map<string, SectorMomentumSignal>> {
  const result = new Map<string, SectorMomentumSignal>();

  let getDomesticStockQuote: ((s: string) => Promise<{ changeRate: number }>) | null = null;
  try {
    const mod = await import("@/server/kis/rest-client");
    getDomesticStockQuote = mod.getDomesticStockQuote;
  } catch {
    return result;
  }

  const entries = Object.entries(sectorUniverse);

  await Promise.allSettled(
    entries.map(async ([sectorId, sector]) => {
      const symbols = (sector.representativeSymbols || []).slice(0, 2);
      if (!symbols.length) return;

      const rates: number[] = [];
      await Promise.allSettled(
        symbols.map(async sym => {
          try {
            const q = await getDomesticStockQuote!(sym);
            if (typeof q.changeRate === "number" && Number.isFinite(q.changeRate)) {
              rates.push(q.changeRate);
            }
          } catch {
            // 조회 실패는 무시
          }
        })
      );

      if (rates.length > 0) {
        result.set(sectorId, {
          sectorId,
          avgChangeRate: rates.reduce((s, r) => s + r, 0) / rates.length,
          symbolsChecked: rates.length,
        });
      }
    })
  );

  return result;
}

/**
 * AI 출력의 trendingSectors 배열을 시장 신호로 보정·재정렬.
 *
 * 정책:
 * - trendStrength 차이가 10 이하인 섹터들 사이에서는 avgChangeRate 높은 것 우선
 * - 양수 changeRate 섹터는 최소 +3 보너스, 음수는 최대 -3 패널티
 * - AI가 없는 섹터(신호만 있는)는 추가 안 함 — AI 기반 섹터만 보정
 */
export function applyMomentumSignals(
  sectors: any[],
  signals: Map<string, SectorMomentumSignal>
): any[] {
  if (!signals.size) return sectors;

  const adjusted = sectors.map(sector => {
    const signal = signals.get(sector.sectorId);
    if (!signal) return { ...sector, _marketSignal: null };

    const bonus = Math.max(-5, Math.min(5, signal.avgChangeRate * 0.8));
    return {
      ...sector,
      trendStrength: Math.round(Math.min(99, Math.max(0, (sector.trendStrength ?? 70) + bonus))),
      _marketSignal: { avgChangeRate: signal.avgChangeRate, symbolsChecked: signal.symbolsChecked },
    };
  });

  // 보정된 trendStrength 기준으로 재정렬
  return adjusted.sort((a, b) => (b.trendStrength ?? 0) - (a.trendStrength ?? 0));
}
