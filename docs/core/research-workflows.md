# Saved Research Workflows

## 1. 목적 (Purpose)
단편적인 '데이터 저장'을 넘어, 사용자가 저장한 상태(Local State)를 의미 있는 '일상적 리서치 흐름(Daily Workflow)'으로 전환합니다. 모든 저장 상태는 사용자의 명시적 액션(또는 조회)에 의해서만 기록되며, 브라우저 로컬 스토리지에 유지됩니다 (Local-First).

## 2. 제공되는 워크플로우 (Available Workflows)

### A. 관심 종목 리서치 모아보기 (`/workflows/watchlist`)
- **트리거**: 홈 검색 결과의 `관심 종목 추가` 버튼.
- **저장소**: `LocalStorageAdapter.watchlist`가 단일 source of truth입니다. 서버 DB sync는 하지 않습니다.
- **활용**: 내가 관심 있는 종목 리스트의 현재가, 등락률, 섹터, AI 한줄 요약, 최근 핵심 이슈, 감성 상태, 공시/뉴스 수, 투자의견 요약을 한 화면에 펼쳐줍니다. snapshot이 없으면 카드가 사라지지 않고 `리포트 준비 중` 상태로 남습니다.
- **데이터 경로**: `/api/watchlist/summary?symbols=...`가 `/report`, `/sentiment`, `/issues`, KIS 현재가, KIS 투자의견을 묶어 반환합니다.

### B. 최근 본 종목 히스토리 (`/workflows/recent`)
- **트리거**: 종목 상세 페이지 조회 시 자동 저장.
- **활용**: 최근 내가 검색하고 둘러본 종목들의 현재 '감성 트렌드(Bullish/Bearish 점수)'와 '긍/부정 핵심 요인'을 리마인드해 줍니다. 

### C. 북마크 리포트 읽기 (`/workflows/bookmarks`)
- **트리거**: 종목 리포트 내의 '리포트 저장' 액션.
- **활용**: 당장 읽기 부담스럽거나 나중에 다시 곱씹어보고 싶은 심층 리포트를 별도의 "Read-it-later" 보드로 분리합니다. 

## 3. 핵심 규칙 (Non-Negotiables)
- **Local-first Persistence**: 현재 모든 워크플로우 데이터는 `LocalStorageAdapter`를 거칩니다. 백엔드 DB 오염 방지 및 개인정보 보호.
- **AI 갱신 주기 (Stale-while-revalidate)**: 워크플로우 대시보드 진입 시, 모든 종목에 대해 동시에 실시간 AI 요약을 요청하면 API Quota가 터질 위험이 있습니다. 반드시 `getOrGenerateSnapshot`의 스냅샷 재사용 및 백그라운드 갱신 로직에 의존합니다.
- **Explicit Save-Only**: 관심 종목 기본값은 빈 배열입니다. 사용자가 검색 결과에서 직접 추가한 종목만 저장합니다.
- **No Trading Terminal**: watchlist는 리서치 허브이며 주문/잔고/매매 추천 UI로 확장하지 않습니다.
