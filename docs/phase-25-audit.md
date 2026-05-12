# Phase 25 Audit — Beta Hardening & Release Freeze

## 1. 감사 목적
Phase 24까지의 성과(Trust/Evaluation Layer, Stale-while-revalidate, Saved Workflows, Sector Deepening)를 바탕으로,
Stockker가 실제 베타 테스터에게 공개될 수 있는 품질 수준에 도달했는지를 종합 점검합니다.

---

## 2. 진단 질문에 대한 답변

### 1. 어떤 부분이 이미 베타 준비 완료 상태인가?

| 영역 | 상태 | 근거 |
|---|---|---|
| 홈 인텔리전스 단일 fetch 아키텍처 | ✅ 완료 | `HomeIntelligenceProvider` → `/api/home/intelligence` 단일 호출, in-flight dedup 정상 |
| Metadata-First 종목 헤더 렌더링 | ✅ 완료 | `getStockName(symbol)`로 동기 조회, name/ticker는 AI 응답 전에 즉시 노출 |
| Stale-while-revalidate 스냅샷 재사용 | ✅ 완료 | `model-router.ts` → DB 스냅샷 TTL 체크 + 백그라운드 재생성 |
| 인트라데이 숨김 정책 | ✅ 완료 | 장중 차트/실시간 가격이 AI 판단에서 배제됨 |
| 명시적 저장 전용 정책 | ✅ 완료 | `LocalStorageAdapter`에서 명시적 액션에만 저장 |
| 추천 가드레일 (disclaimer, no imperative) | ✅ 완료 | `AIPicksCard`, `TrendStocksCard`, `TrendSectorsCard`에 disclaimer 존재 |
| 평가 레이어 (Evaluation Layer) | ✅ 완료 | `src/server/research/evals/evaluator.ts` + `npm run test:evals` |
| Ops 메트릭 엔드포인트 | ✅ 완료 | `/api/ops/metrics` — 스냅샷 수, 소스 품질, 큐레이션 비율 추적 |
| 다중 소스 파이프라인 | ✅ 완료 | KIS, DART, GNews, NewsAPI 4-소스 병렬 수집 |
| 소스 페이지네이션 | ✅ 완료 | `SourceListCard` — 출처 목록 페이지네이션 |
| AI/원본 분리 | ✅ 완료 | AI 요약과 원본 소스 섹션이 명확히 분리됨 |
| 섹터 상세: Leaders/Laggards/Watch Candidates | ✅ 완료 | `sector-snapshot-manager.ts` + `page.tsx`에 렌더링 |
| 워크플로우 페이지 3종 | ✅ 구조는 완료 | watchlist/recent/bookmarks 페이지 존재 |
| `validate:full` 스크립트 | ✅ 완료 | `package.json`에 정의됨 |

---

### 2. 어떤 화면이 여전히 약하거나 일관성이 없는가?

#### A. 홈 카드 로딩/빈 상태 혼동
- `TrendStocksCard`, `TrendSectorsCard`, `AIPicksCard`: `trending.length === 0`일 때 "불러오는 중..."만 노출.
  - `isLoading=true`(실제 로딩 중) vs. `isLoading=false` + 빈 배열(데이터 없음)을 구분하지 않아,
    실제 빈 데이터와 로딩 중 상태가 사용자에게 동일하게 보임.
- 에러 상태(`error !== null`)도 카드 레벨에서 처리되지 않음.

#### B. `RecentResearchBoard` 스테일 클로저 버그 (critical)
- `useEffect` 안에서 `list`를 `setRecentSymbols(list)`로 세팅 후 `fetchAll`에서 `recentSymbols`(상태)를 참조.
  - 상태 업데이트는 비동기이므로 `fetchAll` 실행 시점에 `recentSymbols`는 여전히 빈 배열(`[]`).
  - 결과: `/api/stocks/{symbol}/sentiment`를 아무 symbol도 없이 호출하지 않아 카드가 항상 비어 보임.

#### C. `BookmarksResearchBoard` 동일한 버그
- 동일한 스테일 클로저 패턴: `bookmarks`(상태) 대신 `list`를 직접 사용해야 함.

#### D. `AIPicksCard`의 candidateCategory 미표시
- AI 프롬프트에서 `event_driven | momentum | undervalued` 분류를 생성하지만 UI에 노출하지 않음.
  - 베타 신뢰도에 필요한 "왜 이 종목이 포착되었는가"의 분류 근거가 숨겨져 있음.

#### E. 홈 footer 면책 문구 오류
- `src/app/page.tsx` 하단: "본 서비스의 정보는 **AI 모킹 스텁 데이터**이며 투자 권유를 구하지 않습니다."
  - 베타 사용자에게 "이건 가짜 데이터입니다"라고 선언하는 것과 동일. 즉시 수정 필요.

#### F. 섹터 상세 페이지 snapshot null 시 UX
- `getSectorSnapshot` → null 시 `generateSectorSnapshot` 동기 호출 (blocking SSR).
  - 여러 대표 종목에 대해 `generateIssues`를 순차 루프로 돌리므로 첫 진입 시 수 십 초 대기 가능.
  - fallback이나 "생성 중" 안내 UI 없음.

