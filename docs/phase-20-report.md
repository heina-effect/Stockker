# Stockker Phase 20 Report — Supabase pgvector 실제 연동 & Metadata-First Detail Rendering

## 1. 개요

Phase 20은 Phase 19에서 추상화로만 구현된 Supabase pgvector를 **실제 연결**하고, 뉴스/공시 소스를 DB 자산으로 저장·재사용하는 파이프라인을 완성했습니다.

---

## 2. 핵심 구현 내역

### 2.1 Supabase 실제 연동

**환경변수 정책** (보안 분리 완료):
| 키 | 변수명 | 사용 위치 |
|---|---|---|
| URL | `NEXT_PUBLIC_SUPABASE_URL` | 클라이언트 + 서버 |
| Publishable | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 클라이언트 |
| Anon JWT | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 클라이언트 (RLS) |
| Secret | `SUPABASE_SERVICE_ROLE_KEY` | **서버 전용** |

**클라이언트 모듈** (`src/lib/supabase/client.ts`):
- `getSupabaseClient()` → 브라우저 전용 (anon key)
- `getSupabaseAdmin()` → 서버 전용 (service_role key, `persistSession: false`)

### 2.2 pgvector 스키마 구축 (실제 DB 배포 완료 ✅)

| 테이블 | 역할 |
|---|---|
| `news_sources` | Raw 뉴스/공시 저장 |
| `source_embeddings` | Embedding + 품질 점수 저장 |
| `issue_clusters` | 큐레이션된 이슈 클러스터 |
| `embedding_centroids` | 신뢰/스팸 센트로이드 기준점 |

**RPC 함수**:
- `match_source_embeddings(query_embedding, match_symbol, match_count, match_threshold)` — 코사인 유사도 검색
- `nearest_centroid(query_embedding, centroid_type)` — 신뢰/스팸 센트로이드 거리 계산

### 2.3 Vector Store 재작성 (`vector-store.ts`)

`@supabase/supabase-js` SDK 기반으로 전면 교체:
- `upsertRawSources()` — `news_sources` 테이블에 저장 (신규)
- `upsertSourceEmbeddings()` — `source_embeddings` 테이블에 저장
- `getRecentCuratedSources()` — freshness window로 DB 재사용
- In-memory fallback 유지 (Supabase 미설정 시 자동 전환)

### 2.4 Embedding Curator Phase 20 개선 (`embedding-curator.ts`)

**Step 0: DB 캐시 우선 조회 (신규)**
- 25분 freshness window 내 curated sources가 있으면 즉시 반환
- 캐시 히트 시 KIS/DART API 호출 없음 → quota 절약

**Step 1: Raw sources를 news_sources에 먼저 저장 (신규)**
- 배경 비동기 upsert (`non-blocking`)
- `_isMock` 소스 저장 제외

**Step 9: source_embeddings 배경 저장 (신규)**
- 큐레이션 완료된 소스만 저장 (rejected 제외)

### 2.5 종목 상세 헤더 Metadata-First (`stock-report-header.tsx`)

| Before | After |
|---|---|
| `if (!data) return <skeleton>` → 종목명/티커까지 skeleton | 종목명/티커/북마크 **즉시 표시** |
| 전체 카드 pulse animation | **현재가·AI Summary만** skeleton |
| `getStockName(symbol)` null 체크 전 사용 불가 | `immediateStockName` 동기 조회 후 즉시 렌더링 |

### 2.6 SourceListCard 페이지네이션 업그레이드

- `/api/stocks/${symbol}/sources?page=N&limit=5` 호출
- 품질 배지 (`근거 충분/보통/부족`), 전략 태그, 교차 확인 수 표시
- "더 보기" / "접기" 버튼
- 소스 타입 아이콘 (뉴스: 파란색, 공시: 청록색)

### 2.7 Sources API 업그레이드

- DB 우선 조회 (1시간 freshness window)
- DB 없으면 즉석 fetch fallback
- `sources`, `items`, `hasMore`, `fromDb` 통합 응답

---

## 3. 스키마 배포 현황

| 테이블 | 상태 |
|---|---|
| `news_sources` | ✅ 생성됨 |
| `source_embeddings` | ✅ 생성됨 (vector(768)) |
| `issue_clusters` | ✅ 생성됨 |
| `embedding_centroids` | ✅ 생성됨 |
| `match_source_embeddings` RPC | ✅ 생성됨 |
| `nearest_centroid` RPC | ✅ 생성됨 |
| RLS 정책 | ✅ 설정됨 |

---

## 4. 파이프라인 변화

```
Before: Fetch → Normalize → Embed → [In-Memory Only] → AI 생성 (매번 반복)

After:  [DB Cache Check] → (hit) → 즉시 반환 → AI 생성
                        → (miss) → Fetch → Normalize → [DB 저장]
                                 → Embed → Quality Score → [DB 저장]
                                 → Curated → AI 생성
```

---

## 5. 새로운 npm 스크립트

```bash
npm run migrate:supabase  # 테이블 존재 여부 검증
npm run test:vectors      # vector store 계약 테스트
npm run test:storage      # source persistence 테스트
npm run test:report       # sentiment/report 테스트
```

---

---

## 7. Phase 20 버그 수정 (Hotfix)

### 7.1 Gemini Embedding 모델 수정
- `text-embedding-004` → **`gemini-embedding-001`** (이 API 키로 접근 가능한 유일한 임베딩 모델)
- 차원: 768 → **3072** (Supabase 스키마도 동기 변경)
- `httpOptions.apiVersion: "v1"` 강제 설정 제거 (v1beta에서 동작)

### 7.2 콘솔 노이즈 제거
| 로그 | Before | After |
|---|---|---|
| KIS 뉴스 404 (000660 등 일부 종목) | `console.warn` + 스택트레이스 | `console.debug` (silent) |
| ChartScale `price=0` (SSE 연결 전) | `console.warn` | `console.debug` (SSE 연결 후 비정상값만 warn 유지) |

### 7.3 Recharts `width(-1) height(-1)` 경고 수정
- **원인**: `flex-1` 자식 div에 `minHeight: 0` 미설정 → recharts `ResizeObserver`가 초기 크기 계산 실패
- **수정**: `DailyCandlestickChartCard`의 `ResponsiveContainer` 부모 div에 `style={{ minHeight: 0 }}` 추가
- **적용 파일**: `src/components/report/daily-candlestick-chart-card.tsx:251`

### 7.4 AI 감성 점수 UI 개선
- **데이터 부족 시 처리**: 실시간 데이터 수집 실패 또는 근거 부족으로 인한 Fallback 발생 시, 50점(중립)이 아닌 **'-점'**으로 표시하여 분석 결과가 없음을 명확히 함 (라벨은 '판단불가'로 표시).
- **단위 표시 표준화**: 기존 `score점 / 100` 형식을 **`score점 / 100점`**으로 통일하여 가독성 향상.
- **Muted 스타일 적용**: Fallback 상태의 점수 배지에 회색 톤 스타일을 적용하여 시각적으로 구분.
