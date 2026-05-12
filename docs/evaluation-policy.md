# AI Evaluation Policy

## 1. 목적 (Purpose)
Stockker의 AI 리서치 결과물(종목 요약, 감성 분석, 이슈 클러스터, 홈 인텔리전스, 섹터 요약, 추천 후보)이 **사용자에게 제공되기 전 또는 백그라운드 품질 검증 시점에** 신뢰할 수 있는지 기계적으로 평가하는 기준을 정의합니다.

## 2. 평가 차원 (Evaluation Dimensions)
1. **근거 확인 (Grounding)**: AI가 생성한 요약, 이슈, 추천 사유가 원본 소스(`SourceItem`)에 존재하는 사실에 기반하는가? (환각/Hallucination 방지)
2. **오분류 검증 (Relevance/Wrong-Company)**: 다른 회사나 다른 섹터의 뉴스가 혼입되지 않았는가?
3. **최신성 (Recency / Stale-source)**: 너무 오래된 뉴스를 바탕으로 "지금 주목받는" 것처럼 포장하지 않았는가?
4. **출처 충분성 (Source Sufficiency)**: 신뢰할 만한 요약을 생성할 만큼 충분한 양의 소스가 존재하는가? (부족한 경우 Fail/Fallback 처리)
5. **면책 조항 (Disclaimer Presence)**: 추천 성격의 콘텐츠에 반드시 법적 면책 조항(Disclaimer)과 투자 위험 고지(Risk Note)가 포함되어 있는가?

## 3. 평가 파이프라인 (Evaluation Pipeline)
평가 파이프라인은 주로 단위 테스트(`test:evals`)나 백그라운드 배치(Ops)로 실행됩니다.

- **입력**: AI 생성물 JSON, 생성에 사용된 `SourceItem` 목록
- **검증 로직**: `src/server/research/evals/evaluator.ts`
- **임계값 (Pass/Fail Thresholds)**:
  - Grounding Score: 80% 이상 Pass
  - Wrong-Company: 혼입 발견 시 즉시 Fail
  - Disclaimer: 정규표현식 일치 확인 (필수 포함)
  - Source Sufficiency: 최소 3개 이상의 신뢰할 수 있는 소스 필요

## 4. 조치 (Actions on Failure)
평가에서 Fail 판정을 받은 데이터는:
1. 클라이언트에게 노출되지 않습니다.
2. 스냅샷(DB)에 저장되지 않습니다.
3. Fallback 메시지(예: "해당 섹터에 대한 분석 중 오류가 발생했습니다.")로 대체됩니다.
4. 실패 사유는 내부 Ops Metrics에 기록됩니다.
