/**
 * Embedding Curator — Phase 20
 *
 * Phase 19 기반 유지 + Phase 20 개선:
 * 1. raw sources를 news_sources 테이블에 먼저 저장
 * 2. embedding + quality score → source_embeddings 테이블에 저장
 * 3. DB에서 최근 curated sources 재사용 (freshness window)
 *
 * Gemini Embedding은 뉴스를 가져오는 역할이 아니라,
 * 가져온 소스를 필터링/랭킹/클러스터링하는 역할입니다.
 */

import { GoogleGenAI } from "@google/genai";
import type { SourceItem } from "@/types/research";
import type { EmbeddedSource, RawSourceRecord } from "./vector-store";
import { getVectorStore, cosineSimilarity } from "./vector-store";

/**
 * gemini-embedding-001: v1beta API 지원, 3072차원
 * text-embedding-004는 이 API 키로 사용 불가
 */
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const EMBEDDING_MODEL = "gemini-embedding-001"; // 3072-dim, v1beta OK
const EMBEDDING_DIM = 3072;
const DEDUP_CLUSTER_THRESHOLD = 0.88;
const MIN_QUALITY_SCORE = 30;
const FRESHNESS_WINDOW_MS = 25 * 60 * 1000; // 25분 내 curated sources는 재사용

const SPAM_HEADLINES = [
  "지금 사야 할 종목 TOP 5",
  "단기 급등 예상 종목",
  "놓치면 후회할 투자 기회",
  "수익률 보장 특급 정보",
  "주식 필승 전략 공개",
  "유료 종목 추천 무료 공개",
  "내일 상한가 예상 종목",
];

const STRATEGY_TAGS: Record<string, string[]> = {
  earnings:       ["실적", "영업이익", "매출", "분기", "어닝", "EPS", "컨센서스"],
  guidance:       ["가이던스", "전망", "목표주가", "예상", "전망치"],
  institutional:  ["외국인", "기관", "매수", "순매수", "수급"],
  order_wins:     ["수주", "계약", "공급", "MOU", "납품"],
  regulation:     ["규제", "정책", "법안", "제재", "허가", "승인"],
  supply_chain:   ["공급망", "소재", "부품", "조달", "협력사"],
  sector_momentum:["섹터", "업종", "테마", "동반"],
};

let lastQuotaExceededTime = 0;
const QUOTA_COOLDOWN_MS = 60 * 1000; // 429 발생 시 1분간 대기

async function embedText(text: string): Promise<number[]> {
  if (!ai) return [];
  
  const now = Date.now();
  if (now - lastQuotaExceededTime < QUOTA_COOLDOWN_MS) {
    return []; // 쿨다운 중일 때는 요청을 조용히 건너뜀
  }

  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });
    const values =
      (result as any).embeddings?.[0]?.values ??
      (result as any).embedding?.values ??
      [];
    return values as number[];
  } catch (e: any) {
    const msg = String(e?.message || e || "").toLowerCase();
    if (msg.includes("429") || msg.includes("quota") || msg.includes("resource_exhausted")) {
      lastQuotaExceededTime = Date.now();
      console.warn(`[Curator] Gemini API Quota Exceeded (429). Entering silent cooldown for ${QUOTA_COOLDOWN_MS / 1000}s.`);
    } else {
      console.warn("[Curator] embedText failed:", e?.message || e);
    }
    return [];
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const now = Date.now();
    if (now - lastQuotaExceededTime < QUOTA_COOLDOWN_MS) {
      break; // 쿼터 초과 쿨다운 시 배치 루프를 조기 중단하여 지연을 방지
    }
    const vec = await embedText(text);
    results.push(vec);
    if (vec.length === 0 && now - lastQuotaExceededTime < 1000) {
      break; // 방금 429가 발생했다면 루프 탈출
    }
    await new Promise(r => setTimeout(r, 50)); // rate-limit guard
  }
  return results;
}

function averageVector(vecs: number[][]): number[] {
  if (vecs.length === 0) return [];
  const dim = vecs[0].length || EMBEDDING_DIM;
  const sum = new Array(dim).fill(0);
  for (const v of vecs) for (let i = 0; i < dim; i++) sum[i] += (v[i] ?? 0);
  return sum.map(x => x / vecs.length);
}

// ─── Quality helpers ─────────────────────────────────────────────────────────
function tagStrategies(title: string): string[] {
  const tags: string[] = [];
  for (const [tag, kws] of Object.entries(STRATEGY_TAGS)) {
    if (kws.some(kw => title.includes(kw))) tags.push(tag);
  }
  return tags;
}

