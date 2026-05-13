/**
 * Vector Store — Phase 20
 *
 * @supabase/supabase-js 기반으로 교체.
 * 환경변수가 없으면 In-Memory fallback으로 동작.
 *
 * 키 정책:
 * - 서버 쓰기/관리: SUPABASE_SERVICE_ROLE_KEY (server-only)
 * - 클라이언트 읽기: NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { getSupabaseAdmin } from "@/lib/supabase/client";

export interface EmbeddedSource {
  id: string;
  symbol: string;
  companyName: string;
  sourceType: "news" | "disclosure" | "analyst";
  provider: string;
  title: string;
  snippet?: string;
  rawTextForEmbedding: string;
  url?: string;
  collectedAt: string;
  publishedAt?: string;
  embedding?: number[]; // 768-dim, text-embedding-004
  qualityScore?: number;
  qualityLabel?: "high" | "medium" | "low" | "rejected";
  strategyTags?: string[];
  clusterGroup?: string;
  crossConfirmCount?: number;
  isMock?: boolean;
}

export interface RawSourceRecord {
  id: string;
  symbol: string;
  companyName?: string;
  sourceType: "news" | "disclosure" | "analyst";
  provider: string;
  title: string;
  url?: string;
  collectedAt: string;
  publishedAt?: string;
  isMock?: boolean;
  rawText?: string;
}

export interface VectorStoreAdapter {
  upsertSourceEmbeddings(items: EmbeddedSource[]): Promise<void>;
  upsertRawSources(items: RawSourceRecord[]): Promise<void>;
  searchSimilarSources(queryVector: number[], filters: { symbol?: string; limit?: number }): Promise<EmbeddedSource[]>;
  fetchSourceCluster(seedId: string): Promise<EmbeddedSource[]>;
  findNearestTrustedCentroid(vector: number[]): Promise<number>;
  findNearestSpamCentroid(vector: number[]): Promise<number>;
  getRecentCuratedSources(symbol: string, maxAgeMs?: number): Promise<EmbeddedSource[]>;
  getGlobalRecentCuratedSources(limit?: number): Promise<EmbeddedSource[]>;
  getSourcesByIds(ids: string[]): Promise<EmbeddedSource[]>;
}

// ─── In-Memory Fallback ───────────────────────────────────────────────────────
class InMemoryVectorAdapter implements VectorStoreAdapter {
  private embedStore: EmbeddedSource[] = [];
  private rawStore: RawSourceRecord[] = [];

  async upsertSourceEmbeddings(items: EmbeddedSource[]): Promise<void> {
    for (const item of items) {
      const idx = this.embedStore.findIndex(s => s.id === item.id);
      if (idx >= 0) this.embedStore[idx] = item;
      else this.embedStore.push(item);
    }
  }

  async upsertRawSources(items: RawSourceRecord[]): Promise<void> {
    for (const item of items) {
      const idx = this.rawStore.findIndex(s => s.id === item.id);
      if (idx >= 0) this.rawStore[idx] = item;
      else this.rawStore.push(item);
    }
  }

  async searchSimilarSources(queryVector: number[], filters: { symbol?: string; limit?: number }): Promise<EmbeddedSource[]> {
    let results = this.embedStore.filter(s =>
      !s.isMock && (!filters.symbol || s.symbol === filters.symbol)
    );
    if (queryVector.length > 0) {
      results = results
        .map(s => ({ item: s, sim: (s.embedding && s.embedding.length > 0) ? cosineSimilarity(queryVector, s.embedding) : 0 }))
        .sort((a, b) => b.sim - a.sim)
        .map(r => r.item);
    }
    return results.slice(0, filters.limit || 10);
  }

  async fetchSourceCluster(seedId: string): Promise<EmbeddedSource[]> {
    const seed = this.embedStore.find(s => s.id === seedId);
    if (!seed?.embedding || seed.embedding.length === 0) return [];
    const seedVec = seed.embedding;
    return this.embedStore.filter(s =>
      s.id !== seedId && s.symbol === seed.symbol &&
      s.embedding && s.embedding.length > 0 &&
      cosineSimilarity(seedVec, s.embedding) >= 0.85
    );
  }

  async findNearestTrustedCentroid(_vector: number[]): Promise<number> { return 0.6; }
  async findNearestSpamCentroid(_vector: number[]): Promise<number> { return 0.1; }

  async getRecentCuratedSources(symbol: string, maxAgeMs = 30 * 60 * 1000): Promise<EmbeddedSource[]> {
    const cutoff = Date.now() - maxAgeMs;
    return this.embedStore.filter(s =>
      s.symbol === symbol &&
      !s.isMock &&
      s.qualityLabel !== "rejected" &&
      new Date(s.collectedAt).getTime() > cutoff
    ).sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
  }

  async getSourcesByIds(ids: string[]): Promise<EmbeddedSource[]> {
    const idSet = new Set(ids);
    return this.embedStore.filter(s => idSet.has(s.id));
  }

  async getGlobalRecentCuratedSources(limit = 20): Promise<EmbeddedSource[]> {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000; // 6 hours
    return this.embedStore.filter(s =>
      !s.isMock &&
      s.qualityLabel !== "rejected" &&
      new Date(s.collectedAt).getTime() > cutoff
    ).sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)).slice(0, limit);
  }
}

// ─── Supabase pgvector Adapter ─────────────────────────────────────────────
class SupabaseVectorAdapter implements VectorStoreAdapter {
  async upsertRawSources(items: RawSourceRecord[]): Promise<void> {
    const db = getSupabaseAdmin();
    if (!db || items.length === 0) return;

    const rows = items.map(item => ({
      id: item.id,
      symbol: item.symbol,
      company_name: item.companyName,
      source_type: item.sourceType,
      provider: item.provider,
      title: item.title,
      url: item.url,
      collected_at: item.collectedAt,
      published_at: item.publishedAt,
      is_mock: item.isMock ?? false,
      raw_text: item.rawText,
    }));

    const { error } = await db.from("news_sources").upsert(rows, { onConflict: "id" });
    if (error) console.warn("[VectorStore] upsertRawSources error:", error.message);
  }

  async upsertSourceEmbeddings(items: EmbeddedSource[]): Promise<void> {
    const db = getSupabaseAdmin();
    if (!db || items.length === 0) return;

    const rows = items.map(item => ({
      id: item.id,
      symbol: item.symbol,
      company_name: item.companyName,
      source_type: item.sourceType,
      provider: item.provider,
      title: item.title,
      snippet: item.snippet,
      raw_text: item.rawTextForEmbedding,
      url: item.url,
      collected_at: item.collectedAt,
      published_at: item.publishedAt,
      embedding: item.embedding,
      embedding_model: "gemini-embedding-001",
      embedding_dim: 3072,
      quality_score: item.qualityScore,
      quality_label: item.qualityLabel,
      strategy_tags: item.strategyTags,
      cluster_group: item.clusterGroup,
      cross_confirm_count: item.crossConfirmCount ?? 0,
      is_mock: item.isMock ?? false,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await db.from("source_embeddings").upsert(rows, { onConflict: "id" });
    if (error) console.warn("[VectorStore] upsertSourceEmbeddings error:", error.message);
  }

  async searchSimilarSources(queryVector: number[], filters: { symbol?: string; limit?: number }): Promise<EmbeddedSource[]> {
    const db = getSupabaseAdmin();
    if (!db) return [];

    const { data, error } = await db.rpc("match_source_embeddings", {
      query_embedding: queryVector,
      match_symbol: filters.symbol ?? null,
      match_count: filters.limit ?? 10,
      match_threshold: 0.7,
    });

    if (error) {
      console.warn("[VectorStore] searchSimilarSources error:", error.message);
      return [];
    }
    return (data || []).map(mapRowToEmbeddedSource);
  }

  async fetchSourceCluster(seedId: string): Promise<EmbeddedSource[]> {
    const db = getSupabaseAdmin();
    if (!db) return [];

    const { data, error } = await db.rpc("fetch_source_cluster", { seed_id: seedId, threshold: 0.85 });
    if (error) return [];
    return (data || []).map(mapRowToEmbeddedSource);
  }

  async findNearestTrustedCentroid(vector: number[]): Promise<number> {
    const db = getSupabaseAdmin();
    if (!db) return 0.6;
    try {
      const { data } = await db.rpc("nearest_centroid", { query_embedding: vector, centroid_type: "trusted" });
      return data?.[0]?.similarity ?? 0.6;
    } catch { return 0.6; }
  }

  async findNearestSpamCentroid(vector: number[]): Promise<number> {
    const db = getSupabaseAdmin();
    if (!db) return 0.1;
    try {
      const { data } = await db.rpc("nearest_centroid", { query_embedding: vector, centroid_type: "spam" });
      return data?.[0]?.similarity ?? 0.1;
    } catch { return 0.1; }
  }

  async getRecentCuratedSources(symbol: string, maxAgeMs = 30 * 60 * 1000): Promise<EmbeddedSource[]> {
    const db = getSupabaseAdmin();
    if (!db) return [];

    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const { data, error } = await db
      .from("source_embeddings")
      .select("*")
      .eq("symbol", symbol)
      .eq("is_mock", false)
      .neq("quality_label", "rejected")
      .gte("collected_at", cutoff)
      .order("quality_score", { ascending: false })
      .limit(15);

    if (error) {
      console.warn("[VectorStore] getRecentCuratedSources error:", error.message);
      return [];
    }

    // Deduplicate by title
    const seenTitles = new Set<string>();
    const uniqueSources = [];
    for (const row of (data || [])) {
      const titleKey = row.title.replace(/\s+/g, "").toLowerCase();
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        uniqueSources.push(mapRowToEmbeddedSource(row));
      }
    }
    return uniqueSources;
  }

  async getGlobalRecentCuratedSources(limit = 20): Promise<EmbeddedSource[]> {
    const db = getSupabaseAdmin();
    if (!db) return [];

    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("source_embeddings")
      .select("*")
      .eq("is_mock", false)
      .neq("quality_label", "rejected")
      .gte("collected_at", cutoff)
      .order("quality_score", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[VectorStore] getGlobalRecentCuratedSources error:", error.message);
      return [];
    }

    // Deduplicate by title
    const seenTitles = new Set<string>();
    const uniqueSources = [];
    for (const row of (data || [])) {
      const titleKey = row.title.replace(/\s+/g, "").toLowerCase();
      if (!seenTitles.has(titleKey)) {
        seenTitles.add(titleKey);
        uniqueSources.push(mapRowToEmbeddedSource(row));
      }
    }
    return uniqueSources;
  }

  async getSourcesByIds(ids: string[]): Promise<EmbeddedSource[]> {
    if (ids.length === 0) return [];
    const db = getSupabaseAdmin();
    if (!db) return [];

    const { data, error } = await db
      .from("source_embeddings")
      .select("*")
      .in("id", ids);

    if (error) {
      console.warn("[VectorStore] getSourcesByIds error:", error.message);
      return [];
    }
    return (data || []).map(mapRowToEmbeddedSource);
  }
}

// ─── Row mapper ───────────────────────────────────────────────────────────────
function mapRowToEmbeddedSource(row: any): EmbeddedSource {
  return {
    id: row.id,
    symbol: row.symbol,
    companyName: row.company_name,
    sourceType: row.source_type,
    provider: row.provider,
    title: row.title,
    snippet: row.snippet,
    rawTextForEmbedding: row.raw_text ?? "",
    url: row.url,
    collectedAt: row.collected_at,
    publishedAt: row.published_at,
    embedding: row.embedding,
    qualityScore: row.quality_score,
    qualityLabel: row.quality_label,
    strategyTags: row.strategy_tags,
    clusterGroup: row.cluster_group,
    crossConfirmCount: row.cross_confirm_count,
    isMock: row.is_mock,
  };
}

// ─── Cosine Similarity ────────────────────────────────────────────────────────
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Factory ─────────────────────────────────────────────────────────────────
let _adapter: VectorStoreAdapter | null = null;

export function getVectorStore(): VectorStoreAdapter {
  if (_adapter) return _adapter;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    console.log("[VectorStore] ✅ Using Supabase pgvector adapter");
    _adapter = new SupabaseVectorAdapter();
  } else {
    console.log("[VectorStore] ⚠️  Supabase not configured — using in-memory adapter");
    _adapter = new InMemoryVectorAdapter();
  }

  return _adapter;
}
