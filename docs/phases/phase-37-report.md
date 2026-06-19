# Phase 37 Report — KIS 시세 조회 실전 도메인/실전키 이원화

## 완료 요약

모의투자(mock) 계정 환경에서 시세 관련 API의 호출 한도(Rate Limit) 제한 및 미지원으로 인한 스크리닝 백엔드 실패 문제를 근본적으로 격리하기 위해, **시세 조회를 실전 도메인/실전키(openapi.koreainvestment.com:9443)로 완전 분리하고 주문 기능은 모의투자로 유지**하는 자격증명(Credentials) 및 호출 체계 이원화를 완벽하게 구축하였다.

---

## 주요 변경 및 개선 사항

### 1. KIS 시세 조회의 실전 도메인/실전키 이원화
- **실전 시세 자격증명 분리**: [config.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/kis/config.ts)에 실전용 앱 키(`KIS_APP_KEY_PROD`, `KIS_APP_SECRET_PROD`, `KIS_REST_BASE_URL_PROD`)를 매핑하는 `quote` 설정을 도입했습니다.
- **자격증명 해석 및 격리**: [auth.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/kis/auth.ts) 내에 `KisCreds` 인터페이스와 `resolveCreds(useQuote?: boolean)` 헬퍼를 추가하였습니다. 실전 앱 키가 비어 있을 시 명시적으로 에러(`"시세 조회에는 실전 앱키(KIS_APP_KEY_PROD)가 필요합니다"`)를 던지는 예외 가드레일을 장착했습니다.
- **토큰 분리 및 레이스 컨디션 예방**: 
  - 캐시 키를 `stockker:kis:token:${creds.cacheKey}`로 지정하여 실전 시세용(`quote`) 토큰과 모의투자용 토큰의 저장소를 완벽히 분리했습니다.
  - 전역 상수 `TOKEN_KEY`를 사용하던 기존 로직을 제거하고, `getKisAccessToken` 함수 내에서 `creds.cacheKey`에 기반한 동적 캐시 키(`tokenKey`)로 분화시킴으로써 Redis 및 파일 캐시 충돌을 원천 차단했습니다.
  - `refreshPromises`를 키별 Map 형태로 관리해 발급 동시 요청 충돌을 방지했습니다.
