# Stockker 로컬 개발 설정 가이드 (Phase 25 — Beta)

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

# 빌드
npm run build
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
| `GET /api/sectors/[sectorId]` | 섹터 상세 스냅샷 |
| `GET /api/ops/metrics` | 내부 운영 메트릭 (개발 전용) |
| `GET /api/health` | 헬스 체크 |

---

## 8. 알려진 베타 제약

- 인트라데이(당일 분봉) 차트는 의도적으로 비활성화됨 (release-freeze)
- 로컬 스토리지 기반 사용자 저장 (서버-sync 없음)
- Gemini API 쿼터 초과 시 자동 fallback (mock 데이터)
- 스냅샷 TTL: 종목 1시간, 섹터 1시간 (만료 후 stale-while-revalidate)
