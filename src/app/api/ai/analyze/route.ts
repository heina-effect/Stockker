import { NextResponse } from "next/server";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { aiConfig } from "@/server/kis/config";

export const runtime = "nodejs";

const NewsItemSchema = z.object({
    title: z.string(),
    snippet: z.string().optional(),
    source: z.string().optional(),
    publishedAt: z.string().optional(),
});

const SocialItemSchema = z.object({
    text: z.string(),
    author: z.string().optional(),
    createdAt: z.string().optional(),
});

const DisclosureItemSchema = z.object({
    title: z.string(),
    body: z.string().optional(),
    publishedAt: z.string().optional(),
});

const RequestSchema = z.object({
    symbol: z.string().min(1),
    market: z.enum(["KRX", "NASDAQ"]).default("KRX"),
    mode: z.enum(["summary", "sentiment", "deep-analysis"]),
    userQuestion: z.string().optional(),

    news: z.array(NewsItemSchema).default([]),
    socialPosts: z.array(SocialItemSchema).default([]),
    disclosures: z.array(DisclosureItemSchema).default([]),

    priceContext: z
        .object({
            currentPrice: z.number().optional(),
            changeRate: z.number().optional(),
            intraday: z.array(z.record(z.string(), z.any())).optional(),
            technicals: z.record(z.string(), z.any()).optional(),
            fundamentals: z.record(z.string(), z.any()).optional(),
        })
        .optional(),
});

const InsightSchema = z.object({
    summary: z.string().min(1),
    sentimentScore: z.number().min(-100).max(100),
    sentimentLabel: z.enum(["bullish", "neutral", "bearish"]),
    keyBullPoints: z.array(z.string()).default([]),
    keyBearPoints: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
    nextCheckpoints: z.array(z.string()).default([]),
    confidence: z.number().min(0).max(1),
});

type AnalyzeRequest = z.infer<typeof RequestSchema>;
type Insight = z.infer<typeof InsightSchema>;
type Provider = "gemini" | "openai";

function chooseProvider(body: AnalyzeRequest): {
    provider: Provider;
    reason: string;
} {
    const signalCount =
        body.news.length + body.socialPosts.length + body.disclosures.length;

    const hasTechnicals = Boolean(body.priceContext?.technicals);
    const hasFundamentals = Boolean(body.priceContext?.fundamentals);
    const questionLength = body.userQuestion?.length ?? 0;

    if (body.mode === "deep-analysis") {
        return {
            provider: "openai",
            reason: "explicit deep-analysis mode",
        };
    }

    if (hasTechnicals || hasFundamentals || questionLength >= 180) {
        return {
            provider: "openai",
            reason: "technical/fundamental context or long reasoning request",
        };
    }

    if (body.mode === "summary" || body.mode === "sentiment") {
        return {
            provider: "gemini",
            reason: "fast summarization/sentiment workload",
        };
    }

    if (signalCount >= 25) {
        return {
            provider: "gemini",
            reason: "large batch preprocessing workload",
        };
    }

    return {
        provider: "openai",
        reason: "fallback to higher-reasoning path",
    };
}

function buildPrompt(body: AnalyzeRequest, provider: Provider) {
    const providerInstruction =
        provider === "gemini"
            ? "Compress noisy inputs quickly. Focus on concise summary and sentiment."
            : "Perform deeper reasoning across catalysts, technical context, fundamentals, and disclosed risks.";

    return [
        "You are the market-analysis engine for Stockker.",
        providerInstruction,
        "Return JSON only.",
        "",
        "JSON schema:",
        JSON.stringify(
            {
                summary: "string",
                sentimentScore: 0,
                sentimentLabel: "bullish | neutral | bearish",
                keyBullPoints: ["string"],
                keyBearPoints: ["string"],
                risks: ["string"],
                nextCheckpoints: ["string"],
                confidence: 0.0,
            },
            null,
            2
        ),
        "",
        "Rules:",
        "- sentimentScore must be between -100 and 100.",
        "- confidence must be between 0 and 1.",
        "- Keep summary under 6 sentences.",
        "- Do not give definitive financial advice.",
        "- Use the provided data only. If evidence is weak, lower confidence.",
        "",
        "Input payload:",
        JSON.stringify(body, null, 2),
    ].join("\n");
}

function extractJsonText(raw: string): string {
    const trimmed = raw.trim();

    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (fenced?.[1]) return fenced[1].trim();

    const genericFence = trimmed.match(/```\s*([\s\S]*?)```/i);
    if (genericFence?.[1]) return genericFence[1].trim();

    return trimmed;
}

function parseInsightOrFallback(raw: string): Insight {
    try {
        return InsightSchema.parse(JSON.parse(extractJsonText(raw)));
    } catch {
        return {
            summary: raw.trim() || "분석 결과를 구조화하지 못했습니다.",
            sentimentScore: 0,
            sentimentLabel: "neutral",
            keyBullPoints: [],
            keyBearPoints: [],
            risks: ["모델 응답이 JSON 형식을 벗어났습니다."],
            nextCheckpoints: [],
            confidence: 0.25,
        };
    }
}

// Gemini 3 Flash: 뉴스 다건 요약, SNS/뉴스 배치 감성 점수, 짧은 브리핑
// OpenAI GPT: 기술적 지표 + 기본적 지표 + 공시 + 질문이 섞인 심층 분석

async function runGemini(body: AnalyzeRequest): Promise<Insight> {
    if (!aiConfig.geminiApiKey) {
        throw new Error("GEMINI_API_KEY is missing");
    }

    const client = new GoogleGenAI({
        apiKey: aiConfig.geminiApiKey,
    });

    const response = await client.models.generateContent({
        model: aiConfig.geminiFastModel,
        contents: buildPrompt(body, "gemini"),
    });

    return parseInsightOrFallback(response.text ?? "");
}

async function runOpenAI(body: AnalyzeRequest): Promise<Insight> {
    if (!aiConfig.openaiApiKey) {
        throw new Error("OPENAI_API_KEY is missing");
    }

    const client = new OpenAI({
        apiKey: aiConfig.openaiApiKey,
    });

    const response = await client.responses.create({
        model: aiConfig.openaiReasoningModel,
        input: buildPrompt(body, "openai"),
    });

    return parseInsightOrFallback(response.output_text ?? "");
}

export async function POST(request: Request) {
    try {
        const json = await request.json();
        const body = RequestSchema.parse(json);

        const routing = chooseProvider(body);

        const insight =
            routing.provider === "gemini"
                ? await runGemini(body)
                : await runOpenAI(body);

        return NextResponse.json({
            ok: true,
            provider: routing.provider,
            model:
                routing.provider === "gemini"
                    ? aiConfig.geminiFastModel
                    : aiConfig.openaiReasoningModel,
            routingReason: routing.reason,
            insight,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                {
                    ok: false,
                    error: "Invalid request body",
                    details: error.flatten(),
                },
                { status: 400 }
            );
        }

        return NextResponse.json(
            {
                ok: false,
                error: error instanceof Error ? error.message : "Unknown AI route error",
            },
            { status: 500 }
        );
    }
}