# Stockker Research API Contract

본 문서는 프론트엔드와 Model Router(`src/server/research/model-router.ts`) 간의 데이터 규격을 정의합니다. Phase 5 기준 모든 엔드포인트는 `mock-data.ts`를 통해 결정론적으로 응답합니다.

## 1. Search API
**Endpoint**: `GET /api/stocks/search?q={query}`
**Response**:
```json
{
  "ok": true,
  "results": [
    {
      "symbol": "005930",
      "name": "삼성전자",
      "type": "stock",
      "market": "KOSPI",
      "matchScore": 100
    }
  ]
}
```

## 2. Report Summary API
**Endpoint**: `GET /api/stocks/[symbol]/report`
**Response**:
```json
{
  "ok": true,
  "report": {
    "symbol": "005930",
    "name": "삼성전자",
    "currentPrice": 75000,
    "change": 1500,
    "changeRate": 2.0,
    "aiHeadline": "반도체 수급 개선 기대로 단기 모멘텀 유지",
    "aiSummary": "글로벌 파운드리 수요 회복 파급 효과...",
    "priceFreshness": "live",
    "reportFreshness": "recent",
    "lastUpdated": "2026-03-20T17:00:00Z"
  }
}
```

## 3. Issues Timeline API
**Endpoint**: `GET /api/stocks/[symbol]/issues`
**Response**:
```json
{
  "ok": true,
  "issues": [
    {
      "id": "issue-1",
      "title": "AI 메모리 수요 폭발",
      "summary": "...",
      "timestamp": "2026-03-20T16:50:00Z",
      "source": "한국경제",
      "sourceType": "news",
      "impact": "positive"
    }
  ]
}
```

## 4. Sentiment Analysis API
**Endpoint**: `GET /api/stocks/[symbol]/sentiment`
**Response**:
```json
{
  "ok": true,
  "sentiment": {
    "score": 75,
    "label": "강세",
    "positiveFactors": ["...", "..."],
    "negativeFactors": ["...", "..."],
    "freshness": "recent",
    "lastUpdated": "2026-03-20T17:00:00Z"
  }
}
```

## 5. Buy Position Strategy API
**Endpoint**: `POST /api/stocks/[symbol]/buy-plan`
**Body**: `{ "targetPrice": 80000 }`
**Response**:
```json
{
  "ok": true,
  "buyPlan": {
    "targetPrice": 80000,
    "currentProfitLossRate": -6.25,
    "positionAnalysis": "평균 매수가 대비 손실권에 위치해 있습니다.",
    "actionGuides": [
      "추가 하락 시 분할 매수 고려",
      "기술적 반등 지표 집중 관찰"
    ],
    "generatedAt": "2026-03-20T17:05:00Z"
  }
}
```
