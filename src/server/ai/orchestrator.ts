/**
 * AI Orchestrator — Phase 18: Gemini-Only, Multi-Model Routing
 *
 * Runtime model policy (Gemini-only):
 *   - gemini-2.5-flash-lite : Stage 1 preprocessing (filtering, grounding checks, classification)
 *   - gemini-2.5-flash      : Stage 2 final generation (sentiment score, summaries, home intelligence)
 *
 * GPT/OpenAI runtime path is PAUSED in this phase.
 * Claude Sonnet 4.6 is only the implementation agent (not a runtime model).
 */

import { GoogleGenAI } from "@google/genai";
import type { IssueCluster, SourceItem, SentimentScore, StockReportSummary } from "@/types/research";
import { getServerStockName } from "@/lib/stocks/search-master";
import { mockReportSummary, mockSentiment } from "../research/mock-data";
import { SECTOR_UNIVERSE } from "@/data/sectors/taxonomy";

const VALID_SECTOR_IDS_FOR_PROMPT = Object.entries(SECTOR_UNIVERSE)
  .map(([id, s]) => `"${id}" (${s.name})`)
  .join(", ");

// ─── Gemini Client ────────────────────────────────────────────────────────────
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

// ─── Model Names ──────────────────────────────────────────────────────────────
const GEMINI_FLASH = "gemini-2.5-flash";           // Stage 2: final generation
const GEMINI_FLASH_LITE = "gemini-2.5-flash-lite"; // Stage 1: preprocessing

// ─── Budget Control ───────────────────────────────────────────────────────────
const MIN_REAL_SOURCES = 2; // Minimum real sources required to proceed to AI
const SENTIMENT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes per symbol
const sentimentCooldown = new Map<string, number>(); // symbol → last generated timestamp

// ─── Fallback Reason Taxonomy ─────────────────────────────────────────────────
type FallbackReason =
  | "no_api_key"
  | "source_empty"
  | "source_insufficient"
  | "source_poor_quality"
  | "cooldown_active"
  | "relevance_mismatch"
  | "quota_exceeded"
  | "rate_limited"
  | "timeout"
  | "schema_error"
  | "provider_unavailable"
  | "budget_guard_blocked"
  | "mock_detected";

// ─── Developer Observability ──────────────────────────────────────────────────
function createMeta(opts: {
  provider: string;
  model: string;
  mode: "real" | "fallback";
  fallbackReason?: FallbackReason | string;
  latencyMs?: number;
  sourceCount?: number;
  cacheDecision?: "hit" | "miss" | "stale";
  budgetDecision?: string;
}) {
  if (process.env.NODE_ENV !== "development") return undefined;
  return opts;
}

function classifyError(err: any): FallbackReason {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("429") || msg.includes("quota")) return "quota_exceeded";
  if (msg.includes("rate")) return "rate_limited";
  if (msg.includes("timeout") || msg.includes("timed out")) return "timeout";
  if (msg.includes("schema") || msg.includes("parse") || msg.includes("json")) return "schema_error";
  if (msg.includes("unavailable") || msg.includes("503")) return "provider_unavailable";
  return "provider_unavailable";
}

function safeMockSentiment(symbol: string, reason: FallbackReason, startTime: number, model: string): SentimentScore {
  const fallback = mockSentiment(symbol) as SentimentScore;
  return {
    ...fallback,
    _meta: createMeta({ provider: "gemini", model, mode: "fallback", fallbackReason: reason, latencyMs: Date.now() - startTime }) as any,
  };
}

function safeMockReport(symbol: string, reason: FallbackReason, startTime: number, model: string): StockReportSummary {
  const fallback = mockReportSummary(symbol);
  return {
    ...fallback,
    _meta: createMeta({ provider: "gemini", model, mode: "fallback", fallbackReason: reason, latencyMs: Date.now() - startTime }) as any,
  };
}

// ─── Source Quality Check ─────────────────────────────────────────────────────
function checkSourceQuality(sources: SourceItem[]): { ok: boolean; reason?: FallbackReason; count: number } {
  const realSources = sources.filter(s =>
    !(s as any)._isMock &&
    s.provider !== "Mock News" &&
    !s.id.includes("fallback")
  );
  if (realSources.length === 0) return { ok: false, reason: "source_empty", count: 0 };
  if (realSources.length < MIN_REAL_SOURCES) return { ok: false, reason: "source_insufficient", count: realSources.length };
  return { ok: true, count: realSources.length };
}

