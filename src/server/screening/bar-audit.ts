import "server-only";

import { getKSTPersistWindow } from "@/server/kis/rest-client";

// 저장된 일봉 행 ↔ KIS 확정 일봉 대조 판정(2026-11-03). 전수 대조·교정 도구는 이 판정 하나를 쓴다.
// 확정 일봉은 종가가 15:30(정규장), 거래량이 20시대 일괄 갱신 뒤(애프터마켓 포함)에 따로 굳는다. 저장 허용 구간
// (15:30~16:00)에 거래일 당일 저장한 행은 거래량이 정규장분만이라 확정값보다 작은 것이 정상이다 —
// 불일치로 세지 않는다(docs/release/known-issues.md "확정 일봉의 두 단계 확정 구조").
export type StoredBarVerdict =
  | "match"
  | "price_mismatch" // 시가·고가·저가·종가 중 하나라도 다름
  | "regular_session_volume" // 가격 일치, 당일 저장 허용 구간 저장분이라 거래량이 정규장 기준(정상)
  | "volume_mismatch"; // 가격 일치, 거래량이 위 정상 경우로 설명되지 않음

export type Bar = { open: number | string; high: number | string; low: number | string; close: number | string; volume: number | string };

const kstDateKey = (d: Date) => new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10).replace(/-/g, "");

// 거래일 당일, 저장 허용 구간 안에 저장된 행인지
export function isSameDayPersistWindowSave(createdAt: string, tradeDate: string): boolean {
  const at = new Date(createdAt);
  return kstDateKey(at) === tradeDate && getKSTPersistWindow(at).allowed;
}

export type StoredBar = Bar & { created_at: string; trade_date: string };

export function classifyStoredBar(stored: StoredBar, kis: Bar): StoredBarVerdict {
  const priceDiffers = (["open", "high", "low", "close"] as const).some((k) => Number(stored[k]) !== Number(kis[k]));
  if (priceDiffers) return "price_mismatch";
  const sv = Number(stored.volume), kv = Number(kis.volume);
  if (sv === kv) return "match";
  if (sv < kv && isSameDayPersistWindowSave(stored.created_at, stored.trade_date)) return "regular_session_volume";
  return "volume_mismatch";
}
