import { NextResponse } from "next/server";
import { getDomesticIndexDaily } from "@/server/kis/rest-client";
import { createCacheScope, runInCacheScope } from "@/server/kis/cache";
import { withRateLimitRetry } from "@/server/screening/rate-limit-retry";

export const dynamic = "force-dynamic";

// 화면의 "지금 시장 상태"(2026-11-05). 저장 컬럼에 지수 상태가 없어, 화면을 열 때 코스닥·코스피 지수만 새로 받는다.
// 캐시를 우회한다. 캐시를 쓰면 15:40~15:41 에 연 화면의 지수가 post 캐시에 들어가 정기 실행이 재사용하고,
// 장중에는 구간 캐시의 오래된 값을 "지금"으로 보여 주게 된다.
// 대신 지수 하나에 일봉 페이지 호출이 여러 번이라 화면을 옮겨 다닐 때마다 나가지 않도록 성공 응답을 이 라우트 안에서 잠시 재사용한다.
const MEMO_TTL_MS = 60_000;

interface IndexState {
  value: number;
  maState: { ma5: number; ma20: number; ma60: number; ma120: number } | null;
}
interface MarketState {
  ok: true;
  kosdaqState: IndexState | null;
  kospiState: IndexState | null;
  fetchedAt: string;
}

let memo: { body: MarketState; expiresAt: number } | null = null;
let inFlight: Promise<MarketState | null> | null = null;

function movingAverage(candles: any[], period: number): number {
  const sum = candles.slice(0, period).reduce((acc, c) => acc + Number(c.bstp_nmix_prpr || 0), 0);
  return sum / period;
}

async function fetchIndexState(code: string): Promise<IndexState | null> {
  try {
    const candles = await withRateLimitRetry(() => getDomesticIndexDaily(code));
    const value = Number(candles?.[0]?.bstp_nmix_prpr || 0);
    if (!(value > 0)) return null;
    return {
      value,
      // 120봉 미만이면 null — 화면은 지수값만 그린다
      maState: candles.length >= 120
        ? { ma5: movingAverage(candles, 5), ma20: movingAverage(candles, 20), ma60: movingAverage(candles, 60), ma120: movingAverage(candles, 120) }
        : null,
    };
  } catch (e) {
    console.warn(`[Market State API] Index ${code} fetch failed:`, (e as Error)?.message || e);
    return null;
  }
}

async function fetchMarketState(): Promise<MarketState | null> {
  const [kosdaqState, kospiState] = await runInCacheScope(createCacheScope(true), () =>
    Promise.all([fetchIndexState("1001"), fetchIndexState("0001")])
  );
  if (!kosdaqState && !kospiState) return null;
  const body: MarketState = { ok: true, kosdaqState, kospiState, fetchedAt: new Date().toISOString() };
  if (kosdaqState && kospiState) memo = { body, expiresAt: Date.now() + MEMO_TTL_MS };
  return body;
}

export async function GET() {
  if (memo && memo.expiresAt > Date.now()) return NextResponse.json(memo.body);
  inFlight ??= fetchMarketState().finally(() => {
    inFlight = null;
  });
  const body = await inFlight;
  if (!body) return NextResponse.json({ ok: false, error: "market_state_failed" }, { status: 503 });
  return NextResponse.json(body);
}
