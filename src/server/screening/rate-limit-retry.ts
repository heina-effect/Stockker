import "server-only";

// EGW00201(초당 거래건수 초과) 등 rate limit 에러 감지 — screening 관련 라우트/헬퍼
// (overnight, backtest, backfill-trajectory, trajectory-update)가 공유하는 재시도 정책.
export function isRateLimitError(msg: string): boolean {
  const m = String(msg).toLowerCase();
  return m.includes("egw00201") || m.includes("429") || m.includes("건수") || m.includes("초과") || m.includes("limit");
}

// rate limit 시 backoff 후 1회 재시도 (전역 큐 + 재시도 이중 방어)
export async function withRateLimitRetry<T>(fn: () => Promise<T>, retries = 1, backoffMs = 1500): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = String((e as Error)?.message || e);
      if (attempt < retries && isRateLimitError(msg)) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}
