export interface EvaluationResult {
  passed: boolean;
  score: number;       // 0 to 100
  dimensions: {
    grounding: number;
    relevance: number;
    recency: number;
    sufficiency: number;
    hallucinationRisk: number;
  };
  failures: string[];  // List of reasons if failed
}

export interface EvaluationInput {
  targetSymbol?: string;
  targetSectorName?: string;
  generatedContent: string;  // Stringified JSON or text
  sources: Array<{ title: string; provider: string; collectedAt: string; symbol?: string }>;
  requireDisclaimer?: boolean;
}