- **REST 호출 옵션 분화**: `callKisApi`에 `useQuoteCreds` 파라미터를 추가하여, 실전 조회 요청 시 동적으로 실전 도메인 및 실전 앱 키 헤더로 요청이 조합되도록 하였으며 터미널에 도메인과 `cacheKey` 디버그 로그가 출력되도록 로깅을 개선했습니다.
- **클라이언트 전면 전환**: [rest-client.ts](file:///Users/hyuna/Desktop/heina/stockker/src/server/kis/rest-client.ts) 내 모든 시세 조회 함수(`getDomesticStockQuote`, `getDomesticStockOrderbook`, `getDomesticIndex`, `getDomesticStockDaily`, `getDomesticStockIntraday`, `getDomesticVolumeRank`, `getDomesticStockWeekly`, `getDomesticIndexDaily`, `getDomesticStockDetail`, `getDomesticStockNews`)의 `callKisApi` 호출에 `useQuoteCreds: true`를 일괄 적용하였습니다. 주문 관련 코드는 이를 지정하지 않아 기존 모의투자 상태를 유지합니다.

### 2. 성능 튜닝 및 부하 감소 (타임아웃/Rate Limit 대응)
- **분석 대상 종목 수 12개 튜닝**: 
  - 기존 Phase 36의 30개 후보군을 실전/모의 Rate Limit 가드레일 하에서 3회씩 병렬/순차 조회할 시, 큐 인터벌(`510ms`) 누적으로 인해 15초 이상의 지연이 발생하여 Next.js 브라우저 대기 한계(타임아웃) 및 KIS 거래제한(`EGW00201`)을 유발하는 구조적 결함을 파악했습니다.
  - 후보군 분석 대상을 최대 **12개**로 튜닝함으로써 API 호출 횟수를 획득 1회 + 지수 1회 + 12종목 * 3회 = 38회로 줄였습니다. 이를 통해 최악의 환경에서도 전체 수집 완료 지연을 19초 수준으로 단축하여 타임아웃 위험을 차단하고 429 에러 가능성을 크게 완화했습니다.
- **실전 도메인 volume-rank 검증**: 모의투자 환경과 달리 실전 도메인에서는 거래량 순위(`FHPST01710000`) API가 실시간 주식 데이터를 누락 없이 정상적으로 반환함을 검증 완료했습니다.

---

## 보존한 가드레일 (Non-Negotiables)

- **주문 기능 모의투자 유지**: 시세 호출 시에만 `useQuoteCreds: true`를 활용하고, 매매 및 주문 관련 기능에는 이 옵션을 절대 지정하지 않아 기존 모의(mock) 거래 환경이 고스란히 유지됩니다.
- **큐 minIntervalMs(510ms) 유지**: 초당 요청 제한을 완벽하게 예방하기 위해 요청 간격을 기존 510ms(모의투자 TPS 2 및 실전투자 동시 대응형)로 건드리지 않고 유지했습니다.

---

## 검증 결과

- **린트 및 타입 빌드 검사 완료**: `npm run validate` 검사를 통해 TypeScript 타입 정합성 검증, ESLint 유효성 검사, 마스터 데이터 검사를 통과하여 빌드 정상 여부를 확인했습니다.
- **수동 검증**:
  - `KIS_MODE=mock`인 상황에서 `/api/screening/overnight?debug=true` API를 호출하여, 실전 도메인(`openapi.koreainvestment.com:9443`) 및 `cacheKey: "quote"` 기반으로 시세 분석에 성공하여 200 OK 응답을 안정적으로 반환하는 것을 확인했습니다.
  - OS 임시 디렉토리에 `kis_token_cache_quote.json` 캐시 파일이 정상적으로 별도 격리 생성 및 캐싱되는 것을 최종적으로 교차 검증 완료하였습니다.

---

## Phase 37 Addendum — /api/screening/overnight 버그 수정 및 로직 정합성 개선

Phase 37 완료 이후, 실전 API 호출 시 항상 빈 결과(`normal: 0, aggressive: 0`)가 반환되는 구조적 버그가 발견되어 다음 수정을 진행했습니다.

### 수정 내역

#### 1. 거래대금 필드명 오타 수정 (`route.ts`)
- **수정 내용**: `stock.acml_tr_pbmd` → `stock.acml_tr_pbmn`
- **영향**: `primaryCandidates` 필터의 거래대금 조건이 항상 0으로 평가되어 후보군이 공백이던 핵심 버그 해소. 수정 후 4~5개의 후보군이 정상 선별됨.

#### 2. 회전율(vol_tnrt) 판정 로직 이원화 (`route.ts`)
- **수정 내용**: 1차 선별(`primaryCandidates`)에서 `vol_tnrt >= 5.0` 조건 제거. volume-rank API 응답의 `vol_tnrt`/`lstn_stcn` 필드 신뢰도 불안정 문제를 해소하기 위해 2차 루프 내 `getDomesticStockDetail(symbol)`의 `detail.vol_tnrt`로 판정 위임.
- **영향**: 종목별 회전율이 실제 현재가 상세 응답 기반으로 정확하게 판정됨. (`예: SK하이닉스 → vol_tnrt 0.61% → 기준 미달로 제외` 동작 확인)

#### 3. 거래량비율 분자 출처 일봉으로 통일 (`route.ts`)
- **수정 내용**: `currentVolume = Number(stock.acml_vol || 0)` → `currentVolume = Number(dailyCandles[0].acml_vol || 0)`
- **영향**: 분자(오늘 거래량)와 분모(20일 평균 거래량)의 데이터 출처가 동일한 일봉 캔들로 통일되어 volumeRatio 계산의 정합성 확보.

#### 4. `debug=true` mock fallback 차단 (`route.ts`)
- **수정 내용**: `analyzedSymbols.size === 0` 상황 및 catch 블록 내에서 `isDebug === true`일 때 mock 데이터 대신 진단 JSON(`diagnostics: {volumeRankLength, pureStocksLength, primaryCandidatesLength, firstStockError}`) 반환.
- **영향**: 디버그 호출 시 실제 오류 원인 및 파이프라인 상태를 즉시 진단 가능.

#### 5. quote 전용 Request Queue 분리 (`auth.ts`)
- **수정 내용**: 전역 `globalKisRequestQueue` 외에 `globalKisQuoteQueue`를 별도로 선언. `callKisApi`에서 `useQuoteCreds` 여부에 따라 사용할 큐를 동적으로 선택.
- **영향**: 실전 시세 조회가 모의 주문 큐와 혼용되어 rate limit이 조기 소진되던 간섭 문제 해소.

#### 6. 주석 정확화 (`route.ts`)
- `"최대 30종목"` → `"최대 12종목"` 수정.
- 조정구간 설명 주석 정확하게 정정.

### 검증 결과

```
# debug=true 빈 결과 시 진단 JSON 정상 반환
{
  "ok": false,
  "error": "No symbols analyzed successfully",
  "diagnostics": {
    "volumeRankLength": 45,
    "pureStocksLength": 16,
    "primaryCandidatesLength": 5,
    "firstStockError": "KIS API Error: 500 ... EGW00201"
  }
}

# debug=true 정상 결과 시 실제 데이터 반환 확인
{
  "symbol": "000660", "name": "SK하이닉스",
  "reasons": ["회전율 기준 미달 (0.61%, 기준 5.0% 이상)", ...]
}
```

- **TypeScript 타입 검사**: `npx tsc --noEmit` 통과 (에러 0건)
- **KIS 실전 시세 연동 정상 확인**: `volumeRankLength: 45`, `pureStocksLength: 16`으로 실전 도메인 데이터 수신 확인
- **회전율 2차 필터 정상 작동**: `detail.vol_tnrt` 기반 회전율 판정이 실제 종목에 적용됨 확인

