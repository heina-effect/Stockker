# Stockker (Phase 12: Real AI Pipeline & Persistence)

Stockker는 단순한 시세 대시보드를 넘어, 실제 시장 뉴스(KIS)와 공식 공시(Open DART) 데이터를 통합한 **데이터 기반 AI 리서치 및 개인화 플랫폼**으로 진화했습니다.

## 🌟 주요 특징 (Features)

*   **Search-First UX**: 접속하자마자 방대한 "호가창"을 마주하지 않습니다. 궁금한 종목을 직관적인 검색창(Hero)에서 검색하여 AI 리포트를 발급받습니다. 최근 검색어와 관심 종목도 즉시 확인 가능합니다.
*   **Real Data AI Pipeline**: KIS 실시간 뉴스 API와 Open DART 공시 API를 결합하고 중복 제거/정렬을 거쳐 정규화된 `핵심 이슈 타임라인`을 제공합니다.
*   **Actionable Plan**: 자신의 평균 매수가(평단가)를 명시적으로 입력하고 저장할 수 있으며, AI가 포지션을 진단하고 액션 가이드 지침을 제안해 줍니다.
*   **Local-First Persistence**: 사용자의 테마, 북마크, 최근 본 종목, 검색어, 관심 종목, 평단가 등이 브라우저 로컬 스토리지 기반으로 빠르고 안전하게 동기화됩니다.
*   **Background Data Freshness**: KIS API와 SSE 웹소켓은 "가격의 신선도"를 실시간으로 맞추는 백그라운드 엔진으로 조용하게 구동되고 있습니다. 상세 진입 시 Fan-out을 억제하여 Rate-limit 에러(EGW00201)를 완벽히 통제합니다.

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js 16.1.6 (App Router)
*   **Language**: TypeScript (Strict)
*   **Styling**: Tailwind CSS v4, shadcn/ui
*   **Data Sources**: KIS API (Live Quote/News), Open DART API (Disclosures)
*   **AI Router**: `pipeline/*` 기반 데이터 수집/정규화 모델

## 🚀 개발 및 실행 (Getting Started)

최신 노드 환경에서 의존성을 설치하고 컴파일/실행합니다.

```bash
# 1. 의존성 설치
npm install

# 2. 로컬 개발 서버 실행
npm run dev

# 3. 브라우저에서 접속
# http://localhost:3000
```

> **버그 우회 / 초기화 팁** : `.next` 캐시 등으로 Next.js가 꼬이거나 스타일이 깨진다면 `npm run dev:reset` 명령어를 사용하여 깨끗하게 서버를 다시 켤 수 있습니다.

## 📝 프로젝트 페이즈 마일스톤
- Phase 1~4: 실시간 Dashboard 엔진 구축
- Phase 5: Research-first 프로덕트 피벗 및 Mock API 구축
- Phase 6~8: UI Validation 및 차트 도입 기초
- Phase 9~10: KIS 실제 시세/뉴스 API 연동 및 데이터 무결성 검증
- Phase 11: KIS Rate-Limit 핫픽스, 당일 차트 억제, API 리소스 실체화 준비
- **Phase 12 (현재): Open DART 공시 실연동, AI 파이프라인 정규화, 로컬 영속성 레이어(User Persistence) 완성**
