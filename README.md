# Stockker — AI 기반 한국 주식 리서치 플랫폼 (Beta)

검색 중심의 한국 주식 리서치 도구입니다. 실시간 매매 터미널이 아니라, 다중 뉴스/공시 소스를 AI로 정제해 **출처 근거가 명시된** 리서치 인사이트를 제공합니다. 오버나이트 스크리닝·백테스트·발굴 종목 추적 도구를 함께 포함합니다.

> **현재 상태 (Phase 42)**: 추적 데이터 정합성 복구 진행 중. 운영 전 [알려진 이슈](#알려진-이슈--운영-주의)를 먼저 확인하세요.

---

## 빠른 시작

```bash
npm install
cp .env.local.example .env.local        # docs/core/setup.md 참고
npx supabase link --project-ref <ref>   # 신규 설치 시
npx supabase db push
npm run dev                             # → http://localhost:3000
```

`supabase link`에는 [Supabase PAT](https://supabase.com/dashboard/account/tokens)가 필요합니다. 환경 변수와 마이그레이션 상세는 [docs/core/setup.md](docs/core/setup.md)를 참고하세요.

---

## 일일 운영 (스크리닝)

```bash
# 오버나이트 스크리닝 (결과는 DB에 저장됨)
curl -s "http://localhost:3000/api/screening/overnight?debug=true"

# 백테스트 (다음 거래일 시가/종가 수익률)
curl -s "http://localhost:3000/api/screening/backtest?from=YYYYMMDD&to=YYYYMMDD"
```

출력 가공용 `jq` 예시는 [ops-playbook](docs/ops/ops-playbook.md)을 참고하세요.

**운영 규칙**
- 정규장 종료(15:30) 이후에 실행합니다. 애프터마켓(NXT) 영향은 조사 중이라 안전한 정확 시각은 미확정입니다.
- 장중 실행과 같은 날 반복 실행은 피합니다. DB에 미확정 값이 저장될 수 있습니다.
- 며칠 실행하지 못했다면 [알려진 이슈](#알려진-이슈--운영-주의)의 `days_after` 항목을 먼저 확인하세요.
- 휴장일(공휴일·대체공휴일)을 확인하고 실행합니다.
- 자동 실행(Vercel Cron)은 아직 구현되지 않았습니다.

---

## 주요 기능

### 리서치
- **AI 리서치 요약**: 종목/섹터 최신 이슈를 Gemini 2.5 Flash로 분석하고 출처 근거 명시
- **4-Source 뉴스 파이프라인**: KIS 뉴스 · Open DART 공시 · GNews · NewsAPI 병렬 수집 + pgvector 임베딩 큐레이션
- **Stale-while-revalidate 스냅샷**: DB 스냅샷을 먼저 반환하고 백그라운드에서 갱신
- **DB-first 검색 + 섹터 추론**: `stock_master`/`sector_master` 우선 조회, KIS 업종코드(`bstp_cls_code`)로 미등록 종목도 섹터 peer 탐색
- **관심 종목 리서치 허브**: local-first 관심 종목의 현재가·등락률·섹터·AI 요약·이슈·감성·투자의견 집계

### 오버나이트 스크리닝
- 주봉·일봉 정배열 (120봉 페이지네이션)
- 거래량 회전율 (`vol_tnrt ≥ 5%`)
- 윗꼬리 제한 (당일 일봉 고가 기준 ≤ 3.5%, 정석·공격형 공통)
- KIS 현재가 기반 위험종목 정밀 배제
- KOSDAQ/KOSPI 거시필터 (120일 정배열 병렬 판정)
- 결과는 Supabase에 영속 저장 (Redis·파일 폴백)

### 백테스트
- 스크리닝 결과 대비 다음 거래일 시가/종가 수익률 집계
- 확정값(`next_open`·`close_return`·`trend` 등)은 조회 시점에 DB write-back 후 재사용
- 윗꼬리·거래량비·회전율·수익률을 숫자 컬럼으로 분리 저장해 조건별 통계 쿼리 지원
- 소급 시드 입력 지원 (`/api/screening/seed`)

### 발굴 종목 추적 (`/overnight/tracking`)
- 최초 등장 기준 4컬럼 칸반 (판단대기 / 혼조 / 강세지속 / 약세전환)
- 궤적 일일 자동 갱신 + 기술지표 (RSI·MACD·볼린저·스토캐스틱·윌리엄스%R)
- 퀀트 신호(RSI+거래량)는 별도 트랙에서 3일차 실현손익 시뮬레이션으로 검증

### 인프라 · 안전장치
- **KIS 시세/주문 격리**: 시세는 실전 도메인·실전 키, 주문은 모의투자
- **단일 KIS 요청 큐**: `globalThis` 싱글톤 큐(350ms 간격)로 직렬화, 한도 초과 시 부분 성공 데이터만 서비스(Graceful Break)
- **평가 레이어 + 추천 가드레일**: 환각·최신성·출처 충분성·면책 자동 검증, 지시적 매매 언어 차단
- **데이터 오염 무관용**: production fallback은 mock 종목/섹터를 노출하지 않음
- **전역 테마**: light / dark / system 토큰 기반

---

## 알려진 이슈 / 운영 주의

| 이슈 | 상태 | 상세 |
|---|---|---|
| 스크리닝 공백 시 `days_after` 어긋남 | 수정 전 (재발 방지 설계 승인 대기) | `trajectory-update.ts`의 `days_after`가 "직전 최대값 + 1" 카운터라, 미실행일만큼 실제 거래일보다 작게 기록됨 |
| 종가 재조회 값 불일치 | 원인 일부 미확인 | 복구 후 일부 행의 종가가 변경됨(외부 시세 대조 시 새 값이 일치). 조회 시점 영향 여부 조사 중 |
| 퀀트 통계 사용 제한 | 재산출 전까지 유지 | 오염 구간 입력이 섞였을 가능성, 표본도 목표 미달. **매매 근거로 사용하지 않음** |
| 백업 테이블 유지 | 후속 검증 완료 시까지 | `stock_trajectory_backup_20261007`, `snap_20261008_1023` 삭제 금지 |

자세한 내용은 `docs/phases/`와 [known-issues.md](docs/release/known-issues.md)를 참고하세요.

---

## 중요 정책 (Non-Negotiables)

- 인트라데이(당일 분봉) 데이터는 의도적으로 숨김
- 홈 화면은 단일 `/api/home/intelligence` fetch (카드별 개별 fetch 금지)
- 사용자 데이터는 명시적 저장 액션에만 로컬 스토리지에 기록
- AI 추천은 항상 출처 수·위험 고지·disclaimer 동반
- production fallback은 mock 데이터를 노출하지 않음

---

## 기술 스택

| 항목 | 내용 |
|---|---|
| Framework | Next.js (App Router) |
| Database | Supabase (PostgreSQL + pgvector) |
| AI 런타임 | Gemini 2.5 Flash + Flash-Lite (2-stage routing) |
| AI 임베딩 | Gemini text-embedding-004 (768dim) |
| 데이터 소스 | KIS API · Open DART · GNews · NewsAPI |
| 스타일링 | Tailwind CSS v4 |

---

## 개발 스크립트

```bash
npm run validate           # lint + typecheck
npm run validate:full      # 전체 테스트 + 빌드
npm run validate:db-master # 원격 stock_master/sector_master 검증
npm run sync:stock-master  # DART corp-master → stock_master 동기화
npm run test:evals         # AI 평가 테스트
```

---

## 문서

전체 구조는 [docs/README.md](docs/README.md) 기준입니다.

- [architecture.md](docs/core/architecture.md) — 시스템 아키텍처
- [setup.md](docs/core/setup.md) — 로컬 환경 설정
- [theme-behavior.md](docs/core/theme-behavior.md) — 테마 동작과 token contract
- [recommendation-guardrails.md](docs/core/recommendation-guardrails.md) · [evaluation-policy.md](docs/core/evaluation-policy.md) — 추천/평가 정책
- [known-issues.md](docs/release/known-issues.md) · [ops-playbook.md](docs/ops/ops-playbook.md) — 알려진 이슈/운영
- Phase 리포트: `docs/phases/` 참고

---

<details>
<summary><strong>페이즈 이력 (1–42)</strong></summary>

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
| 37 | KIS 시세/주문 이원화, 거시필터 지수 페이지네이션(120봉) + 하루 캐시, 요청 큐 단일화(350ms), 자격증명 노출 차단 |
| 38 | 일봉/주봉 페이지네이션(120봉), 분석 대상 8종목 cap, 비정상/동전주 폐기 필터, excludedNotice 분리, 백테스트/시드 API, 오버나이트 UI |
| 39 | ETF 필터(TIME/액티브), 스크리닝 저장 누락 수정, 백테스트 closeReturn null 버그 수정 |
| 40 | 윗꼬리(tailRatio) 계산 버그 수정 + 공격형 윗꼬리 게이트, 분석 지표 컬럼 9종(009 마이그레이션), 백테스트 write-back |
| 41 | 발굴 종목 추적 화면 신설, 궤적 일일 갱신 + 기술지표 확장, 퀀트 신호 3일차 시뮬레이션 검증 |
| **42 (현재)** | **추적 데이터 정합성 진단·복구** |

</details>

> 본 서비스는 투자 참고용 AI 리서치 정보를 제공하며, 투자 판단 및 책임은 전적으로 이용자 본인에게 있습니다.