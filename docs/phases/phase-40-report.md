# Phase 40 Report — 윗꼬리(tailRatio) 계산 버그 수정 + 스크리닝 분석 지표 컬럼 도입

## 완료 요약

Phase 38–39에서 구축한 백테스트 인프라와 Supabase 영속 저장 위에, 스크리닝 품질과 분석 역량을 보강했다. 핵심은 세 가지다. (1) 모든 종목의 윗꼬리 비율(`tailRatio`)이 항상 0으로 계산되던 버그를 바로잡고 공격형 버킷에도 윗꼬리 게이트를 적용했다. (2) 조건별 통계 쿼리를 위해 `overnight_screening_items`에 숫자 지표 컬럼 9종을 추가하고(009 마이그레이션), 스크리닝/백테스트 저장 경로가 이를 채우도록 확장했다. (3) 마이그레이션 이전 과거 데이터를 소급 백필했다.

---

## 버그 1 — tailRatio 항상 0 (`overnight/route.ts`)

### 문제 (확인)
스크리닝 응답의 윗꼬리 비율(`metrics.tailRatio`)이 전 종목 0으로 고정돼 있었다. 실측 윗꼬리가 명백히 존재하는 종목도 0으로 표기됐다.

### 원인
윗꼬리 계산이 거래량 순위 API(`volume-rank`, `FHPST01710000`)의 응답 객체를 참조했는데, 이 API는 **당일 고가 필드를 반환하지 않는다.** 그 결과 고가가 항상 결측 처리되어 현재가로 대체되었고, 윗꼬리는 언제나 0이 되었다. 결과적으로 윗꼬리 제한(≤3.5%) 필터가 사실상 무력화돼 있었다.

### 수정
같은 루프에서 이미 조회하는 **당일 확정 일봉의 고가·종가**를 기준으로 계산하도록 소스를 통일했다. 실시간 현재가는 계산에서 배제했다. 일봉 고가가 결측인 경우는 `tailRatio=0` fallback 대신 별도 플래그(`tailDataMissing`)로 처리해 "계산 불가"를 "진짜 윗꼬리 0%"와 구분했으며, 이 경우 안전 통과(`isTailSafe`)로 취급하지 않는다.

### 검증
실측 대표 종목 몇 건을 KIS 원주가로 재계산해 사전 산출한 기대치와 오차 없이 일치함을 확인했다.

---

## 버그 2 — 공격형(aggressive) 버킷에 윗꼬리 게이트 부재 (`overnight/route.ts`)

### 문제 (확인)
정석(normal) 버킷은 윗꼬리 안전 여부(`isTailSafe`)를 이미 검사했으나, 공격형 판정 조건은 윗꼬리를 전혀 검사하지 않았다. 과거 공격형 진입 사례가 실제로는 윗꼬리 제한을 초과했음에도 공격형으로 편입됐고, 그중 일부는 백테스트에서 손실이 확인됐다.

### 수정
공격형 판정 조건에도 `isTailSafe`를 포함시켰다. 이제 정석·공격형 두 게이트 모두 윗꼬리 안전 여부를 요구하며, 윗꼬리 제한을 초과한 종목은 두 버킷에서 모두 탈락해 `exclude`로 분류된다(사유: "윗꼬리 비율 초과"). 수정 범위는 tailRatio 계산부와 공격형 게이트 두 곳으로 한정했고, 순위 조회용 필드 사용 로직은 건드리지 않았다.

---

## 기능 1 — 분석 지표 컬럼 도입 (009 마이그레이션)

### 배경
윗꼬리·수익률 등 지표가 텍스트(`reasons`)에만 존재해 "특정 윗꼬리 구간의 평균 다음날 수익률" 같은 조건별 통계 쿼리가 불가능했다.

### 마이그레이션 (`009_screening_item_analytics.sql`)
`overnight_screening_items`에 숫자 컬럼 9종 + 인덱스 2종 추가.

| 컬럼 | 채우는 주체 | 성격 |
|------|------|------|
| `tail_ratio` / `volume_ratio` / `turnover_rate` / `freshness_count` | 스크리닝 시점 | 윗꼬리·거래량비·회전율·신선도 지표 |
| `next_open` / `next_close` / `open_return` / `close_return` / `trend` | 백테스트 조회 시점 | 다음 거래일 확정값 (한 번 채우면 불변) |

> Supabase는 마이그레이션을 대시보드 SQL 에디터에서 **수동 적용**한다(`migrate-supabase.mjs`는 테이블 존재 여부만 점검). 배포 전 009 SQL 선적용 필요.

### 저장 로직 (`storage.ts`, `overnight/route.ts`)
- `ScreeningResultItem`에 지표 필드(옵셔널) 확장. `saveScreeningResult` INSERT / `getScreeningResult` SELECT·매핑에 9컬럼 반영 → upsert 병합 시 기존값 보존.
- 3개 버킷 `metrics`에 회전율(`turnoverRate`) 추가. 영속 저장 시 지표를 함께 기록(구조적 분석 불가·조회 실패 항목은 null).

### 백테스트 write-back·재사용 (`backtest/route.ts`, `storage.ts`)
- **write-back**: 다음 거래일 종가 확정 시 `updateScreeningItemBacktest()`로 확정값 저장. `next_close`가 비어있는 행만 갱신하는 가드로 **이미 채워진 확정값은 절대 덮어쓰지 않음**.
- **재사용**: DB에 확정값이 있으면 KIS 재조회 없이 그대로 사용.
- 부수: 존재하지 않는 타입을 storage에서 import하던 기존 오류(TS2305 2건) 정리.

---

## 데이터 — 과거 지표 소급 백필

배포된 저장 코드는 지표 컬럼을 채우지 않으므로, 마이그레이션 이전 데이터는 원본 지표가 없다. 서비스 롤 키 + JS 클라이언트로 과거 지표를 소급 UPDATE 백필했다.

- **사전검증**: 대상 (date, name) 쌍을 전수 조회해 존재·유니크(중복 없음)를 확인한 뒤 진행. 미존재 항목은 반영하지 않고 별도 보고.
- **날짜 라벨링 주의점**: 연휴(광복절·대체공휴일) 뒤 실행분은 스크리닝 저장 키가 실행 당일 날짜이므로, 진입일로 예상한 날짜가 아니라 실제 실행일 날짜로 저장돼 있었다. 백필 시 실제 저장 날짜 기준으로 매칭.
- 영속 저장 개시 이전 날짜는 DB에 없어 백필 불가.

> 운영 메모: "저장이 멈췄다/데이터가 없다"는 판단은 실제 테이블을 서비스 롤로 직접 조회해 확인할 것. 부분 스크린샷·조회 시점 문제로 오판한 사례가 있었다.

---

## 변경 파일

| 파일 | 내용 |
|------|------|
| `supabase/migrations/009_screening_item_analytics.sql` | 분석 지표 컬럼 9종 + 인덱스 2종 (신규) |
| `src/app/api/screening/overnight/route.ts` | tailRatio 일봉 기준 재계산, 공격형 isTailSafe 게이트, metrics·저장에 지표 반영 |
| `src/app/api/screening/backtest/route.ts` | 확정값 write-back·재사용, 잘못된 타입 import 정리 |
| `src/server/screening/storage.ts` | 지표 필드 확장, INSERT/SELECT 반영, `updateScreeningItemBacktest` 추가 |