#### G. Workflow 페이지의 컨텍스트 부족
- `/workflows/recent`, `/workflows/bookmarks` 페이지는 제목/설명만 있고,
  어떻게 이 목록에 항목을 추가하는지 안내가 전혀 없음.
  - 목록이 비어 있을 때 사용자가 왜 비어 있는지 알 수 없음.

---

### 3. 어떤 로딩 상태가 여전히 혼란스러운가?

| 컴포넌트 | 문제 |
|---|---|
| `TrendStocksCard` | 로딩 중 / 데이터 없음 / 에러 모두 "불러오는 중..."으로 동일 |
| `TrendSectorsCard` | 동일 |
| `AIPicksCard` | 동일 |
| `TrendIssuesCard` | 동일 |
| `RecentResearchBoard` | 버그로 인해 항상 "데이터 없음" 또는 무한 로딩 상태 |
| `BookmarksResearchBoard` | 동일 |

---

### 4. 어떤 저장 워크플로우가 약한가?

| 워크플로우 | 문제 |
|---|---|
| `/workflows/recent` | `RecentResearchBoard` 스테일 클로저 버그로 감성 데이터를 fetch하지 못함 |
| `/workflows/bookmarks` | `BookmarksResearchBoard` 동일한 버그 |
| 두 페이지 모두 | 빈 상태에서 "어떻게 항목을 추가하나요?" 안내 없음 |
| 두 페이지 모두 | 항목 제거 기능 없음 (제거 버튼 미구현) |

---

### 5. 회귀 위험이 높은 페이지/컴포넌트는?

| 영역 | 위험 요인 |
|---|---|
| `HomeIntelligenceProvider` | 다른 카드에서 별도 fetch를 추가할 경우 단일 fetch 아키텍처 붕괴 |
| `model-router.ts` | `generateIssues`의 DB-first 로직 변경 시 외부 API 폭주 위험 |
| `stock-report-header.tsx` | `addRecentViewed` 호출 위치가 바뀌면 저장 정책 위반 |
| `sector-snapshot-manager.ts` | TTL 만료 시 동기 재생성 로직이 페이지 응답을 blocking |
| `orchestrator.ts` | `sentimentCooldown` Map이 서버 재시작 시 초기화됨 (메모리-only) |

---

### 6. 베타 테스터/개발자용 문서 중 아직 불명확한 것은?

| 문서 | 현재 상태 |
|---|---|
| `docs/setup.md` | "Phase 12" 헤더, 구버전 env var 목록만 있음. Gemini, GNews, NewsAPI, Supabase 설정 누락 |
| `README.md` | 잘못된 Next.js 버전("Next.js 15" → 실제 16.1.6), Gemini 모델명 부정확("1.5 Flash" → 2.5) |
| 베타 릴리즈 체크리스트 | 미존재 |
| Known Issues 문서 | 미존재 |
| Release Freeze Rules | 미존재 |
| Ops Playbook | 미존재 |

---

### 7. 더 이상 건드려서는 안 되는 항목 (동결 항목)?

- **Intraday hidden policy**: `chartMode` 설정값 변경 또는 실시간 차트 컴포넌트 재도입 금지
- **Home single-fetch architecture**: `/api/home/intelligence` 외에 카드별 fetch 추가 금지
- **Explicit save-only policy**: `addRecentViewed` 등 저장 함수를 자동/묵시적으로 호출하는 패턴 금지
- **Detail-entry rate-limit protection**: 종목 상세 진입 시 KIS/DART 동기 병렬 호출 금지
- **Source pagination**: `SourceListCard`의 페이지네이션 로직 제거 금지
- **AI/source separation**: AI 요약을 원본 소스 섹션에 혼합하는 리팩토링 금지
- **Recommendation disclaimer**: `AIPicksCard`, `TrendStocksCard`, `TrendSectorsCard`에서 disclaimer 제거 금지

---

## 3. Phase 25 수정 우선순위 요약

| 우선순위 | 항목 | 유형 |
|---|---|---|
| P0 | `RecentResearchBoard` 스테일 클로저 버그 수정 | 버그 |
| P0 | `BookmarksResearchBoard` 동일 버그 수정 | 버그 |
| P0 | 홈 footer 면책 문구 수정 (모킹 스텁 → 정상 면책) | 신뢰성 |
| P1 | 홈 카드 로딩/빈/에러 상태 구분 | UX |
| P1 | `AIPicksCard` candidateCategory 배지 추가 | 투명성 |
| P1 | `docs/setup.md` 업데이트 | 문서 |
| P1 | `README.md` 버전/모델명 정정 | 문서 |
| P2 | `docs/beta-release-checklist.md` 생성 | 릴리즈 |
| P2 | `docs/known-issues.md` 생성 | 릴리즈 |
| P2 | `docs/release-freeze-rules.md` 생성 | 릴리즈 |
| P2 | `docs/ops-playbook.md` 생성 | 릴리즈 |
| P2 | `docs/architecture.md` Phase 25 업데이트 | 문서 |
| P3 | Workflow 빈 상태에 추가 안내 개선 | UX |
