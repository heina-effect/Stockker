import { NextRequest, NextResponse } from "next/server";
import { getStockAnalystOpinions } from "@/server/kis/analyst-opinion";
import { getDomesticStockQuote } from "@/server/kis/rest-client";
import { generateIssues, generateReportSummary, generateSentiment } from "@/server/research/model-router";
import { getServerStockName } from "@/lib/stocks/search-master";
import { getCanonicalSectorForSymbol } from "@/lib/stocks/sector-utils";
import { isUnsupportedStockSymbol } from "@/lib/stocks/listing-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 10;

function parseSymbols(req: NextRequest): string[] {
  const raw = req.nextUrl.searchParams.get("symbols") || "";
  return [...new Set(raw.split(",").map(s => s.trim()).filter(Boolean))]
    .filter(symbol => /^\d{6}$/.test(symbol))
    .filter(symbol => !isUnsupportedStockSymbol(symbol))
    .slice(0, MAX_SYMBOLS);
}

async function summarizeSymbol(symbol: string) {
  const sector = getCanonicalSectorForSymbol(symbol);
  const name = getServerStockName(symbol);

  const [quoteResult, reportResult, sentimentResult, issuesResult, opinionResult] = await Promise.allSettled([
    getDomesticStockQuote(symbol),
    generateReportSummary(symbol),
    generateSentiment(symbol),
    generateIssues(symbol),
    getStockAnalystOpinions(symbol),
  ]);

  const quote = quoteResult.status === "fulfilled" ? quoteResult.value : null;
  const report = reportResult.status === "fulfilled" ? reportResult.value : null;
  const sentiment = sentimentResult.status === "fulfilled" ? sentimentResult.value : null;
  const issues = issuesResult.status === "fulfilled" ? issuesResult.value.clusters : [];
  const sources = issuesResult.status === "fulfilled" ? issuesResult.value.sources : [];
  const opinion = opinionResult.status === "fulfilled" ? opinionResult.value : null;
  const disclosureCount = sources.filter(source => source.sourceType === "disclosure").length;
  const newsCount = sources.filter(source => source.sourceType === "news").length;

  return {
    symbol,
    name,
    sector: sector ? { sectorId: sector.sectorId, name: sector.name } : null,
    quote: quote ? {
      price: quote.price,
      change: quote.change,
      changeRate: quote.changeRate,
      volume: quote.volume,
      timestamp: quote.timestamp,
    } : null,
    aiHeadline: report?.aiHeadline ?? null,
    aiSummary: report?.aiSummary ?? null,
    reportFreshness: report?.reportFreshness ?? "stale",
    sentiment: sentiment ? {
      score: sentiment.score,
      label: sentiment.label,
      trend: sentiment.trend,
      freshness: sentiment.freshness,
    } : null,
    issues: issues.slice(0, 2).map(issue => ({
      id: issue.id,
      title: issue.title,
      summary: issue.summary,
      sentiment: issue.sentiment,
      sourceCount: issue.sourceCount,
      timestamp: issue.timestamp,
    })),
    counts: {
      issueCount: issues.length,
      sourceCount: sources.length,
      disclosureCount,
      newsCount,
    },
    opinion: opinion ? {
      avgTargetPrice: opinion.avgTargetPrice,
      recentOpinionCount: opinion.items.length,
      latestOpinion: opinion.items[0]?.opinion ?? null,
      latestFirmName: opinion.items[0]?.firmName ?? null,
      updatedAt: opinion.updatedAt,
    } : null,
    whyNow:
      issues[0]?.title ??
      report?.aiHeadline ??
      (quote ? `현재가와 등락률이 갱신된 관심 종목입니다.` : "리포트 준비 중입니다."),
    fetchedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const symbols = parseSymbols(req);
  if (symbols.length === 0) {
    return NextResponse.json({ ok: true, items: [], fetchedAt: new Date().toISOString() });
  }

  const items = [];
  for (const symbol of symbols) {
    try {
      items.push(await summarizeSymbol(symbol));
    } catch (error) {
      items.push({
        symbol,
        name: getServerStockName(symbol),
        sector: null,
        quote: null,
        aiHeadline: null,
        aiSummary: null,
        reportFreshness: "error",
        sentiment: null,
        issues: [],
        counts: { issueCount: 0, sourceCount: 0, disclosureCount: 0, newsCount: 0 },
        opinion: null,
        whyNow: "리포트 준비 중입니다.",
        error: String(error),
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  return NextResponse.json({ ok: true, items, fetchedAt: new Date().toISOString() });
}
