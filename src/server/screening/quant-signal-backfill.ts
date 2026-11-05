import "server-only";

import { isQuantSignal } from "@/server/screening/quant-signal";

export interface QuantBackfillItem {
  date: string;
  symbol: string;
  rsi14: number | string | null;
  quant_signal: boolean | null;
}

export interface QuantBackfillUpdate {
  date: string;
  symbol: string;
  rsi14: number | null;
  quantSignal: boolean;
}

export interface QuantBackfillPlan {
  totalTargets: number;
  updates: QuantBackfillUpdate[];
  skipped: number; // day0 행이 없어 쓰지 않는 행
  quantSignalChanged: number;
  falseToTrue: number;
  trueToFalse: number;
  rsi14Changed: number;
  rsi14ToNull: number; // 값이 있던 rsi14 가 NULL 로 지워지는 행
}

// 쓰기 전에 어떤 값이 어떻게 바뀌는지 계산한다. trajectory 키는 "symbol::YYYYMMDD".
export function planQuantSignalBackfill(
  items: QuantBackfillItem[],
  trajectory: Map<string, { rsi14: number | null; vol_ratio_20: number | null }>
): QuantBackfillPlan {
  const plan: QuantBackfillPlan = {
    totalTargets: items.length,
    updates: [],
    skipped: 0,
    quantSignalChanged: 0,
    falseToTrue: 0,
    trueToFalse: 0,
    rsi14Changed: 0,
    rsi14ToNull: 0,
  };
  for (const item of items) {
    const traj = trajectory.get(`${item.symbol}::${item.date}`);
    if (traj === undefined) {
      plan.skipped++;
      continue;
    }
    const rsi14 = traj.rsi14 == null ? null : Number(traj.rsi14);
    const volRatio20 = traj.vol_ratio_20 == null ? null : Number(traj.vol_ratio_20);
    const quantSignal = isQuantSignal(rsi14, volRatio20);
    plan.updates.push({ date: item.date, symbol: item.symbol, rsi14, quantSignal });

    const before = item.quant_signal === true;
    if (before !== quantSignal) {
      plan.quantSignalChanged++;
      if (quantSignal) plan.falseToTrue++;
      else plan.trueToFalse++;
    }
    const oldRsi = item.rsi14 == null ? null : Number(item.rsi14);
    if (oldRsi !== rsi14) {
      plan.rsi14Changed++;
      if (rsi14 === null) plan.rsi14ToNull++;
    }
  }
  return plan;
}

// 쓰기 허용 — apply 와 함께, 먼저 보고받은 대상 행 수를 그대로 돌려줘야 한다
export function isQuantBackfillConfirmed(
  body: { apply?: boolean; confirmTargetCount?: number },
  totalTargets: number
): boolean {
  return body.apply === true && body.confirmTargetCount === totalTargets;
}
