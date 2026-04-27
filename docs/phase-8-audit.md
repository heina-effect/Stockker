# Phase 8 Audit & Reality Check

## 1. Package Manager & Scripts
- 현재 `package.json`은 `npm`을 사용하고 있으며, 스크립트에는 `dev`, `build`, `start`, `lint`, `typecheck` 등이 존재함. E2E 테스트 스크립트는 존재하지 않으나 향후 추가를 고려할 수 있음.
- `dev:reset` 스크립트나 로컬 db 리셋이 명확하지 않아 로컬 스토리지 기반 초기화를 안내해야 함.

## 2. Metadata Universe
- **현재 상황**: `src/lib/stocks/metadata.ts`에서 하드코딩된 seed (삼성전자, SK하이닉스 등 약 10개 종목)만 존재. 이로 인해 KOSDAQ/소형주/ETF 등은 검색 불가능.
- **Drift 대응**: `metadata.ts`를 파일 내 대량 JSON 형식 또는 별도 파일 데이터 기반으로 로드하여, 전체 KOSPI/KOSDAQ 종목을 포괄할 수 있도록 확장해야 함.

## 3. Chart Rendering
- **현재 상황**: Phase 7에서 `IntradayCandlestickChartCard`로 당일 틱 데이터를 파싱하여 1분봉 캔들로 보여주게 변경됨. 하지만 장기간의 시세 흐름(일봉)을 볼 수가 없으며, 캔들 바디/꼬리가 커스텀 처리 없이 `Bar` 컴포넌트로만 되어 있어 OHLC 구분이 완벽하지 않음 (꼬리 부재).
- **Drift 대응**: 일봉 데이터를 가져오는 로직 (또는 Mock)을 붙이고, Recharts의 Custom Shape를 사용해 실제 캔들 꼬리(wick)와 몸통(body)을 일봉 단위로 렌더링해야 함.

## 4. Buy-Plan (평단가 가이드) 입력 UX
- **현재 상황**: HTML 기본 `number` input으로 되어 있어 천단위 표기가 불가능하고 한국식 금액도 알 수 없음.
- **Drift 대응**: `text` input으로 전환하며, 컴마 formatting 및 raw value 관리를 분리. 그리고 LocalStorage를 활용해 리로드 시 복원 기능 추가.

## 5. Persistence & Auth
- **현재 상황**: 로그인 시스템이나 유저 DB가 없어 모든 개인화 데이터(관심 종목, 평단가)가 세션(useState 레벨)에만 맴돔.
- **Drift 대응**: `src/lib/user-storage/` 아키텍처를 두고 웹 브라우저의 `localStorage` 어댑터를 사용하여 Local-First 무인증 저장소 역할을 하도록 함.

## 6. KIS 환경변수 Naming
- `KIS_ENV`와 `KIS_MODE`가 혼용되어 쓰이고 있으나 `KIS_MODE`가 Canonical Name으로 잡혀있음. 코드 상에서 `KIS_MODE`를 우선 검사하는 것을 확인.
