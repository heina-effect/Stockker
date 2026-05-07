import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { IssueCluster, SourceItem, SentimentScore, RecommendationCandidate, StockReportSummary } from "@/types/research";
import { getServerStockName } from "@/lib/stocks/search-master";
import { mockReportSummary, mockSentiment } from "../research/mock-data";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Developer Observability Metadata Helper
function createMeta(provider: string, model: string, mode: "real" | "fallback", reason?: string, latencyMs?: number) {
  if (process.env.NODE_ENV !== "development") return undefined;
  return { provider, model, mode, fallbackReason: reason, latencyMs };
}

// Helper to fallback to mock safely
function safeMock<T>(fallback: T, err: any, provider: string, model: string, startTime: number): T {
  console.error(`[AI Orchestrator Error - ${provider}/${model}]`, err);
  const latencyMs = Date.now() - startTime;
  return { ...fallback, _meta: createMeta(provider, model, "fallback", err.message || "Unknown error", latencyMs) };
}

export async function aiSummarizeIssues(symbol: string, clusters: IssueCluster[]): Promise<StockReportSummary> {
  const name = getServerStockName(symbol);
  const startTime = Date.now();
  
  const isMockClusters = clusters.some(c => c.items.some(i => i.sourceId.includes("fallback")));

  if (!openai || clusters.length === 0 || isMockClusters) {
    return { ...mockReportSummary(symbol), _meta: createMeta("openai", "gpt-5.5", "fallback", isMockClusters ? "Mock clusters detected" : "No key or data", Date.now() - startTime) };
  }

  try {
    const prompt = `You are a financial analyst. Summarize the following news clusters for ${name} (${symbol}).
    
    Clusters:
    ${JSON.stringify(clusters, null, 2)}
    
    Provide a JSON object with:
    {
      "aiHeadline": "A catchy, 1-sentence headline summarizing the overall sentiment",
      "aiSummary": "A 2-3 sentence summary explaining the current situation and expectations"
    }
    
    Respond with raw JSON only. Do not use markdown blocks.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.5",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const latencyMs = Date.now() - startTime;
    
    return {
      symbol,
      name,
      currentPrice: 0, // Filled by client component
      change: 0,
      changeRate: 0,
      aiHeadline: parsed.aiHeadline || `${name} 핵심 이슈 요약`,
      aiSummary: parsed.aiSummary || "최근 이슈를 종합 중입니다.",
      priceFreshness: "stale",
      reportFreshness: "live",
      lastUpdated: new Date().toISOString(),
      _meta: createMeta("openai", "gpt-5.5", "real", undefined, latencyMs)
    };
  } catch (e) {
    return safeMock(mockReportSummary(symbol), e, "openai", "gpt-5.5", startTime);
  }
}

export async function aiAnalyzeSentiment(symbol: string, sources: SourceItem[]): Promise<SentimentScore> {
  const startTime = Date.now();
  const isMockSources = sources.some(s => s.provider === "Mock News" || s.id.includes("fallback"));

  if (!ai || sources.length === 0 || isMockSources) {
    return { ...mockSentiment(symbol), _meta: createMeta("gemini", "gemini-2.5-flash", "fallback", isMockSources ? "Mock sources detected" : "No key or data", Date.now() - startTime) };
  }

  try {
    const name = getServerStockName(symbol);
    const prompt = `Analyze the sentiment for ${name} based on the following sources.
    
    Sources:
    ${JSON.stringify(sources, null, 2)}
    
    Output JSON exactly matching this structure:
    {
      "score": number between 0 and 100,
      "label": "긍정" | "중립" | "부정",
      "trend": "up" | "down" | "flat",
      "positiveFactors": ["factor1", "factor2"],
      "negativeFactors": ["factor1", "factor2"],
      "basisSourceIds": ["id1", "id2"] // Only IDs from the provided sources that strongly support the analysis
    }
    
    Do not use markdown blocks. Return raw JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
          responseMimeType: "application/json",
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    const basisSources = sources.filter(s => parsed.basisSourceIds?.includes(s.id));
    const latencyMs = Date.now() - startTime;

    return {
      score: parsed.score || 50,
      label: parsed.label || "중립",
      trend: parsed.trend || "flat",
      positiveFactors: parsed.positiveFactors || [],
      negativeFactors: parsed.negativeFactors || [],
      basisSources: basisSources.length > 0 ? basisSources : sources.slice(0, 3), // Fallback to top 3 if failed to map
      freshness: "live",
      generatedAt: new Date().toISOString(),
      _meta: createMeta("gemini", "gemini-2.5-flash", "real", undefined, latencyMs)
    };
  } catch (e) {
    return safeMock(mockSentiment(symbol), e, "gemini", "gemini-2.5-flash", startTime);
  }
}

export async function aiGenerateHomeIntelligence() {
  const startTime = Date.now();
  if (!openai) {
    return { _meta: createMeta("openai", "gpt-5.4-mini", "fallback", "No key", Date.now() - startTime) };
  }

  try {
    const prompt = `As a top-tier Korean stock market analyst, generate the current home dashboard intelligence.
    Provide realistic, plausible data reflecting the current South Korean market trends (e.g., Semiconductors, AI, Autos, Bio).
    
    Output JSON exactly matching this structure:
    {
      "issues": [
        { "id": "1", "title": "Headline", "description": "Short summary", "trendStrength": 95, "timestamp": "ISO-string" }
      ],
      "stocks": [
        { "symbol": "005930", "name": "삼성전자", "reason": "Why trending", "trendStrength": 90, "changeRate": 1.5, "price": 75000 }
      ],
      "sectors": [
        { "id": "sec-semiconductor", "name": "반도체", "description": "Why trending", "trendStrength": 95, "representativeSymbols": ["005930", "000660"] }
      ],
      "aiPicks": [
        {
          "id": "pick-1", "type": "stock", "targetId": "005930", "name": "삼성전자",
          "recommendationType": "close_watch",
          "reasons": [{ "summary": "Reason 1", "sourceType": "news" }],
          "riskSummary": "Macro risks",
          "disclaimer": "정보 제공 목적이며 투자 판단과 책임은 이용자 본인에게 있습니다."
        }
      ]
    }
    
    Limit to 3 issues, 4 stocks, 3 sectors, 2 picks. Respond with raw JSON only.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    const latencyMs = Date.now() - startTime;
    parsed._meta = createMeta("openai", "gpt-5.4-mini", "real", undefined, latencyMs);
    
    return parsed;
  } catch (e: any) {
    console.error("[AI Orchestrator Error Home Intelligence]", e);
    return { _meta: createMeta("openai", "gpt-5.4-mini", "fallback", e.message, Date.now() - startTime) };
  }
}
