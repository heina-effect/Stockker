# Stockker 로컬 개발 설정 가이드 (Phase 34)

## 1. 기술 스택

| 항목 | 버전/내용 |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| Runtime | Node.js 20+ (LTS 권장) |
| 패키지 매니저 | npm |
| 언어 | TypeScript 5+ |
| 스타일링 | Tailwind CSS v4 |
| 데이터베이스 | Supabase (PostgreSQL + pgvector) |
| AI 런타임 | Google Gemini 2.5 Flash / Flash-Lite |
| AI 임베딩 | Gemini text-embedding-004 (768dim) |
| 데이터 소스 | KIS API, Open DART, GNews, NewsAPI |
| 실시간 | KIS SSE / WebSocket (LiveMarketProvider) |

---

## 2. 필수 환경 변수 (`.env.local`)

프로젝트 루트에 `.env.local` 파일을 생성하세요. 아래 키 중 없는 항목은 해당 기능이 fallback 모드로 동작합니다.

```env
# ── KIS (한국투자증권) ──────────────────────────────────────────────────
KIS_APP_KEY="your_kis_app_key"
KIS_APP_SECRET="your_kis_app_secret"
KIS_TR_MODE="v"           # "v" = virtual/paper, "real" = 실계좌 (주의)
KIS_ACCOUNT_NO="your_account_number_if_real"

# ── Open DART (공시 API) ──────────────────────────────────────────────
DART_API_KEY="your_dart_api_key"

# ── Google Gemini (AI 모델) ──────────────────────────────────────────
GEMINI_API_KEY="your_gemini_api_key"

# ── GNews (뉴스 소스) ────────────────────────────────────────────────
GNEWS_API_KEY="your_gnews_api_key"

# ── NewsAPI (뉴스 소스) ───────────────────────────────────────────────
NEWSAPI_KEY="your_newsapi_key"

# ── Supabase (DB + pgvector) ─────────────────────────────────────────
NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="your_supabase_anon_key"
SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key"

# ── Upstash Redis (홈 인텔리전스 캐시, 선택) ──────────────────────────
UPSTASH_REDIS_REST_URL="https://your-redis.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your_upstash_token"
```

> **API 없이 실행할 경우**: Gemini/KIS/DART/GNews/NewsAPI 키가 없으면 각 기능은 자동으로 mock fallback 모드로 동작합니다. Supabase 없이도 일부 화면은 작동하지만 스냅샷 재사용 및 벡터 기능이 비활성화됩니다.

> **투자의견 API 주의**: 국내주식 종목투자의견/증권사별 투자의견은 KIS 공식 샘플 기준 정보성 엔드포인트입니다. `KIS_MODE=mock`에서도 호출은 허용하지만, 응답과 UI에 `KIS mock · 실제 응답` meta를 노출해 Stockker mock 데이터와 구분합니다.

---

## 3. 개발 서버 실행

```bash
# 1. 의존성 설치
npm install

# 2. 개발 서버 시작
npm run dev

# 3. 브라우저에서 접속
# http://localhost:3000
```

포트 충돌이 발생하면:
```bash
npm run dev:reset   # .next 캐시 삭제 + 포트 강제 해제 후 재시작
```

---

## 4. Supabase 마이그레이션 적용

신규 설치 또는 스키마 변경 후 아래 순서로 실행합니다.

### 4-1. 개인 액세스 토큰(PAT) 발급