function providerTrust(provider: string): number {
  const p = provider.toLowerCase();
  if (p.includes("dart") || p.includes("fss") || p.includes("공시")) return 1.0;
  if (p.includes("연합인포맥스") || p.includes("한국경제") || p.includes("매일경제") || p.includes("이데일리")) return 0.9;
  if (p.includes("머니투데이") || p.includes("헤럴드경제") || p.includes("서울경제") || p.includes("파이낸셜뉴스")) return 0.8;
  if (p.includes("gnews") || p.includes("newsapi") || p.includes("google")) return 0.7; // general aggregators
  return 0.6; // unknown or general
}

function recencyScore(publishedAt?: string): number {
  if (!publishedAt) return 0.5;
  const ageDays = (Date.now() - new Date(publishedAt).getTime()) / 86400000;
  if (ageDays < 0.25) return 1.0;  // within 6 hours
  if (ageDays < 1)    return 0.85; // within 24 hours
  if (ageDays < 3)    return 0.6;  // within 3 days
  if (ageDays < 7)    return 0.3;  // within a week
  return 0.1;                      // older
}

function computeQualityScore(opts: {
  spamSimilarity: number; trustedSimilarity: number;
  providerTrustScore: number; recency: number;
  strategyTagCount: number; crossConfirmCount: number;
}): number {
  // Stronger rejection of spam
  if (opts.spamSimilarity > 0.8) return 0;
  
  const spamPenalty  = Math.max(0, 1 - opts.spamSimilarity * 1.5); // harsher penalty
  const trustBoost   = opts.trustedSimilarity * 0.35 + opts.providerTrustScore * 0.35;
  const freshness    = opts.recency * 0.15;
  const strategyBonus= Math.min(opts.strategyTagCount * 0.05, 0.10);
  const confirmBonus = Math.min(opts.crossConfirmCount * 0.10, 0.25); // reward cross-source confirmation more
  
  const raw = spamPenalty * 35 + trustBoost * 40 + freshness * 15 + strategyBonus * 5 + confirmBonus * 10;
  return Math.round(Math.max(0, Math.min(100, raw * 2.2))); // slightly scale up
}

function qualityLabel(score: number): "high" | "medium" | "low" | "rejected" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  if (score >= 35) return "low";
  return "rejected";
}

// ─── Deduplicate by embedding ─────────────────────────────────────────────────
function clusterByEmbeddings(items: EmbeddedSource[]): EmbeddedSource[] {
  const clustered: EmbeddedSource[] = [];
  const used = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    if (used.has(items[i].id)) continue;
    const group = [items[i]];
    used.add(items[i].id);
    if (items[i].embedding && items[i].embedding!.length > 0) {
      for (let j = i + 1; j < items.length; j++) {
        if (used.has(items[j].id) || !items[j].embedding) continue;
        if (cosineSimilarity(items[i].embedding!, items[j].embedding!) >= DEDUP_CLUSTER_THRESHOLD) {
          group.push(items[j]);
          used.add(items[j].id);
        }
      }
    }
    const rep = group.sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))[0];
    rep.crossConfirmCount = group.length;
    clustered.push(rep);
  }
  return clustered;
}

