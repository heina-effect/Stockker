import { IssueCluster } from "@/types/research";
import { mockReportSummary } from "../mock-data";

export async function summarizeIssues(symbol: string, topIssues: IssueCluster[]) {
    void topIssues;
    // Phase 12/13: In the future, send topIssues to Gemini for summary.
    // For now, we still use mockReportSummary but we can enrich it if we want.
    return mockReportSummary(symbol);
}
