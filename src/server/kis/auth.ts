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
/* Core Logic                                                                  */
/* -------------------------------------------------------------------------- */

const TOKEN_KEY = `stockker:kis:token:${kisConfig.mode}`;

let refreshPromise: Promise<string> | null = null;

export async function getKisAccessToken(forceRefresh = false): Promise<string> {
  if (!kisConfig.appKey || !kisConfig.appSecret) {
    throw new Error("KIS Credentials are not configured");
  }

  if (!forceRefresh) {
    const cached = await fetchCachedToken();
    if (cached && isTokenValid(cached)) {
      return cached.accessToken;
    }
  }

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      console.log(`[KIS] Fetching new access token for mode: ${kisConfig.mode}`);
      const response = await fetch(`${kisConfig.restBaseUrl}/oauth2/tokenP`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "client_credentials",
          appkey: kisConfig.appKey,
          appsecret: kisConfig.appSecret,
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

      await saveTokenToCache(newToken);
      return newToken.accessToken;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchCachedToken(): Promise<StoredToken | null> {
  try {
    const redis = getRedis();
    let raw: string | null = null;
    if (redis) {
      raw = await redis.get(TOKEN_KEY);
    } else {
      raw = memoryCache.get(TOKEN_KEY) || null;
    }

    if (!raw) {
      const fallbackPath = path.join(os.tmpdir(), "kis_token_cache.json");
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

async function saveTokenToCache(token: StoredToken) {
  try {
    const encrypted = encrypt(JSON.stringify(token));
    const redis = getRedis();
    if (redis) {
      const ttl = Math.floor((new Date(token.expiresAt).getTime() - Date.now()) / 1000);
      if (ttl > 0) {
        await redis.set(TOKEN_KEY, encrypted, { ex: ttl });
      }
    } else {
      memoryCache.set(TOKEN_KEY, encrypted);
      const fallbackPath = path.join(os.tmpdir(), "kis_token_cache.json");
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

export async function callKisApi<T = unknown>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    headers?: Record<string, string>;
    trId?: string;
  } = {}
) {
  const token = await getKisAccessToken();
  const { method = "GET", body, headers = {}, trId } = options;

  const url = `${kisConfig.restBaseUrl}${endpoint}`;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    appkey: kisConfig.appKey!,
    appsecret: kisConfig.appSecret!,
    tr_id: trId || (method === "GET" ? "FHKST01010100" : ""),
    ...headers,
  };

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
}