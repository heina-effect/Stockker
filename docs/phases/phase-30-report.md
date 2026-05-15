# Phase 30 — API 호출 최적화, 데이터 오염 차단, KIS 업종 기반 연관 종목

## 배경

Phase 29 Fix(투자의견 카드, 소스 로딩 UX, 오염 차단)에 이어, 종목 페이지 조회 시 발생하는 과도한 KIS API 동시 호출, mock 데이터 오염 노출, 연관 종목 미표시, 감성 카드 출처 빈칸 문제를 집중 수정한다.

---

## 완료된 작업

### A. KIS API 동시 호출 최적화

**문제**: 종목 페이지 최초 로드 시 5개 KIS 호출이 동시에 발생 → `EGW00201 초당 거래건수 초과`

| 호출 | 원인 |
|---|---|
| `ohlc/intraday` | 차트 컴포넌트 |
| `analyst-opinion` → getDomesticStockQuote | 현재가를 bootstrap과 별도로 중복 조회 |
| `analyst-opinion` → getStockAnalystOpinions | 투자의견 TR |
| `bootstrap?type=index` × 2 | KOSPI/KOSDAQ 지수 |

**수정**:

`src/app/api/stocks/[symbol]/analyst-opinion/route.ts`
- `getDomesticStockQuote` 제거 — `currentPrice`는 클라이언트가 bootstrap으로 이미 보유
- 초기 로드 KIS 동시 호출 5개 → 3개

**`src/app/api/stocks/[symbol]/issues/route.ts`**
- `withDedupeAndCache("issues_{symbol}", 60초)` 추가
- `IssueTimelineCard` + `SourceListCard`가 동시에 같은 route를 호출할 때 GNews 중복 fetch 차단

---

### B. 감성 카드 AI 분석 출처 빈칸 수정

**`src/app/api/stocks/[symbol]/sentiment/route.ts`**

**문제**: DB 스냅샷 로드 시 `basisSources = [{ id }]` 스텁만 반환 — title/url 없어서 UI에 대시만 표시

**수정**:
- `basisSources[0].title` 없으면 `vectorStore.getSourcesByIds(ids)` 로 실제 소스 데이터 조회
- `src/server/ai/vector-store.ts` 인터페이스 + SupabaseVectorStore에 `getSourcesByIds(ids: string[])` 메서드 추가 (시간 제한 없이 ID로 직접 조회)

---

### C. 소스 오염 차단 강화 — 스니펫 전체명 매칭 제거

**`src/server/research/pipeline/normalize.ts`**

**문제**: GNews가 섹터 브리핑 기사에서 회사명을 snippet에만 접선 언급한 기사를 반환 → `snippetLower.includes(nameLower)` 에 걸려 통과

예시: "AI 메모리 수요 폭발... 차세대 HBM 수주전 승자는?" — 에이프릴바이오·LIG디펜스앤에어로스페이스 페이지에 노출

**수정**: 전체 회사명 매칭을 **제목(title)에서만** 확인, 스니펫은 prefix 매칭에만 허용

```typescript
// 이전: title OR snippet
if (titleLower.includes(nameLower) || snippetLower.includes(nameLower)) return true;

// 이후: title 전용
if (titleLower.includes(nameLower)) return true;
```

---

### D. mock 이슈 데이터 fallback 완전 제거

**`src/server/research/model-router.ts`**

**문제**: 소스 수집 0건 / 필터 후 0건 / 예외 발생 시 `mockIssues(symbol)` 반환
→ "AI 메모리 수요 폭발... 차세대 HBM 수주전 승자는?" 등 하드코딩된 가짜 클러스터가 모든 종목에 노출

**수정**: 모든 mock 반환을 `{ clusters: [], sources: [] }` 로 교체
- `IssueTimelineCard`는 이미 빈 배열에 대해 "수집된 이슈가 없습니다" 상태를 갖추고 있어 별도 UI 변경 불필요
- `mockReportSummary`, `mockSentiment` import 제거 (미사용이었던 `summarizeIssues` import도 정리)

---

### E. LIG디펜스앤에어로스페이스 종목코드 수정

