# Phase 18 Audit — Gemini Multi-Model Routing & Budget Control

## 1. 현재 AI 오케스트레이터 현황

### 문제점

| 항목 | 현재 상태 | 심각도 |
|---|---|---|
| `aiSummarizeIssues()` | OpenAI `gpt-5.5` 사용 중 (GPT 런타임 의존) | 🔴 Phase 18 목표와 불일치 |
| `aiGenerateHomeIntelligence()` | OpenAI `gpt-5.4-mini` 사용 중 (GPT 런타임 의존) | 🔴 Phase 18 목표와 불일치 |
| `aiAnalyzeSentiment()` | Gemini `gemini-2.5-flash` 단일 모델 고정 | 🟡 라우팅 세분화 필요 |
| 홈 인텔리전스 캐시 TTL | 15분 | 🟡 적절하나 stale-while-revalidate 없음 |
| 소스 충분성 검증 | 이진 체크(`isMockSources`)만 존재 | 🟡 소스 품질 점수 없음 |
| 감성 분석 2단계 라우팅 | 없음, 단일 모델 직접 호출 | 🔴 Flash-Lite 사전 필터링 없음 |
| Fallback 이유 분류 | 단순 에러 메시지 문자열 | 🟡 정규화 없음 |
| 개발자 메타 | `createMeta()` 존재하나 source count 없음 | 🟡 확장 필요 |

## 2. Gemini 모델별 역할 분배 계획

| 모델 | 역할 |
|---|---|
| `gemini-2.5-flash-lite` | 소스 필터링, 관련성 체크, 1단계 전처리, 저비용 Fallback |
| `gemini-2.5-flash` | 최종 감성 점수 + 설명, 최종 주식/섹터 트렌딩 설명 |
| `gemini-2.5-flash` | 홈 인텔리전스 최종 생성 |

> 참고: Gemini 2.5 Flash-Lite는 현재 API에서 `gemini-2.5-flash-lite-preview-06-17` 등으로 공개될 수 있으며, 안정적 모델명 확인 후 적용.

## 3. 예산 제어 현황

| 항목 | 현재 | 개선 필요 |
|---|---|---|
| 홈 캐시 TTL | 15분 | stale-while-revalidate 추가 필요 |
| 심볼별 감성 쿨다운 | 없음 | 쿨다운 맵 추가 필요 |
| 소스 부족 시 AI 차단 | 이진 체크만 | 소스 수 기반 최소 임계값 필요 |
| 빈 홈 데이터 방어 | 없음 | 최소 데이터 보장 필요 |

## 4. Phase 18 Action Items

1. **[P0] Orchestrator 전면 재작성** — GPT 제거, Gemini 전용 멀티 모델 라우팅
2. **[P0] 감성 분석 2단계** — Flash-Lite(전처리) → Flash(최종) 구조
3. **[P0] Fallback reason 정규화** — taxonomy 기반 명시적 분류
4. **[P1] 소스 충분성 임계값** — 최소 2개 이상 실제 소스 필요
5. **[P1] 심볼별 쿨다운 캐시** — 동일 심볼 중복 AI 호출 방지
6. **[P1] 홈 캐시 stale-while-revalidate** — 만료 시 백그라운드 갱신
7. **[P2] Dev meta 확장** — sourceCount, cacheDecision, budgetDecision 추가
