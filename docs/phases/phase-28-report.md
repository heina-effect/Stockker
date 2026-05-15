# Stockker Phase 28 — DB 중심 종목·섹터 관리 전환

**기간:** 2026-05-12 ~ 2026-05-13  
**주제:** 메타데이터 하드코딩 제거, Supabase DB 기반 동적 관리 체계 구축  
**상태:** ✅ Phase 1 완료, Phase 2 설계 완료 (다음 세션)

---

## 배경

- **문제점:** 
  - KOSPI/KOSDAQ 2,500개 종목 중 ~50개만 metadata.ts에 하드코딩
  - 12개 섹터만 taxonomy.ts에 하드코딩
  - 종목/섹터 추가 시 코드 수정 + 빌드 + 배포 필요

- **목표:**
  - DB를 source of truth로 사용
  - 코드 변경 없이 DB에서만 관리 가능하게 전환
  - 향후 관리자 UI에서 실시간 추가/수정 가능한 기초 마련

---

## 작업 A: 신규 5개 섹터 + 17개 종목 추가

### 새로운 섹터 (taxonomy.ts에서 DB로 migration)

| 섹터 ID | 이름 | 아이콘 | 대표종목 | 설명 |
|---------|------|--------|---------|------|
| sec-defense | 우주항공·방산 | shield | 012450, 073120 | 글로벌 지정학적 리스크와 국방 현대화 수요 |
| sec-ai-infra | AI 인프라·전력 | zap | 267260, 010120 | AI 연산 수요 폭증 → 데이터센터/전력망 증설 |
| sec-obesity-bio | 차세대 바이오·비만 | dna | 196170, 000100 | GLP-1 비만치료제 & 약물 전달 플랫폼 |
| sec-robotics | 로봇·자동화 | bot | 277810, 454910 | 인구 구조 변화 + AI 결합 산업/서비스 로봇 |
| sec-advanced-materials | 첨단 소재·기판 | layers | 009150, 033640 | 차세대 반도체 패키징(유리기판) & 고부가 소재 |

**종목 추가 (metadata.ts → stock_master):**
- 총 17개 신규 종목 등록
- 기존 ~50개와 함께 ~67개로 확대
- 모두 migration 005의 seed SQL에 포함

---

## 작업 B: DB 테이블 설계 & 생성 (Migration 005)

### 스키마

#### `sector_master` 테이블
```sql
sector_id TEXT PRIMARY KEY
name TEXT NOT NULL
aliases TEXT[] — ["K-방산", "전투기", "미사일", ...]
description TEXT
member_symbols TEXT[] — 섹터 소속 모든 종목 심볼
representative_symbols TEXT[] — 대표 3개 종목
icon_key TEXT — UI 아이콘 키
is_active BOOLEAN DEFAULT TRUE
display_order SMALLINT — 홈 화면 정렬용
created_at / updated_at TIMESTAMPTZ
```

**인덱스:**
- `idx_sector_master_active(is_active, display_order)` — 활성 섹터 정렬
- `idx_sector_master_members USING GIN(member_symbols)` — 빠른 검색

#### `stock_master` 테이블
```sql
symbol TEXT PRIMARY KEY
name TEXT NOT NULL
market TEXT CHECK (IN 'KOSPI', 'KOSDAQ', 'INDEX', 'ETF')
sector_tag TEXT
is_active BOOLEAN DEFAULT TRUE
created_at / updated_at TIMESTAMPTZ
```

#### RLS 정책
- **SELECT:** PUBLIC (모두 읽기 가능)
- **INSERT/UPDATE/DELETE:** service_role만 (관리자 UI 전용)

### Seed 데이터
- **sector_master:** 12개 + 신규 5개 = **17개 섹터**
- **stock_master:** ~50개 + 신규 17개 = **~67개 종목**
- **적용:** Migration 005 seed SQL에 포함

---

## 작업 C: 서버 레지스트리 구현 (db-registry.ts)

### 캐싱 전략: Stale-While-Revalidate + In-Flight Dedup

```
TTL_FRESH = 5분       // DB 쿼리 없이 즉시 반환
TTL_STALE = +5분 추가 // 백그라운드 갱신하며 stale 반환
Lazy Load             // 첫 요청 시 로드 (cold start 최소화)
Static Fallback      // DB 실패 시 taxonomy.ts/metadata.ts 동적 import
```

### 제공 함수

| 함수 | 설명 |
|------|------|
| `getDBSectorUniverse()` | 모든 섹터 로드 |
| `getDBStockUniverse()` | 모든 종목 로드 |
| `getDBStockName(symbol)` | 종목명 조회 |
| `invalidateRegistryCache()` | 캐시 무효화 |

---

## 작업 D: 서버 사이드 코드 전환 (6개 파일)

### 전환 파일

| 파일 | 변경 |
|------|------|
| **orchestrator.ts** | 상수 → async 함수로 변경 |
| **home-intelligence-normalizer.ts** | sectorUniverse 파라미터 주입 |
| **sector-snapshot-manager.ts** | getDBSectorUniverse() 사용 |
| **related-stocks.ts** | async findSectorForSymbol() |
| **disclosure-provider.ts** | O(n) → O(1) 성능 개선 |
| **home-cache.ts** | DB 레지스트리 통합 |

---

## 검증

### 로컬 검증
- ✅ `npm run typecheck` — TypeScript 0건
- ✅ `npm run build` — 성공
- ✅ 테스트 수정 — 파라미터 추가

### DB 적용
- ✅ `npx supabase db push` — Migration 005 적용 완료
- ✅ sector_master: 17행 ✓
- ✅ stock_master: ~67행 ✓

---

## 주요 파일 변경

| 파일 | 상태 | 설명 |
|------|------|------|
| `supabase/migrations/005_master_tables.sql` | 🆕 | schema + seed |
| `src/lib/stocks/db-registry.ts` | 🆕 | 서버 레지스트리 |
| `src/server/ai/orchestrator.ts` | 🔧 | async 함수 |
| `src/server/ai/home-intelligence-normalizer.ts` | 🔧 | 파라미터 주입 |
| `src/server/research/snapshots/sector-snapshot-manager.ts` | 🔧 | DB 로드 |
| `src/server/research/pipeline/related-stocks.ts` | 🔧 | async 호출 |
| `src/server/research/providers/disclosure-provider.ts` | 🔧 | O(1) 룩업 |
| `src/server/ai/home-cache.ts` | 🔧 | DB 통합 |

---

## Phase 2 설계 (다음 세션)

**문제:** 7개 클라이언트 컴포넌트의 동기 호출  
**해결:** RSC에서 props로 전달 (getDBStockName, API route 등)

---

## 결론

**메타데이터 관리를 "파일 기반 → DB 기반"으로 완전 전환**

### 즉시 효과
- ✅ 종목/섹터 추가 = DB insert만
- ✅ 5분 이내 동적 반영
- ✅ DB 다운 시 fallback 안정성
- ✅ O(n) → O(1) 성능 개선

### 향후 가능성
- Phase 2: 클라이언트도 DB 기반 (RSC)
- Phase 3: 관리자 UI (종목/섹터 CRUD)

---

**Commit:** `19c1434`  
**Migration:** 2026-05-13 ✅
