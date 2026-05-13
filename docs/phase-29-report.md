# Phase 29 — 마스터 데이터 정착, 신호 정확도 개선, 증권사 투자의견 카드, 섹터 랭킹 고도화

## 배경

Phase 28에서 `stock_master`, `sector_master` DB 테이블과 `db-registry.ts` 서버 레지스트리를 완성해 하드코딩 의존을 줄였다. Phase 29에서는 그 위에서 실제 사용자에게 영향을 주는 품질 문제를 개선하고, 증권사별 투자의견 카드라는 신규 기능을 추가한다.

---

## 완료된 작업

### A. 잔존 하드코딩 정리

**`src/server/research/model-router.ts`**
- `STOCK_UNIVERSE` import 제거 (Phase 28에서 서버 코드 전환 후 남아 있던 unused import)

---

### B. 신호 정확도 개선 — `src/server/research/pipeline/normalize.ts`

**문제**: 2자 prefix 매칭이 너무 느슨해 에이프릴바이오 검색 시 에이비엘바이오 등 다른 "에이"계 바이오 종목 이슈가 섞이는 현상 발생.

**변경 내용**:

| 항목 | 이전 | 이후 |
|---|---|---|
| 4자 이상 한국어 회사명 prefix 길이 | 2자 | 3자 |
| 2-3자 한국어 회사명 prefix | 2자 | 2자 (유지) |
| 공시(disclosure) sourceType | prefix 허용 | 전체 이름 필수 (오탐 多) |

예시:
- `에이프릴바이오` (5자) → prefix `에이프릴` (4자)로 필터링 → `에이비엘` 이슈 차단
- `삼성전자` (4자) → prefix `삼성전` (3자) → 기존 `삼성`보다 좁은 범위지만 삼성SDI 이슈도 일부 통과하던 문제 개선

---

### C. 증권사별 투자의견 카드 신규 추가

**신규 파일:**
- `src/server/kis/analyst-opinion.ts` — KIS Open API `FHKST66430300` 래퍼
  - `getStockAnalystOpinions(symbol)` — 최근 90일 증권사별 투자의견 조회
  - 1시간 캐싱 (`withDedupeAndCache`)
  - 404/미지원 종목 silent fallback
- `src/app/api/stocks/[symbol]/analyst-opinion/route.ts` — REST endpoint
  - 투자의견 + 현재가(KIS quote) 병렬 조회
- `src/components/report/analyst-opinion-card.tsx` — 클라이언트 카드 컴포넌트

**표시 항목:**
- 요약 배너: 평균 목표가 / 현재가 대비 괴리율 / 최근 30일 업데이트 수
- 증권사별 행: 증권사명, 날짜, 투자의견, 목표주가, 직전 대비 변화(▲/▼)
- 투자의견 색상 코딩: 강력매수(빨강) ~ 매도(파랑)

**페이지 배치**: `src/app/stocks/[symbol]/page.tsx` 우측 컬럼, IssueTimelineCard 바로 아래

**타입**: `AnalystOpinionItem`, `AnalystOpinionSummary` → `src/types/research.ts`에 추가

**KIS API 미지원 종목 처리**: 빈 items 배열 반환 → 카드 자체가 렌더링 안 됨 (`if (!loading && !error && !hasData) return null`)

---

### D. 섹터 랭킹 고도화 — 시장 신호 기반 보정

**신규 파일**: `src/server/research/sector-momentum.ts`

```typescript
computeSectorMomentumSignals(sectorUniverse)  // 섹터별 대표 종목 changeRate 평균 계산
applyMomentumSignals(sectors, signals)         // AI trendStrength를 시장 신호로 보정
```

**알고리즘**:
1. 섹터별 대표 종목 최대 2개에 대해 KIS 현재가 병렬 조회
2. `avgChangeRate` 계산 → `-5 ~ +5` 범위 보너스/패널티로 변환
3. AI 출력 `trendStrength`에 적용 후 재정렬

**특징**:
- `home-cache.ts` refreshCache() 내에서 non-blocking으로 실행 (실패 시 원본 유지)
- `_marketSignal: { avgChangeRate, symbolsChecked }` 필드로 디버깅 가능
- 장 마감 시간(시세 변동 없음)에도 이전 캐시된 시세 활용

**`src/server/ai/home-cache.ts` 변경**:
- `computeSectorMomentumSignals` + `applyMomentumSignals` 호출 추가

---

## 타입 파일 변경

**`src/types/research.ts`** 추가:
```typescript
interface AnalystOpinionItem     // 증권사명, 투자의견, 목표주가, 날짜
interface AnalystOpinionSummary  // items[], avgTargetPrice, currentPrice, updatedAt
```

---

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✓ 에러 0 |
| `npm run build` | ✓ 성공, `/api/stocks/[symbol]/analyst-opinion` route 등록 확인 |
| `npm run validate:full` | ✓ 에러 0, 경고 25개 (기존 미사용 변수) |

---

## 남은 리스크

| 리스크 | 설명 |
|---|---|
| KIS FHKST66430300 미지원 | 개인 계좌 등급에 따라 endpoint 접근 불가할 수 있음. 미지원 시 카드 숨김 처리됨 |
| 3자 prefix 과필터링 | `삼성` 계열처럼 그룹명 공유 시 일부 관련 기사가 과거보다 적게 포함될 수 있음. 실제 테스트 후 조정 필요 |
| 섹터 모멘텀 장 마감 시 | KIS 시세는 장 마감 후에도 당일 종가를 반환하므로 changeRate는 여전히 유효함 |

---

## Phase 30 후보 (다음 세션)

- stock_master에 업종코드(KIS sector code) 컬럼 추가 → 더 정확한 섹터 매핑
- 연관 종목 RelationType 확장: `supply_chain`, `disclosure_linked` 실데이터 연결
- 클라이언트 컴포넌트 RSC props 전환 (Phase 28에서 설계한 Phase 2)
- `/api/stocks/names?symbols=...` 배치 조회 API
