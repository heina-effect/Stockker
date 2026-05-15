# Stockker Phase 18 Report — Gemini-Only Multi-Model Routing & Budget Control

## 1. 개요
Phase 18의 핵심 목표는 "모든 AI 호출을 Gemini Free Tier로 최적화"입니다.
OpenAI 런타임 경로를 일시 중단(GPT 파즈)하고, Gemini 모델을 기능별로 세분화하여 할당량(Quota) 낭비를 최소화했습니다.

---

## 2. 런타임 모델 정책 (Gemini-Only)

| 역할 | 모델 | 설명 |
|---|---|---|
| **Stage 1 전처리** | `gemini-2.5-flash-lite` | 소스 관련성 필터링, 후보군 추출 |
| **Stage 2 최종 생성** | `gemini-2.5-flash` | 감성 분석, 리포트 요약, 홈 인텔리전스 |
| GPT / OpenAI | **PAUSED** | Phase 18에서 런타임 비활성화 |

> Claude Sonnet 4.6은 구현 에이전트(Implementation Agent)로만 사용됩니다. 제품 런타임 모델이 아닙니다.

---

## 3. 주요 개선 내역

### 3.1 Orchestrator 전면 재작성 (`orchestrator.ts`)

**[P0] GPT 의존성 완전 제거**
- `OpenAI` 클라이언트 import 및 호출 모두 제거
- `aiSummarizeIssues()`, `aiGenerateHomeIntelligence()` 모두 Gemini Flash로 전환

**[P0] 감성 분석 2단계 라우팅**
- Stage 1: `gemini-2.5-flash-lite` — 소스 관련성 체크 (저비용 전처리)
- Stage 2: `gemini-2.5-flash` — 최종 감성 점수 + 출처 매핑 (고품질 생성)
- Stage 1 실패 시 비치명적(non-fatal) 처리 — 전체 소스로 Stage 2 진행

**[P0] Fallback 이유 정규화 (Taxonomy)**
```
no_api_key | source_empty | source_insufficient | source_poor_quality
cooldown_active | relevance_mismatch | quota_exceeded | rate_limited
timeout | schema_error | provider_unavailable | budget_guard_blocked | mock_detected
```

**[P1] 예산 제어 레이어**
- `MIN_REAL_SOURCES = 2`: 실제 소스 2개 미만이면 AI 호출 차단
- `SENTIMENT_COOLDOWN_MS = 5분`: 동일 심볼 중복 감성 호출 방지
- `classifyError()`: HTTP 상태 코드 기반 자동 Fallback 이유 분류

**[P2] Dev Meta 확장**
- `sourceCount`: 감성 분석에 사용된 실제 소스 수
- `cacheDecision`: hit/miss/stale
- `budgetDecision`: stage1+stage2 또는 stage2-only

### 3.2 홈 캐시 Stale-While-Revalidate (`home-cache.ts`)

| 상태 | TTL | 동작 |
|---|---|---|
| Fresh | 0~15분 | 캐시 즉시 반환 (`_cacheState: "hit"`) |
| Stale | 15~20분 | 캐시 반환 + 백그라운드 갱신 (`_cacheState: "stale"`) |
| Expired | 20분+ | 반드시 대기 후 신선 데이터 반환 |
| AI 실패 | 모든 경우 | Stale 있으면 Stale, 없으면 Mock |

**효과**: 홈 화면이 AI 갱신을 기다리는 동안 절대 빈 화면을 보이지 않음.

### 3.3 홈 Dev 배지 강화

- `Model`, `Latency`, `Budget` (stage1+2 또는 stage2-only), `Cache` (hit/stale/miss) 표시
- Provider 필드 제거 (Gemini 단일화로 불필요)

---

## 4. Gemini Free Tier 소비 절감 효과

| Before | After |
|---|---|
| GPT-5.5 + Gemini 2.5 Flash 각각 호출 | Gemini 단일 공급자 |
| Mock 소스가 있어도 Gemini 6740ms 소비 | 소스 2개 미만 시 AI 즉시 차단 |
| 동일 심볼 반복 클릭 시 매번 AI 호출 | 5분 쿨다운으로 중복 차단 |
| 홈 카드마다 개별 호출 가능성 | 단일 엔드포인트 + SWR 캐시 |
| 홈 Stage 1/2 없음 | Flash-Lite Stage 1 전처리로 Flash 입력 품질 향상 |

---

## 5. 향후 과제 (Phase 19+)
- `gemini-2.5-flash-lite` 모델명 정식 출시 확인 후 최신화
- 소스 충분성 점수화 (이진 체크 → 수치 기반 품질 점수)
- 소스 페이지네이션 프론트엔드 "더 보기" UI
- Gemini Embedding API 활용 (섹터 유사도, 클러스터링)
- Pro path (사용자 명시 트리거) 설계