// ─── Gemini helper ────────────────────────────────────────────────────────────
async function geminiJSON<T>(model: string, prompt: string): Promise<T> {
  if (!ai) throw new Error("no_api_key");
  const res = await ai.models.generateContent({
    model,
    contents: prompt,
    config: { responseMimeType: "application/json" },
  });
  const text = res.text?.trim() || "{}";
  return JSON.parse(text) as T;
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. AI SENTIMENT — 2-stage routing
//    Stage 1: Flash-Lite → source relevance pre-check
//    Stage 2: Flash      → final sentiment score + explanation
// ═════════════════════════════════════════════════════════════════════════════
export async function aiAnalyzeSentiment(symbol: string, sources: SourceItem[]): Promise<SentimentScore> {
  const startTime = Date.now();
  const name = getServerStockName(symbol);

  // ── Budget gate: source quality ───────────────────────────────────────────
  const quality = checkSourceQuality(sources);
  if (!quality.ok) {
    return safeMockSentiment(symbol, quality.reason!, startTime, GEMINI_FLASH);
  }

  // ── Budget gate: no API key ───────────────────────────────────────────────
  if (!ai) return safeMockSentiment(symbol, "no_api_key", startTime, GEMINI_FLASH);

  // ── Budget gate: cooldown ────────────────────────────────────────────────
  const lastRun = sentimentCooldown.get(symbol) || 0;
  if (Date.now() - lastRun < SENTIMENT_COOLDOWN_MS) {
    return safeMockSentiment(symbol, "cooldown_active", startTime, GEMINI_FLASH);
  }

  // ── Stage 1: Flash-Lite — relevance pre-filter ────────────────────────────
  let relevantSources = sources;
  try {
    const stage1Prompt = `You are a financial data filter. 
Given company: "${name}" (symbol: ${symbol}).
Review these sources and return only the IDs that are clearly relevant to this specific company or its direct industry.
Sources: ${JSON.stringify(sources.map(s => ({ id: s.id, title: s.title, provider: s.provider })))}
Output JSON: { "relevantIds": ["id1", "id2"] }`;

    const stage1 = await geminiJSON<{ relevantIds: string[] }>(GEMINI_FLASH_LITE, stage1Prompt);
    if (stage1.relevantIds && stage1.relevantIds.length >= MIN_REAL_SOURCES) {
      relevantSources = sources.filter(s => stage1.relevantIds.includes(s.id));
    }
  } catch (e) {
    // Stage 1 failure is non-fatal — proceed with all sources
    console.warn(`[Orchestrator] Stage 1 (Flash-Lite) failed for ${symbol}, proceeding with all sources.`, e);
  }

  // ── Stage 2: Flash — final sentiment generation ───────────────────────────
  try {
    const prompt = `You are a Korean stock market analyst. Analyze sentiment for ${name} (${symbol}).
Sources (verified relevant):
${JSON.stringify(relevantSources, null, 2)}

Output JSON matching this schema exactly:
{
  "score": <number 0-100>,
  "label": "긍정" | "중립" | "부정",
  "trend": "up" | "down" | "flat",
  "positiveFactors": ["<string>"],
  "negativeFactors": ["<string>"],
  "basisSourceIds": ["<id from sources above>"]
}

Rules:
- Base ALL analysis ONLY on the provided sources.
- If sources don't have enough information about ${name}, set score=50, label="중립".
- Do NOT fabricate or use general semiconductor/automotive knowledge not grounded in sources.
- Only include source IDs that directly support your analysis.`;

    const parsed = await geminiJSON<{
      score: number; label: string; trend: string;
      positiveFactors: string[]; negativeFactors: string[]; basisSourceIds: string[];
    }>(GEMINI_FLASH, prompt);

    const basisSources = relevantSources.filter(s => parsed.basisSourceIds?.includes(s.id));
    const latencyMs = Date.now() - startTime;
    sentimentCooldown.set(symbol, Date.now());

    return {
      score: parsed.score ?? 50,
      label: (parsed.label as any) ?? "중립",
      trend: (parsed.trend as any) ?? "flat",
      positiveFactors: parsed.positiveFactors ?? [],
      negativeFactors: parsed.negativeFactors ?? [],
      basisSources: basisSources.length > 0 ? basisSources : relevantSources.slice(0, 3),
      freshness: "live",
      generatedAt: new Date().toISOString(),
      _meta: createMeta({
        provider: "gemini", model: GEMINI_FLASH, mode: "real",
        latencyMs, sourceCount: quality.count,
      }) as any,
    };
  } catch (e: any) {
    const reason = classifyError(e);
    console.error(`[Orchestrator] Stage 2 sentiment failed for ${symbol}:`, e);
    return safeMockSentiment(symbol, reason, startTime, GEMINI_FLASH);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2. AI REPORT SUMMARY — Gemini Flash (replaces OpenAI path)
// ═════════════════════════════════════════════════════════════════════════════
export async function aiSummarizeIssues(symbol: string, clusters: IssueCluster[]): Promise<StockReportSummary> {
  const name = getServerStockName(symbol);
  const startTime = Date.now();

  const hasRealClusters = clusters.length > 0 && !clusters.every(c =>
    c.id.includes("fallback") || c.title.includes("Mock") || c.representativeSource === "Mock News"
  );

  if (!ai || !hasRealClusters) {
    const reason: FallbackReason = !ai ? "no_api_key" : "source_empty";
    return safeMockReport(symbol, reason, startTime, GEMINI_FLASH);
  }

  try {
    const prompt = `You are a Korean stock analyst. Create a concise stock summary for ${name} (${symbol}).

Key issues found (source-grounded):
${JSON.stringify(clusters.map(c => ({ title: c.title, summary: c.summary, source: c.representativeSource })), null, 2)}

Output JSON:
{
  "aiHeadline": "<one sentence, Korean, based ONLY on sources above, mention ${name} explicitly>",
  "aiSummary": "<2-3 sentences, Korean, grounded in sources above, do NOT fabricate sector-specific content not in sources>"
}`;

    const parsed = await geminiJSON<{ aiHeadline: string; aiSummary: string }>(GEMINI_FLASH, prompt);
    const latencyMs = Date.now() - startTime;

    return {
      symbol, name,
      currentPrice: 0, change: 0, changeRate: 0,
      aiHeadline: parsed.aiHeadline || `${name} 핵심 이슈 요약`,
      aiSummary: parsed.aiSummary || "최근 이슈를 종합 중입니다.",
      priceFreshness: "stale", reportFreshness: "live",
      lastUpdated: new Date().toISOString(),
      _meta: createMeta({ provider: "gemini", model: GEMINI_FLASH, mode: "real", latencyMs }) as any,
    };
  } catch (e: any) {
    const reason = classifyError(e);
    console.error(`[Orchestrator] Report summary failed for ${symbol}:`, e);
    return safeMockReport(symbol, reason, startTime, GEMINI_FLASH);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 2.5 SECTOR SUMMARY
// ═════════════════════════════════════════════════════════════════════════════
export async function aiSummarizeSector(sector: any, clusters: any[]): Promise<{ summary: string; trendStrength: number; leaders?: string[]; laggards?: string[]; watchCandidates?: any[] }> {
  if (!ai || clusters.length === 0) {
    return { summary: "해당 섹터에 대한 충분한 최신 데이터가 없습니다.", trendStrength: 50 };
  }

  try {
    const prompt = `You are a Korean stock analyst. Create a summary for the "${sector.name}" sector.

Key issues found across representative stocks:
${JSON.stringify(clusters.map(c => ({ title: c.title, summary: c.summary })), null, 2)}

Output JSON:
{
  "summary": "<2-3 sentences, Korean, grounded in issues above, explaining the sector trend>",
  "trendStrength": <number 0-100, 100 is extremely strong positive momentum, 50 is neutral, 0 is crash>,
  "leaders": ["<종목명 1>", "<종목명 2>"],
  "laggards": ["<종목명 1>"],
  "watchCandidates": [
    { "name": "<종목명>", "reason": "<관찰 이유, Korean, grounded>" }
  ]
}`;

    const parsed = await geminiJSON<any>(GEMINI_FLASH, prompt);
    return {
      summary: parsed.summary || "해당 섹터에 대한 최신 동향을 파악 중입니다.",
      trendStrength: parsed.trendStrength ?? 50,
      leaders: parsed.leaders || [],
      laggards: parsed.laggards || [],
      watchCandidates: parsed.watchCandidates || []
    };
  } catch (e: any) {
    console.error(`[Orchestrator] Sector summary failed for ${sector.name}:`, e);
    return { summary: "해당 섹터에 대한 분석 중 오류가 발생했습니다.", trendStrength: 50 };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. HOME INTELLIGENCE — 2-stage routing
//    Stage 1: Flash-Lite → raw aggregation / candidate generation
//    Stage 2: Flash      → final user-facing copy
// ═════════════════════════════════════════════════════════════════════════════
export async function aiGenerateHomeIntelligence(recentSources?: any[]) {
  const startTime = Date.now();

  if (!ai) {
    return {
      _meta: createMeta({ provider: "gemini", model: GEMINI_FLASH, mode: "fallback", fallbackReason: "no_api_key" }),
    };
  }

  // Stage 1: Flash-Lite — lightweight candidate extraction
  let candidates: any = null;
  try {
    const sourceContext = recentSources && recentSources.length > 0 
      ? `Recent curated sources:\n${recentSources.map(s => `- [${s.provider}] ${s.title} (${s.symbol})`).join('\n')}\n\n`
      : "";

    const s1Prompt = `Korean stock market intelligence extraction. Today's date: ${new Date().toLocaleDateString("ko-KR")}.

${sourceContext}Generate raw candidate data for a Korean stock market home dashboard.
Be realistic and specific to current market conditions.

Output JSON:
{
  "trendingSymbols": [{"symbol": "005930", "name": "삼성전자", "keywords": ["HBM", "AI"]}],
  "trendingThemes": ["반도체", "2차전지", "방산"],
  "keyIssueHeadlines": ["headline 1", "headline 2", "headline 3"],
  "sectorMomentum": [{"sectorId": "sec-semiconductor", "name": "반도체", "strength": 90}]
}
Limit: 4 symbols, 3 themes, 3 headlines, 3 sectors.`;

    candidates = await geminiJSON<any>(GEMINI_FLASH_LITE, s1Prompt);
  } catch (e) {
    console.warn("[Orchestrator] Home Stage 1 (Flash-Lite) failed, skipping to Stage 2.", e);
  }

  // Stage 2: Flash — final user-facing content with reasons
  try {
    const s2Prompt = `You are a Korean stock market analyst creating home dashboard content.
${candidates ? `Use these pre-identified candidates: ${JSON.stringify(candidates)}` : ""}
${recentSources && recentSources.length > 0 ? `Also consider these recent real-world sources:\n${JSON.stringify(recentSources.map(s => ({ title: s.title, provider: s.provider, symbol: s.symbol })))}` : ""}

CRITICAL RECOMMENDATION GUARDRAILS:
1. No investment advice: Use neutral, observational language. Never use "매수 추천", "강력 매수", "반드시 사야할" (must buy/sell).
2. Source-backed: All reasons MUST be grounded in the provided recent sources. Do not hallucinate trends.
3. Classification: Categorize AI picks exactly as 'event_driven', 'momentum', or 'undervalued'.
4. Disclaimer: Must include strict legal disclaimer that users hold responsibility.

Generate final home intelligence JSON with user-facing copy (all Korean):
{
  "issues": [
    { "id": "1", "title": "<Korean headline>", "description": "<1-2 sentences explaining WHY it matters based on sources>", "trendStrength": <70-99>, "timestamp": "${new Date().toISOString()}" }
  ],
  "stocks": [
    { "symbol": "<6-digit KRX>", "name": "<Korean name>", "reason": "<why trending, 1 sentence source-backed>", "trendStrength": <70-99>, "changeRate": <number>, "price": <number> }
  ],
  "sectors": [
    { "id": "<MUST be one of: ${VALID_SECTOR_IDS_FOR_PROMPT}>", "name": "<Korean>", "description": "<why trending, source-backed>", "trendStrength": <70-99>, "representativeSymbols": ["<sym1>", "<sym2>"] }
  ],
  "aiPicks": [
    {
      "id": "pick-1", "type": "stock", "targetId": "<symbol>", "name": "<Korean name>",
      "recommendationType": "close_watch",
      "candidateCategory": "event_driven | momentum | undervalued",
      "reasons": [{ "summary": "<Korean, observational facts from sources>", "sourceType": "news" }],
      "riskSummary": "<Korean, highlight potential downside or risk factors>",
      "disclaimer": "본 정보는 투자 참고용이며, 투자 판단과 책임은 전적으로 이용자에게 있습니다. 원금 손실이 발생할 수 있습니다."
    }
  ]
}
Limit: 3 issues, 4 stocks, 3 sectors, 2 picks. Raw JSON only.`;

    const parsed = await geminiJSON<any>(GEMINI_FLASH, s2Prompt);
    const latencyMs = Date.now() - startTime;
    parsed._meta = createMeta({
      provider: "gemini", model: GEMINI_FLASH, mode: "real", latencyMs,
      budgetDecision: candidates ? "stage1+stage2" : "stage2-only",
    });
    return parsed;
  } catch (e: any) {
    const reason = classifyError(e);
    console.error("[Orchestrator] Home intelligence Stage 2 failed:", e);
    return {
      _meta: createMeta({ provider: "gemini", model: GEMINI_FLASH, mode: "fallback", fallbackReason: reason, latencyMs: Date.now() - startTime }),
    };
  }
}
