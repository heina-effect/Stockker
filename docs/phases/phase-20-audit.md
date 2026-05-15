# Phase 20 Audit — Supabase pgvector Integration & Metadata-First Rendering

## 1. 현재 상태 요약

### 1.1 Supabase 연동 현황

| 항목 | 현재 상태 |
|---|---|
| Supabase adapter 코드 | ✅ `vector-store.ts`에 구현됨 |
| **실제 DB 연결** | ❌ **`SUPABASE_URL` + `SUPABASE_SERVICE_KEY` 미설정 → In-Memory만 사용** |
| `source_embeddings` 테이블 | ❌ **DB에 아직 없음** |
| `news_sources` 테이블 | ❌ **없음** |
| `@supabase/supabase-js` 패키지 | ✅ Phase 20에서 설치됨 |

### 1.2 벡터 스토어 사용 경로

현재 벡터 스토어는 `embedding-curator.ts` → `getVectorStore()` 호출 → In-Memory 어댑터로 동작.
Supabase REST API 방식(직접 fetch)이 구현되어 있으나, 환경변수가 없어 실제 연결되지 않음.

### 1.3 현재 이슈 파이프라인 동작

```
[collectRawSources] → [normalizeSources] → [curateSourcesWithEmbedding]
                                                    ↓
                           DB 저장 (background, 실제로는 In-Memory만)
                                                    ↓
                            [rankAndCluster] → [aiAnalyzeSentiment]
```

**문제**: 매 요청마다 KIS/DART를 새로 fetch. DB 저장본 재사용 없음.

### 1.4 종목 상세 헤더 현황

```tsx
// stock-report-header.tsx:45
if (!data) {
  return <div animate-pulse> {/* 종목명/티커까지 skeleton */} </div>;
}
```

- `data`가 null인 상태에서 종목명, 티커 모두 skeleton 처리됨
- `getStockName(symbol)` 함수가 이미 존재하나, null 체크 전 사용 불가
- symbol은 라우트 파라미터로 즉시 사용 가능한데 skeleton으로 가림

### 1.5 SourceListCard 현황

- `/api/stocks/${symbol}/issues`에서 sources 배열을 가져옴
- 매번 즉석 계산 (DB 저장본 미사용)
- 페이지네이션: `/api/stocks/${symbol}/sources` 엔드포인트만 존재, UI 미연결

### 1.6 환경변수 현황

```env
# .env.example에 추가되어 있음 (Phase 19)
SUPABASE_URL=          # 미설정
SUPABASE_SERVICE_KEY=  # 미설정 (잘못된 변수명, SUPABASE_SERVICE_ROLE_KEY로 변경 필요)
```

**Phase 20에서 사용자가 제공한 키:**
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → 클라이언트 공개 OK
- Supabase Anon Key → 클라이언트 사용 가능 (RLS 정책에 따라)
- **Secret Key (`sb_secret_*`)** → 서버 전용, 절대 브라우저 노출 금지

## 2. Phase 20 Action Items

### [P0] 즉시 수행
1. `.env.local`에 Supabase 환경변수 추가 (정책 준수)
2. Supabase 클라이언트 모듈 (`src/lib/supabase/`) 생성
3. pgvector 스키마 SQL 마이그레이션 파일 생성
4. vector-store.ts를 `@supabase/supabase-js` 기반으로 교체
5. `news_sources` 테이블에 뉴스/공시 저장 로직 추가

### [P1] 핵심 기능
6. 종목 상세 헤더 metadata-first 렌더링 (종목명/티커 즉시 표시)
7. curated sources를 DB에서 재사용하는 freshness window 로직
8. SourceListCard에 DB 기반 페이지네이션 연결

### [P2] 품질 개선
9. source_embeddings 테이블에 embedding 저장
10. trusted/spam centroid 초기 seed 데이터 설정

## 3. 보안 정책

| 키 종류 | 변수명 | 사용 위치 |
|---|---|---|
| Publishable Key | `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트 + 서버 |
| Publishable Key | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 클라이언트 + 서버 |
| Anon JWT | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 (RLS 적용) |
| Service Role / Secret | `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용** |
