# Phase 39 Report — ETF 필터 보강 + 스크리닝 저장 누락 + 백테스트 종가 null 수정

## 완료 요약

Phase 38에서 발견된 운영 버그 3종을 수정했다. "TIME 미국나스닥100액티브"가 ETF 필터를 통과해 `exclude`에 오탐 노출되는 문제, 스크리닝 `ok:true` 응답 후 백테스트 저장이 누락되는 경로 버그, 그리고 백테스트 `closeReturn`이 항상 `null`로 반환되던 로직 오류를 해소했다.

---

## 버그 1 — ETF 필터 오탐 (`overnight/route.ts`)

### 문제
`etfPrefixRegex`에 "TIME" 브랜드가 없어 "TIME 미국나스닥100액티브" 등이 필터를 통과해 `results.exclude`에 노출됐다.

### 수정
```typescript
// before
/^(KODEX|TIGER|KBSTAR|ACE|SOL|HANARO|KOSEF|ARIRANG|KINDEX|KOEX|ETN|RISE|코덱스|타이거|라이즈)/i

// after
/^(KODEX|TIGER|KBSTAR|ACE|SOL|HANARO|KOSEF|ARIRANG|KINDEX|KOEX|ETN|RISE|TIME|코덱스|타이거|라이즈)/i
```

`derivativeRegex`에 `액티브` 키워드 추가. `corp-master.json` 전수 확인 결과 "액티브" 포함 일반 주식 종목 0건(유일 사례 "신한글로벌액티브리츠"는 리츠로 필터 대상).

```typescript
// before
/레버리지|인버스|선물/i
// after
/레버리지|인버스|선물|액티브/i
```

---

## 버그 2 — 스크리닝 저장 누락 (`overnight/route.ts`)

### 문제 (확인)
7/3 스크리닝이 `ok:true`로 성공했으나 백테스트에서 `byDate`/`pending` 모두 비어있었다. `normalBucket`, `aggressiveBucket`, `excludeBucket`, `excludedNotice`, `analyzedSymbols`, `reduceWeight`, `kosdaqClose`가 외부 `try` 블록 내부에 선언되어, 외부 `catch` 블록에서 이 변수들에 접근할 수 없었다. 분석 루프 이후 예외가 발생하거나 디버그 모드에서 예외를 re-throw하는 경로에서 `analyzedSymbols.size > 0`임에도 저장 없이 mock fallback이 반환됐다.

### 수정
버킷 변수 7개를 외부 `try` 앞으로 호이스팅하고, 외부 `catch`에 저장 로직 추가.

```typescript
// 함수 스코프에 선언
let normalBucket: any[] = [];
let aggressiveBucket: any[] = [];
let excludeBucket: any[] = [];
let excludedNotice: ...[] = [];
let analyzedSymbols = new Set<string>();
let reduceWeight = false;
let kosdaqClose = 0;

// 외부 catch에 추가
if (analyzedSymbols.size > 0) {
  try {
    await saveScreeningResult({ date: todayKey, reduceWeight, kosdaqValue: kosdaqClose, items: partialItems });
  } catch (saveErr) { ... }
}
```

### 각 종료 경로별 저장 여부

| 경로 | 저장 |
|------|------|
| 정상 반환 (ok:true) | ✅ (기존) |
| rate limit break + size > 0 | ✅ (기존) |
| **외부 catch + size > 0** | ✅ **(신규)** |
| analyzedSymbols.size === 0 → mock | ❌ 의도적 |
| volume-rank 빈 결과 → mock | ❌ 의도적 |

---

## 버그 3 — 백테스트 closeReturn 항상 null (`backtest/route.ts`)

### 문제 (확인)
7/3 종목 7개의 `openReturn`(시가)은 정상 조회됐으나 `closeReturn`(종가)은 전부 `null`. 7/7 재확인에도 동일 — 장 마감 타이밍 문제가 아님.

### 원인
`findNextTradingDay`가 이미 `nextClose`(다음 거래일 종가)를 올바르게 반환함에도, 코드가 이를 무시하고 `fetchDailyAround(symbol, nextDate)`를 별도 호출했다. 이 호출은 앵커 `nextDate + 14`의 캐시를 조회하므로 응답 `[0]`은 호출 당일 봉(7/7)이고, `=== nextDate(7/6)` 매칭이 실패해 항상 `null`.

```
// openReturn 경로
fetchDailyAround(symbol, entryDate="20260703")
  → candles [7/7, 7/6, 7/5, ..., 7/3, ...] 포함
  → findNextTradingDay(): idx(7/3) - 1 = 7/6 candle 반환 ✓
  → nextTrading.nextClose = 7/6 종가 ✓

// closeReturn 경로 (버그)
fetchDailyAround(symbol, nextDate="20260706") → anchor 7/20
  → closeFetch[0].stck_bsop_date = "20260707"(오늘)
  → "20260707" === "20260706" → false → nextClose = null ✗
```

### 수정
2차 API 호출 제거. `nextTrading.nextClose`를 직접 사용.

```typescript
// before: 별도 fetchDailyAround + closeFetch[0] 매칭
// after
const nextClose = nextTrading.nextClose > 0 ? nextTrading.nextClose : null;
const closeReturn = nextClose !== null && item.entryClose > 0
  ? ((nextClose - item.entryClose) / item.entryClose) * 100
  : null;
```

불필요한 KIS API 콜 종목당 1회 절약.

---

## 검증

```bash
# closeReturn 수정 확인
curl -s "http://localhost:3000/api/screening/backtest?from=20260703&to=20260703" \
  | jq '.byDate[].items[] | {name, openReturn, closeReturn, trend}'
# 7종목 전부 closeReturn 실수값 확인 필요

# 저장 수정 확인 (당일 스크리닝 후)
curl -s "http://localhost:3000/api/screening/backtest?from=오늘&to=오늘" \
  | jq '.pending | length'
# 분석 종목 수와 일치하면 저장 정상
```

---

## 변경 파일

| 파일 | 내용 |
|------|------|
| `src/app/api/screening/overnight/route.ts` | ETF 필터 TIME/액티브 추가, 버킷 호이스팅, 외부 catch 저장 |
| `src/app/api/screening/backtest/route.ts` | closeReturn null 버그 수정 |
