import { IssueItem } from "@/types/research";

export function rankAndCluster(issues: IssueItem[]): IssueItem[] {
    // 1. Sort by latest
    const sorted = issues.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // 2. Select top 10
    return sorted.slice(0, 10);
}