[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → **New Token** 생성

### 4-2. 프로젝트 연결 및 마이그레이션 적용

```bash
# 프로젝트 연결 (최초 1회)
SUPABASE_ACCESS_TOKEN=sbp_xxxx npx supabase link --project-ref <your-project-ref>

# 미적용 마이그레이션 전체 push
SUPABASE_ACCESS_TOKEN=sbp_xxxx npx supabase db push

# 현재 적용 이력 확인
SUPABASE_ACCESS_TOKEN=sbp_xxxx npx supabase migration list
```

> `<your-project-ref>` 는 Supabase 프로젝트 URL의 서브도메인입니다.  
> 예: `https://abcdefgh.supabase.co` → `--project-ref abcdefgh`

### 4-3. 마이그레이션 이력 복구 (기존 DB에 수동 적용한 경우)

이미 수동으로 적용된 마이그레이션은 `repair` 로 이력만 등록합니다.

```bash
SUPABASE_ACCESS_TOKEN=sbp_xxxx npx supabase migration repair --status applied 001
SUPABASE_ACCESS_TOKEN=sbp_xxxx npx supabase migration repair --status applied 002
# 이후 db push 하면 미적용 마이그레이션만 실행됨
```

마이그레이션 파일은 `supabase/migrations/` 폴더에 있습니다.

---

## 5. 검증 스크립트

```bash
# 기본 품질 검사 (lint + typecheck)
npm run validate

# 전체 파이프라인 (권장: 배포 전 반드시 실행)
npm run validate:full

# 개별 테스트 스위트
npm run test:unit          # 단위 테스트 전체
npm run test:contracts     # API 계약 테스트
npm run test:persistence   # 사용자 저장소 테스트
npm run test:workflows     # 스냅샷/워크플로우 테스트
npm run test:evals         # AI 출력물 평가 (Eval) 테스트
npm run test:vectors       # 벡터 임베딩 테스트
npm run test:report        # 종목 리포트/감성 테스트
npm run test:search        # 검색 테스트
npm run validate:master    # static metadata/taxonomy/DART master 검증
npm run validate:db-master # 원격 stock_master/sector_master 검증
npm run sync:stock-master  # DART corp-master를 stock_master에 upsert
npm run sync:sector-master # 섹터 master hotfix 동기화

# 빌드
npm run build
```

Phase 28 UI/라우팅 회귀를 좁게 확인할 때:

```bash
npx vitest run \
  src/app/theme-contract.test.ts \
  src/components/home/dashboard-header.test.tsx \
  src/data/sectors/taxonomy.test.ts \
  src/server/ai/home-intelligence-normalizer.test.ts \
  src/components/home/trend-stocks-card.test.tsx \
  src/components/home/trend-sectors-card.test.tsx \
  src/components/home/search-hero-card.test.tsx \
  src/components/report/source-list-card.test.tsx \
  src/components/report/intraday-hidden.test.ts \
  src/server/research/detail-entry-guard.test.ts
```

Phase 31 상세 신뢰도 회귀를 좁게 확인할 때:

```bash
npx vitest run \
  src/server/research/entity-guard.test.ts \
  src/lib/stocks/sector-utils.test.ts \
  src/server/kis/sector-map.test.ts \
  src/server/research/pipeline/related-stocks.test.ts \
  src/components/report/source-list-card.test.tsx \
  src/components/report/intraday-hidden.test.ts
```

Phase 32 Beta RC 회귀를 좁게 확인할 때:

```bash
npx vitest run \
  src/app/theme-contract.test.ts \
  src/components/home/dashboard-header.test.tsx \
  src/components/report/source-list-card.test.tsx \
  src/lib/stocks/chart-utils.test.ts \
  src/data/sectors/taxonomy.test.ts \
  src/lib/stocks/search-master.test.ts \
  src/components/report/intraday-hidden.test.ts
```

Phase 33 runtime workflow 회귀를 좁게 확인할 때:

```bash
npx vitest run \
  src/components/home/search-hero-card.test.tsx \
  src/lib/user-storage/local-adapter.test.ts \
  src/components/workflows/watchlist-research-board.test.tsx \
  src/components/home/home-intelligence-provider.test.tsx \
  src/components/report/source-list-card.test.tsx \
  src/components/report/intraday-hidden.test.ts \
  src/lib/stocks/chart-utils.test.ts
```

---

## 6. VS Code 개발 환경 권장 설정

`.vscode/extensions.json` (필요 시 생성):

```json
{
  "recommendations": [
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "dbaeumer.vscode-eslint",
    "prisma.prisma"
  ]
}
```

TypeScript 경로 별칭 (`@/...`)은 `tsconfig.json`의 `paths` 설정으로 관리됩니다. VS Code가 자동으로 인식합니다.

---

## 7. 주요 API 엔드포인트

| 엔드포인트 | 설명 |
|---|---|
| `GET /api/home/intelligence` | 홈 인텔리전스 (15분 캐시, single fetch) |
| `GET /api/stocks/[symbol]/report` | 종목 AI 리포트 요약 |
| `GET /api/stocks/[symbol]/sentiment` | 종목 감성 분석 |
| `GET /api/stocks/[symbol]/issues` | 종목 이슈 타임라인 |
| `GET /api/stocks/[symbol]/sources` | 종목 원본 소스 (페이지네이션) |
| `GET /api/watchlist/summary?symbols=005930,000660` | 관심 종목 리서치 요약 (시세/요약/감성/이슈/투자의견) |
| `GET /api/sectors/[sectorId]` | 섹터 상세 스냅샷 |
| `GET /api/sectors/[sectorId]/market` | KIS 업종기간별시세 + 대표 종목 시세 기반 섹터 시장 신호 |
| `GET /api/ops/metrics` | 내부 운영 메트릭 (개발 전용) |
| `GET /api/health` | 헬스 체크 |

---

## 8. 알려진 베타 제약

- 인트라데이(당일 분봉) 차트는 의도적으로 비활성화됨 (release-freeze)
- 로컬 스토리지 기반 사용자 저장 (서버-sync 없음)
- Gemini API 쿼터 초과 시 fallback 동작 (개발은 mock, production 홈 인텔리전스는 빈 배열 + meta)
- 스냅샷 TTL: 종목 1시간, 섹터 1시간 (만료 후 stale-while-revalidate)

## 9. Phase 28 수동 확인

개발 서버에서 다음을 확인한다.

1. 헤더의 light / dark / system 버튼이 앱 전체 배경, 카드, 텍스트, border에 적용된다.
2. 새로고침 후 선택한 테마가 유지된다.
3. 홈 섹터 카드는 canonical `/sectors/sec-*` 링크만 만든다.
4. 홈 트렌딩 종목 카드는 제목뿐 아니라 카드 전체가 클릭된다.
5. 트렌딩 종목 우측 metric은 `근거 N건`이며 AI 생성 등락률 percent가 아니다.
6. 인트라데이 버튼은 `NEXT_PUBLIC_ENABLE_INTRADAY_CHART=1` 없이는 노출되지 않는다.

## 10. Phase 31 수동 확인

1. LIG디펜스앤에어로스페이스 상세에서 반도체/HBM 이슈가 직접 근거 없이 섞이지 않는다.
2. 리포트 뱃지는 “방금 생성 실시간”이 아니라 근거 상태를 표시한다.
3. 최근 핵심 이슈, 소스, 투자의견, 연관 종목 카드 제목이 loading/empty/error에서도 유지된다.
4. 상세 헤더에 canonical 섹터명과 KIS 업종명이 표시된다.
5. 연관 종목에 relation type과 reason이 표시된다.

## 11. Phase 32 Beta RC 수동 확인

1. light / dark / system 전환이 홈, 상세, 섹터, 워크플로우 전체 surface에 적용된다.
2. `/sectors/sec-shipping` 주요 종목에 LS ELECTRIC이 보이지 않는다.
3. 일봉 차트에서 KST 오늘 거래일 봉이 중복 표시되지 않는다.
4. AI 분석 근거 소스 카드는 처음부터 `/sources?page=1&limit=5` pagination을 사용한다.
5. 소스 카드의 날짜는 원문 발행일/공시일이며 `collectedAt`이 발행일처럼 보이지 않는다.
6. 증권사 투자의견 카드가 로딩/빈/오류 상태에서도 프레임과 제목을 유지한다.

## 12. Phase 33 수동 확인

1. 홈 검색 결과에서 종목의 `+` 버튼을 눌러 관심 종목에 추가한다.
2. 홈 우측 관심 종목 카드가 새로고침 없이 즉시 갱신된다.
3. 새로고침 후 관심 종목이 유지된다.
4. `/workflows/watchlist`에서 저장된 종목 카드가 보이고, snapshot이 없으면 “리포트 준비 중” 상태가 보인다.
5. 홈 재진입 시 이전 인텔리전스가 먼저 보이고 백그라운드에서 “갱신 중” 상태가 표시된다.
6. 종목 상세가 큰 화면에서 더 넓은 grid를 사용하고 모바일에서는 stack된다.
7. 연관 종목 현재가가 없을 때도 relation type/reason과 `최신가 없음` 상태가 보인다.

## 13. Phase 34 수동 확인

1. 홈 검색 결과에서 종목의 `+` 버튼을 눌러 관심 종목에 추가한다.
2. 우측 `나의 관심 종목` 카드가 즉시 갱신되고 새로고침 후에도 유지된다.
3. 같은 종목을 다시 추가해도 중복 저장되지 않는다.
4. `/workflows/watchlist`에서 현재가/등락률, 섹터, AI 요약, 최근 이슈, 감성, 공시/뉴스 수, 투자의견 상태가 보인다.
5. snapshot 또는 KIS 보조 데이터가 없을 때도 카드가 사라지지 않고 `리포트 준비 중`, `최신가 없음`, `데이터 없음` 상태를 표시한다.
6. 섹터 상세에서 `KIS 업종 흐름` 카드가 보이고, 업종코드가 없으면 대표 종목 시세 fallback 설명이 보인다.
7. 홈 주목 종목/섹터 문구가 거래 권유가 아니라 근거 수, 이슈 밀도, 대표 종목 흐름 중심으로 설명된다.
