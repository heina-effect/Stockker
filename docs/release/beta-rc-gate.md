# Beta RC Gate — 2026-05-15

## 판정 요약

**현재 판정: Beta 출시 가능(조건부)**

자동 검증 기준 P0는 남아 있지 않다. 다만 실제 브라우저 콘솔/모바일 화면 확인과 원격 DB master 검증은 로컬 자동 검증만으로 완전히 대체할 수 없으므로, 베타 공개 직전 수동 체크로 한 번 더 확인해야 한다.

## P0 / P1 현황

### P0

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 검색 정확도 | Pass | RC 검색 fixture 테스트 추가. 없는 결과 submit fallback 제거. DB-first 검색 timeout 후 local master fallback. |
| 상세 리포트 오염 | Pass | entity guard/detail-entry guard 테스트 통과. AI 요약과 source card 분리 유지. |
| 섹터 404 / 잘못된 주요 종목 | Pass | canonical sector helper 테스트 통과. LS ELECTRIC 해운 제외 유지. 광통신/통신장비, 로봇, 바이오 fixture 보강. |
| 관심 종목 추가/유지/workflow | Pass | local-first watchlist 구조 유지. `/api/watchlist/summary` 기반 카드/workflow 연결 유지. |
| 카드 제목/상태 누락 | Pass | 이슈/소스/투자의견/연관 종목 카드가 제목과 상태를 유지하는 구조 확인. |
| 콘솔 빨간 에러 | Partial | Recharts width/height 및 ChartScale 반복 경고 원인은 수정됨. 실제 브라우저 콘솔 최종 확인 필요. |

### P1

| 항목 | 상태 | 근거 |
| --- | --- | --- |
| 홈 skeleton 체감 | Partial | client stale-first cache 적용. 완전 첫 방문은 `/api/home/intelligence` cold latency 영향 가능. |
| 상세 현재가 체감 | Partial | bootstrap quote-first + live quote cache 적용. 완전 첫 방문/캐시 없음 상태는 KIS 응답 지연 가능. |
| 모바일 배치 | Partial | 반응형 grid 유지. 실제 기기/viewport 최종 육안 확인 필요. |
| 섹터 설명력 | Pass | 소형/테마 fixture 섹터 taxonomy 보강. |

## RC Gate 항목별 결과

### 1. 첫 진입 성능

- **홈 첫 진입**: Partial  
  `HomeIntelligenceProvider`가 localStorage stale cache를 먼저 렌더하고 백그라운드에서 단일 fetch를 실행한다. 최초 방문은 캐시가 없으므로 skeleton이 보일 수 있다.
- **상세 종목명/티커 즉시 표시**: Pass  
  서버 페이지에서 `getServerStockName(symbol)`을 계산해 `StockReportHeader`에 `initialName`으로 전달한다.
- **상세 가격 로딩**: Partial  
  `/api/kis/bootstrap`은 quote를 우선 반환하고 orderbook을 기본 조회하지 않는다. 성공 quote는 10분 local cache로 재진입 시 즉시 stale 표시된다.

### 2. 검색 정확도

- **Pass**
- 확인 fixture:
  - 한화 → `000880`
  - LS ELECTRIC → `010120`
  - LIG넥스원 → `079550`
  - 에이프릴바이오 → `397030`
  - 펩트론 → `087010`
  - 삼성전자 → `005930`
  - 대한광통신 → `010170`
  - 인벤티지랩 → `389470`
  - 우리로 → `046970`
  - 에스피시스템스 → `317830`
- 수정:
  - DB-first 검색에 local master alias/name을 병합.
  - DB 검색이 900ms를 넘으면 local master fallback.
  - 검색 결과가 없을 때 임의 문자열을 `/stocks/<query>`로 보내던 fallback 제거.

### 3. 상세 리포트 신뢰도

- **Pass**
- 확인:
  - entity guard 테스트 통과.
  - detail-entry guard 테스트 통과.
  - 투자의견 “현재가 대비”는 상세 live quote가 있을 때만 계산한다.
  - source card 문구에서 내부 용어인 `환각(Hallucination)` 노출 제거.

### 4. 카드 상태 일관성

- **Pass**
- 확인 카드:
  - 최근 핵심 이슈
  - AI 분석 근거 소스
  - 국내 증권사 투자의견
  - 연관 종목
  - 관심 종목
