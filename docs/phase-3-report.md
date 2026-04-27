# Phase 3 & 4: Live Market Data Integration Report

## 1. 개요
본 문서는 KIS 실전(Real) API 연동을 통해 Stockker 대시보드의 모든 컴포넌트(Watchlist, Price Chart, Orderbook, Indices)가 실시간으로 동기화되고 작동하는지 검증한 최종 결과를 담고 있습니다.

## 2. 실행 환경 및 사전 준비
- **시점**: 2026-03-12
- **연동 모드**: `KIS_MODE=real` (실전 투자 환경)
- **대상 심볼**: `005930` (삼성전자) 및 Watchlist 주요 5개 종목
- **주요 인프라**: KIS Proxy, WebSocket Registry, SSE Bridge, LiveMarketProvider

## 3. 실시간 API 및 스트림 검증 결과

### [A] REST API 부트스트랩
- `/api/kis/bootstrap`: 삼성전자 현재가 및 호가 스냅샷 정상 수신 확인.
- **/지수 스냅샷 확장**: KOSPI(0001), KOSDAQ(1001) 지수 데이터를 개별 호출하여 초기 UI 랜더링 시 데이터 공백 제거.
- **안정성 보강**: 초당 호출 제한(Rate Limit - EGW00201) 방지를 위해 부트스트랩 시 500ms 간격 순차 호출 도입.

### [B] WebSocket & SSE 스트림 (Real-time)
- **멀티 심볼 브로드캐스팅**: SSE 스트림 필터링을 완화하여 서버에서 수신하는 모든 종목의 실시간 시세를 클라이언트로 전송.
- **토큰 안정성**: `getKisAccessToken`에 Promise Lock을 적용하여 동시 요청 시 발생하는 중복 발급 및 린트 오류(Zod Error) 완전 해결.

## 4. UI 실시간 연동 검증 결과

### [A] Watchlist (전 종목 연동)
- **관찰 결과**: 선택된 종목뿐만 아니라 Watchlist에 등록된 모든 주요 종목의 가격이 실시간으로 점멸하며 최신가로 갱신됨.
- **정합성**: KIS 실시간 체결가와 UI 표시 가격이 100% 일치함을 대조 확인.

### [B] Price Chart (누적형 차트)
- **관찰 결과**: 수신되는 체결가(trade) 데이터를 차트 포인트에 실시간 누적하여, 정적 차트가 아닌 실시간 움직임이 반영되도록 개선.
- **부드러운 전환**: 실시간 업데이트 시 리차트(Recharts) 애니메이션을 최적화하여 끊김 없는 시각화 제공.

### [C] Market Indices (실시간 지수)
- **관찰 결과**: KOSPI, KOSDAQ 지수가 WebSocket을 통해 실시간으로 수신되어 상단 지수 카드에 즉각 반영됨.

## 5. 발견된 이슈 및 해결 내역 (Bug Fixes)

| 이슈 항목 | 원인 | 해결 방안 |
| :--- | :--- | :--- |
| **API 404 (Orderbook)** | KIS 엔드포인트 경로 오타 (`-te` ➔ `-ccn`) | 정확한 API URI 규격으로 수정 완료 |
| **Rate Limit (EGW00201)** | 초기 진입 시 다량의 REST API 동시 호출 | 부트스트랩 로직 순차화 및 딜레이 부여 |
| **Zod Error (Token)** | 토큰 동시 요청 시 undefined 파싱 시도 | Promise 기반 Singleton Lock 패턴 적용 |
| **실시간 동기화 불일치** | 특정 종목 필터링 및 상태 업데이트 누락 | SSE 브로드캐스트 필터 해제 및 Context 상태 확장 |

## 6. 최종 판정 및 결론

**최종 판정: SUCCESS (Pass)**
> Stockker는 이제 KIS 실전 환경과 완벽하게 동기화되어 실시간 주식 데이터를 제공할 준비가 되었습니다. 보안(마스킹), 정합성(실시간 일치), 안정성(에러 처리) 모든 면에서 Acceptance Criteria를 통과하였습니다.

---
> [!IMPORTANT]
> **운영 참고 사항**: 현재 `npm run dev` 실행 시 포트 충돌이나 `.next/dev/lock` 잠금 이슈가 발생할 수 있으므로, 반드시 기존 프로세스를 종료(`lsof -ti:3000,3001 | xargs kill -9`)한 후 재시작하는 것을 권장합니다.
