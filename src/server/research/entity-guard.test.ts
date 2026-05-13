import { describe, expect, it } from "vitest";
import type { IssueCluster, SourceItem } from "@/types/research";
import {
  filterClustersForSymbol,
  filterSourcesForSymbol,
  getEvidenceState,
  hasUsableSnapshotEvidence,
} from "./entity-guard";

function source(id: string, title: string): SourceItem {
  return {
    id,
    title,
    sourceType: "news",
    provider: "News",
    collectedAt: new Date().toISOString(),
    generatedAt: new Date().toISOString(),
  };
}

function cluster(id: string, title: string, basisSourceIds: string[]): IssueCluster {
  return {
    id,
    title,
    summary: title,
    sentiment: "neutral",
    representativeSource: "News",
    sourceCount: basisSourceIds.length,
    basisSourceIds,
    timestamp: new Date().toISOString(),
  };
}

describe("entity guard", () => {
  it("keeps LIG alias sources and blocks unrelated semiconductor sources", () => {
    const sources = [
      source("lig", "LIG넥스원, 방산 수출 기대감 확대"),
      source("semi", "삼성전자 HBM 반도체 수주 기대"),
    ];

    const filtered = filterSourcesForSymbol(sources, "079550");

    expect(filtered.map(item => item.id)).toEqual(["lig"]);
  });

  it("drops issue clusters backed only by invalid source ids", () => {
    const sources = [source("valid", "현대차 전기차 판매 회복")];
    const clusters = [
      cluster("valid-cluster", "현대차 판매 회복", ["valid"]),
      cluster("bad-cluster", "반도체 업황 회복", ["missing"]),
    ];

    const filtered = filterClustersForSymbol(clusters, sources, "005380");

    expect(filtered.map(item => item.id)).toEqual(["valid-cluster"]);
  });

  it("classifies weak report evidence without live wording", () => {
    expect(getEvidenceState(3).label).toBe("근거 충분");
    expect(getEvidenceState(1).label).toBe("근거 부족");
    expect(getEvidenceState(0).label).toBe("최신 데이터 없음");
  });

  it("rejects fallback or single-source snapshots", () => {
    expect(hasUsableSnapshotEvidence({ basis_source_ids: ["a"], is_fallback: false })).toBe(false);
    expect(hasUsableSnapshotEvidence({ basis_source_ids: ["a", "b"], is_fallback: true })).toBe(false);
    expect(hasUsableSnapshotEvidence({ basis_source_ids: ["a", "b"], is_fallback: false })).toBe(true);
  });
});
