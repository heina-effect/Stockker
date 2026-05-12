import { EvaluationInput, EvaluationResult } from "@/types/evals";

const DISCLAIMER_PHRASES = ["투자 판단", "책임은", "원금 손실"];
const IMPERATIVE_PHRASES = ["매수 추천", "강력 매수", "사야", "팔아"];

/**
 * AI가 생성한 결과물을 평가합니다.
 */
export function evaluateAIOutput(input: EvaluationInput): EvaluationResult {
  const failures: string[] = [];
  const dims = { grounding: 100, relevance: 100, recency: 100, sufficiency: 100, hallucinationRisk: 0 };

  // 1. Source Sufficiency
  if (!input.sources || input.sources.length < 2) {
    dims.sufficiency = 0;
    failures.push("출처 부족 (최소 2개 이상의 소스 필요)");
  } else if (input.sources.length < 4) {
    dims.sufficiency = 60;
  }

  // 2. Relevance (Wrong-Company / Wrong-Sector)
  // Check if target symbol is provided but sources belong to other symbols entirely
  if (input.targetSymbol) {
    const wrongSymbolCount = input.sources.filter(s => s.symbol && s.symbol !== input.targetSymbol).length;
    if (wrongSymbolCount > input.sources.length / 2) {
      dims.relevance = 0;
      failures.push("오분류 혼입: 다른 종목의 뉴스가 과반수입니다.");
    }
  }

  // 3. Recency (Stale-source)
  const now = Date.now();
  const oldSources = input.sources.filter(s => {
    const ageDays = (now - new Date(s.collectedAt).getTime()) / 86400000;
    return ageDays > 3; // older than 3 days
  });
  if (oldSources.length > input.sources.length * 0.7) {
    dims.recency = 0;
    failures.push("최신성 부족: 3일 이상 지난 뉴스가 대부분입니다.");
  }

  // 4. Disclaimer & Guardrails
  const text = input.generatedContent || "";
  
  if (input.requireDisclaimer) {
    const hasDisclaimer = DISCLAIMER_PHRASES.some(phrase => text.includes(phrase));
    if (!hasDisclaimer) {
      dims.hallucinationRisk = 100;
      failures.push("안전 가드레일 누락: 면책 조항(Disclaimer)이 없습니다.");
    }
  }

  const hasImperative = IMPERATIVE_PHRASES.some(phrase => text.includes(phrase));
  if (hasImperative) {
    dims.hallucinationRisk = 100;
    failures.push("안전 가드레일 위반: 지시적/권유적 표현이 포함되어 있습니다.");
  }

  // Calculate final score
  const score = Math.round(
    (dims.grounding * 0.3) + 
    (dims.relevance * 0.3) + 
    (dims.recency * 0.2) + 
    (dims.sufficiency * 0.2) - 
    (dims.hallucinationRisk)
  );

  const passed = score >= 60 && failures.length === 0;

  return { passed, score: Math.max(0, score), dimensions: dims, failures };
}