**문제**: LIG넥스원(073120)이 LIG디펜스앤에어로스페이스로 사명 변경 + 코드 변경(079550) — 3곳에서 구코드 참조

**수정**:
- `src/lib/stocks/metadata.ts`: `073120` → `079550`, 이름 업데이트
- `src/data/sectors/taxonomy.ts`: `sec-defense` memberSymbols, representativeSymbols 수정
- `supabase/migrations/005_master_tables.sql`: sector_master + stock_master seed 수정

---

### F. KIS 업종코드 기반 연관 종목 자동 매핑

**문제**: 연관 종목은 taxonomy.ts에 하드코딩된 ~30개 종목에만 동작 → 나머지 2470개 종목은 항상 빈 결과

**원인 분석**:
1. `findSectorForSymbol`이 `sector.memberSymbols.includes(symbol)` 에만 의존
2. `cluster.relatedSymbols` — `rankAndCluster()`에서 미구현, 항상 빈 배열
3. LIG디펜스앤에어로스페이스(079550), 에이프릴바이오 등 대부분의 종목이 어떤 섹터에도 매핑되지 않음

**해결**:

**KIS idxcode.mst 파싱**: `https://new.real.download.dws.co.kr/common/master/idxcode.mst.zip` 에서 직접 다운로드 (인증 불필요) → KOSPI 30개 + KOSDAQ 32개 업종코드 확보

**신규 파일 `src/server/kis/sector-map.ts`**:
- KIS `bstp_cls_code` → 우리 `sec-*` ID 매핑 테이블 (idxcode.mst 기반)
- `resolveKisSectorId(code, name)` 함수

**`src/types/stock.ts`**: `StockQuote`에 `kisIndustryCode`, `kisIndustryName` 필드 추가

**`src/server/kis/normalizers.ts`**: `normalizeKisDomesticQuote`에서 `bstp_cls_code`, `bstp_kor_isnm` 추출 (이미 응답에 있었으나 버리고 있었음)

**`src/server/research/pipeline/related-stocks.ts`**:
```typescript
// taxonomy 미매핑 시 KIS quote 업종코드로 섹터 자동 추론
const quote = await getDomesticStockQuote(symbol); // 15초 캐시 — 추가 KIS 호출 없음
const sectorId = resolveKisSectorId(quote.kisIndustryCode, quote.kisIndustryName);
```

예시: LIG디펜스앤에어로스페이스(079550) → `bstp_cls_code: "0012"` (기계·장비) → `sec-defense` → 한화에어로스페이스·한화시스템·현대로템 연관 표시

---

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npm run typecheck` | ✓ 에러 0 |
| KIS 동시 호출 수 | 5건 → 3건 |
| issues route 중복 GNews 호출 | withDedupeAndCache 60초로 차단 |
| mock 이슈 노출 | 제거 완료 |
| 감성 출처 빈칸 | getSourcesByIds로 해결 |
| LIG 코드 | 073120 → 079550 |
| idxcode.mst | 487개 업종코드 파싱 완료 |

---

## 남은 리스크

| 리스크 | 설명 |
|---|---|
| KIS bstp_cls_code 미반환 | 일부 종목에서 업종코드 빈값 가능 — name fallback 있음 |
| sector-map 미매핑 업종 | KIS 업종 중 우리 sec-* 에 대응 없는 경우 연관 종목 없음 표시 |
| DB 오염 소스 잔존 | TTL 1시간 내 기존 캐시는 normalizeSources 재필터 적용 중 |
| 005 migration 재적용 필요 | LIG 코드 변경분은 이미 실행된 DB에 수동 UPDATE 필요 |

---

## Phase 31 후보 (다음 세션)

- `cluster.relatedSymbols` 실구현 — 기사 공동 언급 종목 추출 (NER 또는 키워드 매칭)
- `stock_master.sector_code_kis` 컬럼 추가 + 배치 seeding
- `/api/stocks/names?symbols=...` 배치 조회 API (Watchlist/Bookmarks 효율화)
- 클라이언트 컴포넌트 RSC props 전환 (Phase 28 Phase 2 설계)