- 수정:
  - `SourceListCard` 초기 로드를 `/api/stocks/[symbol]/sources?page=1&limit=5`로 복구해 source pagination freeze rule과 일치시킴.

### 5. 섹터

- **Pass**
- 수정:
  - `sec-optical-equipment` 추가: 대한광통신/우리로.
  - `sec-robotics`에 에스피시스템스 추가.
  - `sec-biotech`/`sec-obesity-bio`에 펩트론/인벤티지랩 보강.
  - LS ELECTRIC은 해운 섹터에 포함되지 않음을 테스트로 유지.

### 6. 관심 종목

- **Pass**
- 확인:
  - `SearchHeroCard` 관심 종목 추가 버튼 유지.
  - 중복 추가는 local adapter와 UI checked state로 방지.
  - `/workflows/watchlist`는 `/api/watchlist/summary`를 사용해 최소 상태를 표시한다.
  - 저장은 사용자 클릭 기반으로 유지한다.

### 7. 브라우저 콘솔

- **Partial**
- 수정 완료:
  - Recharts width/height 경고 원인인 불안정 chart container 높이 수정.
  - 정상적인 오늘 봉 미추가 상황에서 `Implausible live price` 경고를 찍던 조건 제거.
  - SSE error event 반복 console noise 완화.
- 남은 확인:
  - 실제 브라우저 devtools에서 홈/상세/섹터/workflow 순회 확인 필요.

### 8. 모바일/작은 화면

- **Partial**
- 코드 기준 반응형 grid는 유지되고 검색 dropdown은 relative form 아래 absolute로 제한된다.
- 실제 390px/768px/desktop viewport 육안 확인은 배포 전 수동 체크로 남긴다.

## 재현 및 검증 명령

```bash
npm run lint
npm run typecheck
npm run validate
npm run test:contracts
npm run test:workflows
npx vitest run \
  src/lib/stocks/search-master.test.ts \
  src/data/sectors/taxonomy.test.ts \
  src/components/home/search-hero-card.test.tsx \
  src/components/report/source-list-card.test.tsx \
  src/server/research/entity-guard.test.ts \
  src/server/research/detail-entry-guard.test.ts
npm run build
```

## 이번 실행 결과

| 명령 | 결과 | 비고 |
| --- | --- | --- |
| `npm run lint` | Pass | error 0 |
| `npm run typecheck` | Pass | TypeScript error 0 |
| `npm run validate` | Pass | `validate:master` 0 errors / 0 warnings |
| `npm run validate:db-master` | Pass | 네트워크 허용 후 3922 active stocks, 29 active sectors, error 0 |
| `npm run test:unit` | Pass | 27 files / 67 tests |
| `npm run test:contracts` | Pass | 현재 매칭 파일 없음, `--passWithNoTests` |
| `npm run test:workflows` | Pass | watchlist workflow test 통과 |
| `npm run test:charts` | Pass | chart-utils test 통과 |
| `npm run test:persistence` | Pass | buy price/user storage 통과 |
| `npm run test:vectors` | Pass | home intelligence normalizer 통과 |
| `npm run test:report` | Pass | report/entity/detail guard 통과 |
| `npm run test:search` | Pass | search master/search UI 통과 |
| `npm run build` | Pass | Turbopack worker 권한 때문에 sandbox 외부 실행 |
| `npm run validate:full` | Not run | 로컬에 없는 `npx tsx`를 외부 npm에서 가져와 실행할 수 있어 승인 단계에서 차단됨 |

## 수정 파일

- `src/server/research/model-router.ts`
- `src/components/home/search-hero-card.tsx`
- `src/components/report/source-list-card.tsx`
- `src/data/sectors/taxonomy.ts`
- `src/lib/stocks/metadata.ts`
- `src/lib/stocks/search-master.test.ts`
- `src/data/sectors/taxonomy.test.ts`
- `src/components/home/search-hero-card.test.tsx`
- `src/components/report/source-list-card.test.tsx`

## 남은 Known Issues

- 첫 방문/캐시 없는 종목의 현재가는 KIS quote 응답 시간에 영향을 받는다.
- 브라우저 콘솔과 모바일 layout은 실제 브라우저에서 최종 확인해야 한다.
- 거래량순위/체결강도/관심종목등록 상위 KIS API는 안정 래퍼가 아직 없다.
