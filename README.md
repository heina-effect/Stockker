# Stockker — AI 기반 한국 주식 리서치 플랫폼 (Beta)

Stockker는 검색 중심의 한국 주식 리서치 도구입니다. 실시간 매매 터미널이 아니라, 다중 뉴스/공시 소스를 AI로 정제하여 신뢰할 수 있는 리서치 인사이트를 제공합니다.

---

## 주요 특징

- **AI 리서치 요약**: 종목/섹터별 최신 이슈를 Gemini 2.5 Flash로 분석하고 출처 근거를 명시
- **Stale-while-revalidate 스냅샷**: DB에 저장된 리서치 에셋을 재사용하여 빠른 응답 + API 쿼터 절약
- **4-Source 뉴스 파이프라인**: KIS 뉴스, Open DART 공시, GNews, NewsAPI 병렬 수집 + pgvector 임베딩 큐레이션
- **평가 레이어 (Eval)**: AI 생성물의 환각·최신성·출처 충분성·면책 조항을 자동 검증
- **추천 가드레일**: 지시적 매매 언어 차단, 출처 수 명시, disclaimer 필수 노출
- **저장 워크플로우**: 관심 종목 / 최근 본 종목 / 북마크 리포트 — 로컬 저장, 명시적 저장 전용
- **섹터 심층 분석**: 주도주 / 소외주 / 관찰 후보 포함한 섹터 리서치

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| Database | Supabase (PostgreSQL + pgvector) |
| AI 런타임 | Gemini 2.5 Flash + Flash-Lite (2-stage routing) |
| AI 임베딩 | Gemini text-embedding-004 (768dim) |
| 데이터 소스 | KIS API, Open DART, GNews, NewsAPI |
| 스타일링 | Tailwind CSS v4 |

---

## 빠른 시작

```bash
# 1. 의존성 설치
npm install

# 2. 환경 변수 설정 (docs/setup.md 참고)
cp .env.local.example .env.local

# 3. 개발 서버 실행
npm run dev
# → http://localhost:3000

# 4. 전체 검증 (배포 전)
npm run validate:full
```

자세한 환경 변수 설정은 [docs/setup.md](docs/setup.md)를 참고하세요.

---

## 중요 정책 (Non-Negotiables)

- 인트라데이(당일 분봉) 데이터는 의도적으로 숨겨져 있음
- 홈 화면은 단일 `/api/home/intelligence` fetch로 동작 (카드별 개별 fetch 금지)
- 사용자 데이터는 명시적 저장 액션에만 로컬 스토리지에 기록
- AI 추천은 항상 출처 수, 위험 고지, disclaimer를 동반

---

## 개발 스크립트

```bash
npm run validate          # lint + typecheck
npm run validate:full     # 전체 테스트 + 빌드
npm run test:evals        # AI 평가 테스트
npm run build             # 프로덕션 빌드
```

---

## 문서

**시스템 및 아키텍처**
- [architecture.md](docs/architecture.md) — 시스템 아키텍처 (Phase 26 — 비블로킹 섹터 페이지, 테마 시스템)
- [setup.md](docs/setup.md) — 로컬 환경 설정

**페이즈 리포트**
- [phase-26-report.md](docs/phase-26-report.md) — 최신 (연관 종목 명확화, 테마 토글, 섹터 비블로킹)
- [phase-26-audit.md](docs/phase-26-audit.md) — Phase 26 감사 보고서

**정책 및 운영**
- [beta-release-checklist.md](docs/beta-release-checklist.md) — 베타 릴리즈 체크리스트
- [known-issues.md](docs/known-issues.md) — 알려진 이슈
- [release-freeze-rules.md](docs/release-freeze-rules.md) — 릴리즈 동결 규칙
- [ops-playbook.md](docs/ops-playbook.md) — 운영/장애 대응 가이드
- [ops-observability.md](docs/ops-observability.md) — 모니터링 및 관찰성
- [recommendation-guardrails.md](docs/recommendation-guardrails.md) — 추천 안전 가드레일
- [evaluation-policy.md](docs/evaluation-policy.md) — AI 출력물 평가 정책

**워크플로우 및 기능**
- [research-workflows.md](docs/research-workflows.md) — 저장 및 리서치 워크플로우

---

## 페이즈 이력

| 페이즈 | 핵심 내용 |
|---|---|
| 1–12 | 대시보드 엔진, KIS/DART 실연동, 로컬 영속성 레이어 |
| 13–15 | 전종목 확장, 섹터 분류체계, 홈 인텔리전스 레이어 |
| 16–18 | AI 오케스트레이션 고도화 (2-stage routing), Observability |
| 19–20 | pgvector 연동, 소스 임베딩 큐레이션, Metadata-First 렌더링 |
| 21 | 리서치 스냅샷 영속화, 섹터 리서치 워크플로우 |
| 22 | 4-소스 뉴스 파이프라인 확장 |
| 23 | 스냅샷 재사용 극대화, 관심 종목 워크플로우 |
| 24 | Trust/Evaluation Layer, Stale-while-revalidate, Daily Workflows |
| 25 | Beta Hardening — 버그 수정, UX 일관성, 릴리즈 동결 준비 |
| **26 (현재)** | **Post-Beta UX 수정 — 연관 종목 명확화, 테마 토글 완성, 섹터 페이지 비블로킹** |

---

> 본 서비스는 투자 참고용 AI 리서치 정보를 제공하며, 투자 판단 및 책임은 전적으로 이용자 본인에게 있습니다.
