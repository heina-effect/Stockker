# Stockker — AI 기반 한국 주식 리서치 플랫폼 (Beta)

Stockker는 검색 중심의 한국 주식 리서치 도구입니다. 실시간 매매 터미널이 아니라, 다중 뉴스/공시 소스를 AI로 정제해 출처 근거가 명시된 리서치 인사이트를 제공합니다.

---

## 주요 특징

- **AI 리서치 요약**: 종목/섹터 최신 이슈를 Gemini 2.5 Flash로 분석하고 출처 근거를 명시
- **4-Source 뉴스 파이프라인**: KIS 뉴스 · Open DART 공시 · GNews · NewsAPI 병렬 수집 + pgvector 임베딩 큐레이션
- **Stale-while-revalidate 스냅샷**: DB 스냅샷을 먼저 반환하고 백그라운드에서 갱신 (빠른 응답 + API 쿼터 절약)
- **DB-first 검색 + 섹터 추론**: `stock_master`/`sector_master` 우선 조회, KIS 업종코드(`bstp_cls_code`)로 미등록 종목도 섹터 peer 탐색
- **관심 종목 리서치 허브**: local-first 관심 종목의 현재가·등락률·섹터·AI 요약·이슈·감성·투자의견을 한 화면에 집계
- **오버나이트 스크리닝**: 주봉·일봉 정배열, 거래량 회전율(`vol_tnrt ≥ 5%`), 윗꼬리 제한(≤3.5%), KIS 현재가 기반 위험종목(경고/정지/과열 등) 정밀 배제. KOSDAQ 거시필터는 지수 일자별시세를 페이지네이션해 120일 정배열을 판정
- **KIS 시세/주문 격리**: 시세 조회는 실전 도메인·실전 키(`openapi.koreainvestment.com:9443`), 주문은 모의투자로 분리
- **단일 KIS 요청 큐**: `globalThis` 싱글톤 큐(`350ms` 간격)로 모든 KIS 호출을 직렬화하고, 한도 초과 시 부분 성공 데이터만 서비스하는 Graceful Break 적용
- **평가 레이어 + 추천 가드레일**: 환각·최신성·출처 충분성·면책 자동 검증, 지시적 매매 언어 차단, disclaimer 필수 노출
- **데이터 오염 무관용**: production fallback은 mock 종목/섹터를 노출하지 않음 (데이터 없으면 빈 UI)
- **전역 테마 시스템**: light / dark / system 모드를 토큰 기반으로 앱 전체에 적용

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| Framework | Next.js 16 (App Router) |
| Database | Supabase (PostgreSQL + pgvector) |
| AI 런타임 | Gemini 2.5 Flash + Flash-Lite (2-stage routing) |
| AI 임베딩 | Gemini text-embedding-004 (768dim) |
| 데이터 소스 | KIS API · Open DART · GNews · NewsAPI |
| 스타일링 | Tailwind CSS v4 |

---

## 빠른 시작

```bash
npm install
cp .env.local.example .env.local        # docs/core/setup.md 참고
npx supabase link --project-ref <ref>   # 신규 설치 시
npx supabase db push
npm run dev                             # → http://localhost:3000
```

> `supabase link`는 [Supabase PAT](https://supabase.com/dashboard/account/tokens)가 필요합니다. 환경 변수/마이그레이션 상세는 [docs/core/setup.md](docs/core/setup.md) 참고.

---

## 중요 정책 (Non-Negotiables)

- 인트라데이(당일 분봉) 데이터는 의도적으로 숨김
- 홈 화면은 단일 `/api/home/intelligence` fetch로 동작 (카드별 개별 fetch 금지)
- 사용자 데이터는 명시적 저장 액션에만 로컬 스토리지에 기록
- AI 추천은 항상 출처 수·위험 고지·disclaimer 동반
- production fallback은 mock 데이터를 노출하지 않음

---

## 개발 스크립트

```bash
npm run validate          # lint + typecheck
npm run validate:full     # 전체 테스트 + 빌드
npm run validate:db-master # 원격 stock_master/sector_master 검증
npm run sync:stock-master # DART corp-master → stock_master 동기화
npm run test:evals        # AI 평가 테스트
```

---

## 문서

전체 구조는 [docs/README.md](docs/README.md) 기준이며, 핵심 문서는 다음과 같습니다.

- [architecture.md](docs/core/architecture.md) — 시스템 아키텍처
- [setup.md](docs/core/setup.md) — 로컬 환경 설정
- [theme-behavior.md](docs/core/theme-behavior.md) — 테마 동작과 token contract
- [recommendation-guardrails.md](docs/core/recommendation-guardrails.md) · [evaluation-policy.md](docs/core/evaluation-policy.md) — 추천/평가 정책
- [known-issues.md](docs/release/known-issues.md) · [ops-playbook.md](docs/ops/ops-playbook.md) — 알려진 이슈/운영
- Phase 리포트: [phase-37-report.md](docs/phases/phase-37-report.md) (최신) — 이전 리포트는 `docs/phases/` 참고

---

## 페이즈 이력

| 페이즈 | 핵심 내용 |
|---|---|
| 1–12 | 대시보드 엔진, KIS/DART 실연동, 로컬 영속성 |
| 13–15 | 전종목 확장, 섹터 분류체계, 홈 인텔리전스 |
| 16–20 | AI 오케스트레이션(2-stage), Observability, pgvector, Metadata-First |
| 21–24 | 리서치 스냅샷 영속화, 4-source 뉴스, 관심 종목, Trust/Evaluation |
| 25–28 | Beta Hardening, 전역 테마 토큰, canonical sector routing, 홈 카드 UX |
| 29–31 | mock 제거, 종목/섹터 오염 차단, KIS 업종코드 기반 연관 종목 |
| 32–33 | Beta RC, 관심 종목 워크플로우, 홈 stale-first, 종목 상세 responsive |
| 34–35 | 관심 종목 리서치 허브 제품화, KIS 정보성 API 보강, 종목 매핑 버그 해결 |
| 36 | 오버나이트 스크리닝 제품화, 회전율 유동성 기준, KIS 위험종목 차단, 요청 큐 + Graceful Break |
| **37 (현재)** | **KIS 시세/주문 이원화, 거시필터 KOSDAQ 지수 페이지네이션(120봉) + 하루 캐시, KIS 요청 큐 단일화(350ms)** |

---

> 본 서비스는 투자 참고용 AI 리서치 정보를 제공하며, 투자 판단 및 책임은 전적으로 이용자 본인에게 있습니다.
