import "server-only";

import { Redis } from "@upstash/redis";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { kisConfig } from "./config";
import { kisOauthTokenResponseSchema } from "./schemas";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
/* -------------------------------------------------------------------------- */
/* Types & Globals                                                             */
/* -------------------------------------------------------------------------- */

type StoredToken = {
  accessToken: string;
  expiresAt: string;
  issuedAt: string;
};

declare global {
  var __kis_token_cache__: Map<string, string> | undefined;
}
const memoryCache = globalThis.__kis_token_cache__ ?? (globalThis.__kis_token_cache__ = new Map());

let redisInstance: Redis | null = null;

function getRedis() {
  if (!kisConfig.upstashUrl || !kisConfig.upstashToken) return null;
  if (!redisInstance) {
    redisInstance = new Redis({
      url: kisConfig.upstashUrl,
      token: kisConfig.upstashToken,
    });
  }
  return redisInstance;
}

/* -------------------------------------------------------------------------- */
/* Crypto Helpers                                                              */
/* -------------------------------------------------------------------------- */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey() {
  const key = Buffer.from(kisConfig.tokenEncryptionKey, "utf8");
  if (key.length !== 32) {
    return Buffer.alloc(32, kisConfig.tokenEncryptionKey);
  }
  return key;
}

function encrypt(text: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    data: encrypted.toString("base64"),
  });
}

