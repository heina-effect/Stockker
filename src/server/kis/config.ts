import "server-only";
import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* 공통 유틸                                                                   */
/* -------------------------------------------------------------------------- */

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional()
);

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional()
);

const booleanString = z.preprocess((val) => {
  if (typeof val === "string") {
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
  }
  return val;
}, z.boolean().default(false));

/* -------------------------------------------------------------------------- */
/* Canonical KIS Env Schema                                                    */
/* -------------------------------------------------------------------------- */

const kisEnvSchema = z.object({
  // Modes & Flags
  KIS_MODE: z.enum(["real", "mock"]).default("mock"),
  KIS_ENV: z.enum(["real", "mock"]).optional(), // Alias for KIS_MODE
  KIS_CUSTOMER_TYPE: z.enum(["P", "B"]).default("P"),
  KIS_ENABLE_REALTIME: booleanString,
  KIS_DEFAULT_SYMBOL: z.string().default("005930"),

  // Credentials (Common)
  KIS_APP_KEY: optionalString,
  KIS_APP_SECRET: optionalString,

  // Credentials (Prod)
  KIS_APP_KEY_PROD: optionalString,
  KIS_APP_SECRET_PROD: optionalString,
  my_app: optionalString, // Legacy Alias
  my_sec: optionalString, // Legacy Alias

  // Credentials (Mock)
  KIS_APP_KEY_MOCK: optionalString,
  KIS_APP_SECRET_MOCK: optionalString,
  paper_app: optionalString, // Legacy Alias
  paper_sec: optionalString, // Legacy Alias

  // Account Info
  KIS_HTS_ID: optionalString,
  my_htsid: optionalString, // Legacy Alias
  KIS_ACCOUNT_NO: optionalString,
  my_acct_stock: optionalString, // Legacy Alias
  my_paper_stock: optionalString, // Legacy Alias
  KIS_ACCOUNT_PRODUCT_CODE: z.string().default("01"),
  my_prod: optionalString, // Legacy Alias

  // Custom URLs
  KIS_REST_BASE_URL: optionalUrl,
  KIS_WS_BASE_URL: optionalString,
  KIS_REST_BASE_URL_PROD: optionalUrl,
  KIS_REST_BASE_URL_MOCK: optionalUrl,
  KIS_WS_BASE_URL_PROD: optionalString,
  KIS_WS_BASE_URL_MOCK: optionalString,

  // Internal
  KIS_TOKEN_ENCRYPTION_KEY: z.string().min(1, "KIS_TOKEN_ENCRYPTION_KEY is required"),
  KIS_REFRESH_BUFFER_MS: z.coerce.number().int().positive().default(60000), // 1 minutes to avoid excessive refresh
  KIS_CRON_REFRESH_THRESHOLD_MS: z.coerce.number().int().positive().default(21600000),
});

const infraEnvSchema = z.object({
  CRON_SECRET: optionalString,
  UPSTASH_REDIS_REST_URL: optionalUrl,
  UPSTASH_REDIS_REST_TOKEN: optionalString,
});

const aiEnvSchema = z.object({
  GEMINI_API_KEY: optionalString,
  GEMINI_FAST_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("gemini-3-flash")
  ),
  OPENAI_API_KEY: optionalString,
  OPENAI_REASONING_MODEL: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("gpt-5.4")
  ),
});

/* -------------------------------------------------------------------------- */
/* Resolution Logic                                                            */
/* -------------------------------------------------------------------------- */

const env = process.env;
const kisParsed = kisEnvSchema.parse(env);
const infraParsed = infraEnvSchema.parse(env);
const aiParsed = aiEnvSchema.parse(env);

// 1. Determine Mode
const mode = kisParsed.KIS_MODE || kisParsed.KIS_ENV || "mock";

// 2. Resolve Credentials based on Mode
let appKey = kisParsed.KIS_APP_KEY;
let appSecret = kisParsed.KIS_APP_SECRET;

if (mode === "real") {
    appKey = kisParsed.KIS_APP_KEY_PROD || kisParsed.my_app || appKey;
    appSecret = kisParsed.KIS_APP_SECRET_PROD || kisParsed.my_sec || appSecret;
} else {
    appKey = kisParsed.KIS_APP_KEY_MOCK || kisParsed.paper_app || appKey;
    appSecret = kisParsed.KIS_APP_SECRET_MOCK || kisParsed.paper_sec || appSecret;
}

