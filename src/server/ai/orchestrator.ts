import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { IssueCluster, SourceItem, SentimentScore, RecommendationCandidate, StockReportSummary } from "@/types/research";
import { getServerStockName } from "@/lib/stocks/search-master";
import { mockReportSummary, mockSentiment } from "../research/mock-data";

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Helper to fallback to mock safely
function safeMock<T>(fallback: T, err: any): T {
  console.error("[AI Orchestrator Error]", err);
  return fallback;
}

export async function aiSummarizeIssues(symbol: string, clusters: IssueCluster[]): Promise<StockReportSummary> {
  const name = getServerStockName(symbol);
  
  if (!openai || clusters.length === 0) {
    return mockReportSummary(symbol);
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
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    
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
      lastUpdated: new Date().toISOString()
    };
  } catch (e) {
    return safeMock(mockReportSummary(symbol), e);
  }
}

export async function aiAnalyzeSentiment(symbol: string, sources: SourceItem[]): Promise<SentimentScore> {
  if (!ai || sources.length === 0) {
    return mockSentiment(symbol);
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

    return {
      score: parsed.score || 50,
      label: parsed.label || "중립",
      trend: parsed.trend || "flat",
      positiveFactors: parsed.positiveFactors || [],
      negativeFactors: parsed.negativeFactors || [],
      basisSources: basisSources.length > 0 ? basisSources : sources.slice(0, 3), // Fallback to top 3 if failed to map
      freshness: "live",
      generatedAt: new Date().toISOString()
    };
  } catch (e) {
    return safeMock(mockSentiment(symbol), e);
  }
}

export async function aiGenerateHomeIntelligence() {
  if (!openai) {
    return null; // Let the caller fallback to mock
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
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || "{}");
  } catch (e) {
    console.error("[AI Orchestrator Error Home Intelligence]", e);
    return null;
  }
}