function decrypt(cipherText: string): string {
  const { iv, authTag, data } = JSON.parse(cipherText);
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/* -------------------------------------------------------------------------- */
/* Core Logic & Credentials                                                    */
/* -------------------------------------------------------------------------- */

export interface KisCreds {
  appKey: string;
  appSecret: string;
  restBaseUrl: string;
  cacheKey: string;
}

export function resolveCreds(useQuote?: boolean): KisCreds {
  if (useQuote) {
    if (!kisConfig.quote.configured) {
      throw new Error("시세 조회에는 실전 앱키(KIS_APP_KEY_PROD)가 필요합니다");
    }
    return {
      appKey: kisConfig.quote.appKey!,
      appSecret: kisConfig.quote.appSecret!,
      restBaseUrl: kisConfig.quote.restBaseUrl,
      cacheKey: "quote"
    };
  }
  return {
    appKey: kisConfig.appKey!,
    appSecret: kisConfig.appSecret!,
    restBaseUrl: kisConfig.restBaseUrl,
    cacheKey: kisConfig.mode
  };
}

const refreshPromises = new Map<string, Promise<string>>();

export async function getKisAccessToken(forceRefresh = false, creds?: KisCreds): Promise<string> {
  const resolvedCreds = creds || resolveCreds(false);
  const tokenKey = `stockker:kis:token:${resolvedCreds.cacheKey}`;

  if (!resolvedCreds.appKey || !resolvedCreds.appSecret) {
    throw new Error(`KIS Credentials for ${resolvedCreds.cacheKey} are not configured`);
  }

  if (!forceRefresh) {
    const cached = await fetchCachedToken(tokenKey);
    if (cached && isTokenValid(cached)) {
      return cached.accessToken;
    }
  }

  let refreshPromise = refreshPromises.get(resolvedCreds.cacheKey);
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      console.log(`[KIS] Fetching new access token for cacheKey: ${resolvedCreds.cacheKey}`);
      const response = await fetch(`${resolvedCreds.restBaseUrl}/oauth2/tokenP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: resolvedCreds.appKey,
          appsecret: resolvedCreds.appSecret,
        }),
      });

      const data: unknown = await response.json();
      
      if (!response.ok) {
        throw new Error(`Token request failed: ${response.status} ${JSON.stringify(data)}`);
      }

      const parsed = kisOauthTokenResponseSchema.parse(data);

      const expires_in = Number(parsed.expires_in) || 7200;
      const expiresAt = new Date(Date.now() + (expires_in - 60) * 1000).toISOString();

      const newToken: StoredToken = {
        accessToken: parsed.access_token,
        expiresAt,
        issuedAt: new Date().toISOString(),
      };

      await saveTokenToCache(tokenKey, newToken);
      return newToken.accessToken;
    } finally {
      refreshPromises.delete(resolvedCreds.cacheKey);
    }
  })();

  refreshPromises.set(resolvedCreds.cacheKey, refreshPromise);
  return refreshPromise;
}

async function fetchCachedToken(tokenKey: string): Promise<StoredToken | null> {
  try {
    const redis = getRedis();
    let raw: string | null = null;
    if (redis) {
      raw = await redis.get(tokenKey);
    } else {
      raw = memoryCache.get(tokenKey) || null;
    }

    if (!raw) {
      const cacheKeyFromTokenKey = tokenKey.split(":").pop() || "mock";
      const fallbackPath = path.join(os.tmpdir(), `kis_token_cache_${cacheKeyFromTokenKey}.json`);
      if (fs.existsSync(fallbackPath)) {
        try {
          raw = fs.readFileSync(fallbackPath, "utf-8");
        } catch {
          // ignore error
        }
      }
    }

    if (!raw) return null;
    const decrypted = decrypt(raw);
    return JSON.parse(decrypted);
  } catch (e) {
    console.error("[KIS] Token cache fetch error:", e);
    return null;
  }
}

async function saveTokenToCache(tokenKey: string, token: StoredToken) {
  try {
    const encrypted = encrypt(JSON.stringify(token));
    const redis = getRedis();
    if (redis) {
      const ttl = Math.floor((new Date(token.expiresAt).getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await redis.set(tokenKey, encrypted, { ex: ttl });
      }
    } else {
      memoryCache.set(tokenKey, encrypted);
      const cacheKeyFromTokenKey = tokenKey.split(":").pop() || "mock";
      const fallbackPath = path.join(os.tmpdir(), `kis_token_cache_${cacheKeyFromTokenKey}.json`);
      try {
        fs.writeFileSync(fallbackPath, encrypted, "utf-8");
      } catch {
        // ignore error
      }
    }
  } catch (e) {
    console.error("[KIS] Token cache save error:", e);

  }
}

function isTokenValid(token: StoredToken): boolean {
  const expiry = new Date(token.expiresAt).getTime();
  return expiry > Date.now() + kisConfig.refreshBufferMs;
}

// 글로벌 KIS API 요청 큐 및 인터벌 제어
class KisRequestQueue {
  private queue: (() => Promise<any>)[] = [];
  private isProcessing = false;
  private lastRequestTime = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs = 510) {
    this.minIntervalMs = minIntervalMs;
  }

  public async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const res = await fn();
          resolve(res);
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const fn = this.queue.shift();
      if (fn) {
        const now = Date.now();
        const elapsed = now - this.lastRequestTime;
        const waitTime = this.minIntervalMs - elapsed;
        
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
        await fn();
      }
    }

    this.isProcessing = false;
  }
}

declare global {
  var __kis_request_queue__: KisRequestQueue | undefined;
  var __kis_request_queue_quote__: KisRequestQueue | undefined;
}
// 주문 큐: 모의투자 TPS 2 제한 대응 (510ms, 초당 최대 1.9회)
const globalKisRequestQueue = globalThis.__kis_request_queue__ ?? (globalThis.__kis_request_queue__ = new KisRequestQueue(510));
// 실전 시세 전용 큐: 실전 도메인 TPS 20 기준, 200ms 간격으로 여유 있게 제어 (초당 최대 5회)
const globalKisQuoteQueue = globalThis.__kis_request_queue_quote__ ?? (globalThis.__kis_request_queue_quote__ = new KisRequestQueue(200));

export async function callKisApi<T = unknown>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    trId?: string;
    useQuoteCreds?: boolean;
  } = {}
) {
  const { method = "GET", body, headers = {}, trId, useQuoteCreds } = options;
  const creds = resolveCreds(useQuoteCreds);
  const token = await getKisAccessToken(false, creds);

  const url = `${creds.restBaseUrl}${endpoint}`;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    appkey: creds.appKey,
    appsecret: creds.appSecret,
    tr_id: trId || (method === "GET" ? "FHKST01010100" : ""),
    ...headers,
  };

  if (typeof window === "undefined" && process.env.NODE_ENV === "development") {
    console.log(`[KIS API debug] Calling endpoint: ${endpoint} | Domain: ${creds.restBaseUrl} | cacheKey: ${creds.cacheKey}`);
  }

  // 실전 시세(quote)는 전용 큐, 그 외(주문 등)는 일반 큐로 분리하여 상호 rate limit 간섭 방지
  const queue = useQuoteCreds ? globalKisQuoteQueue : globalKisRequestQueue;
  return queue.enqueue(async () => {
    const response = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(`KIS API Error: ${response.status} ${JSON.stringify(errData)}`);
    }

    return await response.json() as T;
  });
}