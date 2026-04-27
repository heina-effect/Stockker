# Stockker (Phase 5: Research API Pivot)

Stockker는 정보 과부하를 초래하는 기존의 실시간-호가 중심 트레이딩 대시보드 구조에서 탈피하여, KIS 실시간 API와 AI 요약 모델을 접목한 **심플한 검색 기반 리서치 및 시뮬레이션 서비스**로 재설계되었습니다.

## 🌟 주요 특징 (Features)

*   **Search-First UX**: 접속하자마자 방대한 "호가창"을 마주하지 않습니다. 궁금한 종목을 직관적인 검색창(Hero)에서 검색하여 AI 리포트를 발급받습니다.
*   **Simple & Clean Report**: 종목 진입 시 캔들 차트를 단순화한 유선형 트렌드 차트와 함께 `AI 한 줄 요약`, `실시간 이슈 타임라인`, `현재 감성 점수(Sentiment)`를 받아볼 수 있습니다.
*   **Actionable Plan**: 자신의 평균 매수가(평단가)를 입력하면, AI가 포지션을 진단하고 앞으로 어떻게 비중을 조절해야 할지 3단계 액션 가이드 지침을 제안해 줍니다.
*   **Background Data Freshness**: 기존 Phase 1~4 구동 엔진이었던 KIS (한국투자증권) API와 SSE 웹소켓 갱신은 삭제되지 않고 여전히 "가격의 신선도"를 실시간으로 맞추는 훌륭한 백엔드로 백그라운드에서 조용하게 구동되고 있습니다. (Orderbook 기능 보류)

## 🛠️ 기술 스택 (Tech Stack)

*   **Framework**: Next.js 16.1.6 (App Router)
*   **Language**: TypeScript (Strict)
*   **Styling**: Tailwind CSS v4, shadcn/ui
*   **State & Viz**: Recharts (Simple Line), Zod
*   **AI Router**: `gemini-3.1-flash-lite`, `gemini-3-flash` 기반 결정론적 Stub 컨트롤러 

## 🚀 개발 및 실행 (Getting Started)

최신 노드 환경에서 의존성을 설치하고 컴파일/실행합니다. (KIS API Key 필요 없음 - Phase 5는 결정론적 Mock-data 기본 사용)

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
- Phase 1: 기본 UI 스캐폴딩 및 Vercel/Mock 환경 세팅
- Phase 2: KIS Open API 토큰 매니저 연동
- Phase 3: SSE WebSocket 체결/틱 데이터 연동 및 스토어 고도화
- Phase 4: 지수(KOSPI) 컴포넌트 데이터 처리 및 Stale UX 안정화
- Phase 5: 실시간 Dashboard에서 Research-first로 프로덕트 피벗 및 AI Mock API 구축
- Phase 6~8: UI Validation, Local Persistence, Candlestick 도입
- Phase 9~10: KIS 실제 시세/뉴스 API 연동 및 데이터 무결성 검증
- **Phase 11 (현재): KIS Rate-Limit 핫픽스, 당일 차트 억제, 오픈 DART 공시 연동 구조 기반 리포트 신뢰도 제고**
