import "server-only";
import { kisConfig } from "./config";
import { kisApprovalKeyResponseSchema } from "./schemas";

declare global {
  var __kis_approval_cache__: Map<string, { key: string; expiresAt: number }> | undefined;
}
const cache = globalThis.__kis_approval_cache__ ?? (globalThis.__kis_approval_cache__ = new Map());

/**
 * WebSocket 접속을 위한 Approval Key 발급 및 관리
 */
export async function getKisApprovalKey(forceRefresh = false): Promise<string> {
  const cacheKey = `approval:${kisConfig.mode}`;

  if (!forceRefresh) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.key;
    }
  }

  console.log(`[KIS] Fetching new WebSocket approval key for mode: ${kisConfig.mode}`);
  
  const response = await fetch(`${kisConfig.restBaseUrl}/oauth2/Approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: kisConfig.appKey,
      secretkey: kisConfig.appSecret,
    }),
  });

  const data: unknown = await response.json();
  const parsed = kisApprovalKeyResponseSchema.parse(data);

  const approvalKey = parsed.approval_key;
  const expiresAt = Date.now() + 12 * 60 * 60 * 1000;

  cache.set(cacheKey, { key: approvalKey, expiresAt });

  return approvalKey;
}

export function invalidateApprovalKey() {
  cache.clear();
}
