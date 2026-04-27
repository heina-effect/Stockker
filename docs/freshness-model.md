# Freshness Model (Information Currency System)

Stockker 리서치 에디션은 트레이딩 화면에서 볼 수 있는 "Stale Warning", "Reconnect Spinner" 등의 강한 알람(Alarm/Alert) 개념을 버리고, 정보가 생성된 주기를 부드럽게 표현하는 **Freshness(신선도)** 라는 메타포를 도입했습니다.

## 1. 프레시니스 상태 종류
```typescript
type FreshnessState = "live" | "recent" | "stale" | "loading" | "error";
```

## 2. 도메인별 기준

### Price Freshness (가격 신선도)
KIS SSE WebSocket 등에서 가격이 들어옵니다.
- `live`: 현재 웹소켓 틱이 활발히 들어오는 상태 (장중). 라벨: "가격 실시간"
- `stale`: 마지막 틱 이후 일정 시간(예: 장 마감)이 지나 갱신이 멈춘 상태. 라벨: "가격 n시간 전" 또는 "가격 지연됨"
- `error`: 네트워크 에러 또는 KIS API 초과 등으로 Fallback(과거 마감가 등) 노출 중인 상태. 라벨: "가격 지연됨 (Mock)"

### Report Freshness (리포트 신선도)
최초로 사용자가 검색을 눌러 종목 상세 진입 시 AI가 요약을 생성한 시점입니다.
- `recent`: 리포트가 방금 생성됨. 라벨: "리포트 방금 생성"
- `stale`: 캐싱된 리포트가 24시간이 경과하여 재생성이 권장되는 경우.

### News/Issue Freshness (이슈 신선도)
각 뉴스와 공시(IssueItem)의 `timestamp` 값을 기준으로, 현재 시각 대비 `시간 전`, `분 전` 형태의 TimeAgo 스트링으로 시각화합니다. 심각한 Warning 스타일(빨간색 배경 등)을 사용하지 않고 회색/부드러운 컬러셋으로 표시합니다.

## 3. UI 컴포넌트 (`FreshnessLabel`)
- `Live`일 경우 파스텔 블루/초록.
- `Stale` 또는 `Error` 시 파스텔 호박색/오렌지로 조용하게 깜빡임 없이 디자인.
- "방금 전", "15분 전", "하루 전" 등의 인간 친화적 TimeAgo 표기법을 준수합니다.