// 3. Resolve Account Info
const htsId = kisParsed.KIS_HTS_ID || kisParsed.my_htsid;
const accountNo = kisParsed.KIS_ACCOUNT_NO || (mode === "real" ? kisParsed.my_acct_stock : kisParsed.my_paper_stock);
const accountProductCode = kisParsed.KIS_ACCOUNT_PRODUCT_CODE || kisParsed.my_prod || "01";

// 4. Resolve Base URLs
const defaultRestBaseUrl = mode === "real"
    ? "https://openapi.koreainvestment.com:9443"
    : "https://openapivts.koreainvestment.com:29443";

const defaultWsBaseUrl = mode === "real"
    ? "ws://ops.koreainvestment.com:21000"
    : "ws://ops.koreainvestment.com:31000";

const restBaseUrl = kisParsed.KIS_REST_BASE_URL || 
                    (mode === "real" ? kisParsed.KIS_REST_BASE_URL_PROD : kisParsed.KIS_REST_BASE_URL_MOCK) || 
                    defaultRestBaseUrl;

const wsBaseUrl = kisParsed.KIS_WS_BASE_URL || 
                  (mode === "real" ? kisParsed.KIS_WS_BASE_URL_PROD : kisParsed.KIS_WS_BASE_URL_MOCK) || 
                  defaultWsBaseUrl;

// 5. Warnings for Deprecated Aliases
const aliasWarnings: string[] = [];
if (kisParsed.KIS_ENV) aliasWarnings.push("KIS_ENV is deprecated, use KIS_MODE");
if (kisParsed.my_app || kisParsed.my_sec) aliasWarnings.push("my_app/my_sec are deprecated");
if (kisParsed.paper_app || kisParsed.paper_sec) aliasWarnings.push("paper_app/paper_sec are deprecated");

/* -------------------------------------------------------------------------- */
/* Final Config Object                                                         */
/* -------------------------------------------------------------------------- */

export const kisConfig = {
  mode,
  customerType: kisParsed.KIS_CUSTOMER_TYPE,
  enableRealtime: kisParsed.KIS_ENABLE_REALTIME,
  defaultSymbol: kisParsed.KIS_DEFAULT_SYMBOL,

  appKey,
  appSecret,
  htsId,
  accountNo,
  accountProductCode,

  restBaseUrl,
  wsBaseUrl,

  quote: {
    appKey: kisParsed.KIS_APP_KEY_PROD || kisParsed.my_app || appKey,
    appSecret: kisParsed.KIS_APP_SECRET_PROD || kisParsed.my_sec || appSecret,
    restBaseUrl: kisParsed.KIS_REST_BASE_URL_PROD || "https://openapi.koreainvestment.com:9443",
    configured: Boolean(kisParsed.KIS_APP_KEY_PROD && kisParsed.KIS_APP_SECRET_PROD)
  },

  tokenEncryptionKey: kisParsed.KIS_TOKEN_ENCRYPTION_KEY,
  refreshBufferMs: kisParsed.KIS_REFRESH_BUFFER_MS,
  cronRefreshThresholdMs: kisParsed.KIS_CRON_REFRESH_THRESHOLD_MS,

  cronSecret: infraParsed.CRON_SECRET,
  upstashUrl: infraParsed.UPSTASH_REDIS_REST_URL,
  upstashToken: infraParsed.UPSTASH_REDIS_REST_TOKEN,

  aliasWarnings,
} as const;

export const aiConfig = {
  geminiApiKey: aiParsed.GEMINI_API_KEY,
  geminiFastModel: aiParsed.GEMINI_FAST_MODEL,
  openaiApiKey: aiParsed.OPENAI_API_KEY,
  openaiReasoningModel: aiParsed.OPENAI_REASONING_MODEL,
} as const;

/**
 * Health check & document helper
 */
export const getKisConfig = () => {
    // Return a safe version without full secrets
    return {
        ...kisConfig,
        appKey: appKey ? `${appKey.slice(0, 4)}...` : null,
        appSecret: appSecret ? "set" : "not-set",
    };
};