// ─── Main export ─────────────────────────────────────────────────────────────
export async function curateSourcesWithEmbedding(
  rawSources: SourceItem[],
  opts: { symbol: string; companyName: string }
): Promise<{ curated: SourceItem[]; embeddedSources: EmbeddedSource[] }> {

  const vectorStore = getVectorStore();

  // ── Step 0: Try to reuse recently curated sources from DB ─────────────────
  try {
    const cached = await vectorStore.getRecentCuratedSources(opts.symbol, FRESHNESS_WINDOW_MS);
    if (cached.length >= 2) {
      console.log(`[Curator] Cache hit: reusing ${cached.length} curated sources for ${opts.symbol}`);
      const sourceItems = cached.map(s => ({
        id: s.id, sourceType: s.sourceType, title: s.title,
        provider: s.provider, collectedAt: s.collectedAt,
        generatedAt: s.publishedAt, url: s.url,
        _qualityScore: s.qualityScore, _qualityLabel: s.qualityLabel,
        _strategyTags: s.strategyTags, _crossConfirmCount: s.crossConfirmCount,
      } as SourceItem & Record<string, any>));
      return { curated: sourceItems, embeddedSources: cached };
    }
  } catch (e) {
    console.warn("[Curator] DB cache read failed (non-fatal):", e);
  }

  // ── Step 1: Persist raw sources first ────────────────────────────────────
  const rawRecords: RawSourceRecord[] = rawSources
    .filter(s => !(s as any)._isMock && s.provider !== "Mock News")
    .map(s => ({
      id: s.id,
      symbol: opts.symbol,
      companyName: opts.companyName,
      sourceType: s.sourceType,
      provider: s.provider,
      title: s.title,
      url: s.url,
      collectedAt: s.collectedAt,
      publishedAt: s.generatedAt,
      isMock: false,
      rawText: s.title,
    }));

  if (rawRecords.length > 0) {
    vectorStore.upsertRawSources(rawRecords).catch(e =>
      console.warn("[Curator] upsertRawSources failed (non-fatal):", e)
    );
  }

  // ── Step 2: If no AI, return pass-through ────────────────────────────────
  if (!ai || rawSources.length === 0) {
    return { curated: rawSources, embeddedSources: [] };
  }

  // ── Step 3: Build EmbeddedSource objects ─────────────────────────────────
  const toEmbed: EmbeddedSource[] = rawSources
    .filter(s => !(s as any)._isMock)
    .map(s => ({
      id: s.id, symbol: opts.symbol, companyName: opts.companyName,
      sourceType: s.sourceType, provider: s.provider, title: s.title,
      rawTextForEmbedding: s.rawTextForEmbedding || s.title,
      url: s.url, collectedAt: s.collectedAt, publishedAt: s.generatedAt,
      strategyTags: tagStrategies(s.title),
      isMock: false,
    }));

  if (toEmbed.length === 0) return { curated: rawSources, embeddedSources: [] };

  // ── Step 4: Embed spam reference → centroid ───────────────────────────────
  const spamEmbeddings = await embedBatch(SPAM_HEADLINES);
  const spamCentroid = averageVector(spamEmbeddings.filter(v => v.length > 0));

  // ── Step 5: Embed each source ─────────────────────────────────────────────
  const sourceEmbeddings = await embedBatch(toEmbed.map(s => s.rawTextForEmbedding));

  // ── Step 6: Score quality ─────────────────────────────────────────────────
  const scored: EmbeddedSource[] = [];
  for (let i = 0; i < toEmbed.length; i++) {
    const vec = sourceEmbeddings[i] || [];
    const item = { ...toEmbed[i], embedding: vec };

    const spamSimilarity = vec.length > 0 && spamCentroid && spamCentroid.length > 0
      ? cosineSimilarity(vec, spamCentroid) : 0;
    const trustedSimilarity = vec.length > 0
      ? await vectorStore.findNearestTrustedCentroid(vec) : 0.5;

    const qScore = computeQualityScore({
      spamSimilarity, trustedSimilarity,
      providerTrustScore: providerTrust(item.provider),
      recency: recencyScore(item.publishedAt),
      strategyTagCount: item.strategyTags?.length ?? 0,
      crossConfirmCount: 0,
    });

    item.qualityScore = qScore;
    item.qualityLabel = qualityLabel(qScore);
    scored.push(item);
  }

  // ── Step 7: Cluster / dedupe ──────────────────────────────────────────────
  const clustered = clusterByEmbeddings(scored);

  // ── Step 8: Filter rejected ───────────────────────────────────────────────
  const curated = clustered
    .filter(s => s.qualityLabel !== "rejected" && (s.qualityScore ?? 0) >= MIN_QUALITY_SCORE)
    .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

  // ── Step 9: Persist to source_embeddings (background) ────────────────────
  const toUpsert = curated.filter(s => s.embedding && s.embedding.length > 0);
  if (toUpsert.length > 0) {
    vectorStore.upsertSourceEmbeddings(toUpsert).catch(e =>
      console.warn("[Curator] upsertSourceEmbeddings failed (non-fatal):", e)
    );
  }

  // ── Step 10: Map back to SourceItem ──────────────────────────────────────
  const curatedSourceItems: SourceItem[] = curated.map(s => ({
    id: s.id, sourceType: s.sourceType, title: s.title,
    provider: s.provider, collectedAt: s.collectedAt, generatedAt: s.publishedAt,
    url: s.url,
    _qualityScore: s.qualityScore, _qualityLabel: s.qualityLabel,
    _strategyTags: s.strategyTags, _crossConfirmCount: s.crossConfirmCount,
  } as SourceItem & Record<string, any>));

  return { curated: curatedSourceItems, embeddedSources: curated };
}
