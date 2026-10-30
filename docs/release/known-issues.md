# Known Issues — Stockker Beta RC

최종 업데이트: 2026-05-15 (Beta RC Gate)

## 우선순위

- **P0**: 베타 배포 전 수정 필요
- **P1**: 베타 중 빠르게 수정
- **P2**: 베타 이후 개선
- **P3**: 장기 과제 또는 정책상 동결

## 현재 상태

### P0

현재 알려진 P0 이슈 없음.

### P2: 가짜 데이터 생성 코드 잔존 — 재연결 금지, 삭제 검토 (2026-10-30)

**현상**: 다음 코드는 지금 화면에 노출되지 않지만, 다시 연결하면 가짜 숫자·근거 없는 AI 라벨이 실제처럼 보인다.
- `src/lib/mock/market.ts` + `src/components/dashboard/mock-live-provider.tsx` — 가짜 지수·관심종목 시세. 소비자(`WatchlistPanel`·`MarketOverviewCard`)는 렌더링되는 화면이 없다.
- `src/components/report/related-stocks-card.tsx` 의 `ai_inferred: "AI 추론"` 라벨 — 서버가 이 관계 유형을 만들지 않는다.

**대응**: 재연결하지 않는다. 정리 작업 때 삭제를 검토한다. 각 파일에 같은 TODO 주석을 달아 두었다.

### P2: day0 종가(진입가)가 확정 종가가 아닌 행 — 30건 교정, 3건 미해결 (2026-10-30)

**현상**: 10/6 이후 발견 건 day0 행 중 31건의 `close`가 KIS 확정 종가와 달랐다(day0 지표 백필 dry-run에서 발견). 이 값이 추적 수익률의 진입가다.
- 차이 크기 |DB−KIS|/KIS: 최소 0.10%, 중앙값 0.47%, 최대 2.87%.
- 저장 시각(`created_at`, KST): 31건 중 29건이 15:30 이전(10/6 15:21, 10/7 15:20, 10/8 10:23, 10/12 15:24, 10/13 15:22, 10/19 11:15, 10/20 14:31 실행분) — 종가 확정 전 값. 10/19 주성엔지니어링(16:19)은 일봉 캐시 키 수정(`ef26f6e`, 10/20 17:25) 전이라 장중 캐시 재사용으로 설명된다.
- 네이버 일별 시세(m.stock.naver.com)는 발견일뿐 아니라 모든 날짜에서 KIS와 조금씩 달라 판정 기준으로 쓰지 못했다. 대신 같은 거래일을 마감 후 저장한 다른 발견 그룹 행(DB 내부 대조)을 기준으로 삼았다.

**원인**: 스크리닝 `entryClose = 일봉[0].stck_clpr`를 장중 또는 확정 전에 읽어 day0에 저장. 캐시 키 수정(10/20)은 "마감 후 재실행이 장중 캐시를 재사용"하는 경로만 막았고, 스크리닝 자체를 장중에 돌린 경우는 막지 않는다.

**조치 (2026-10-30, `correct-day0-prices`)**: 30건의 day0 OHLCV를 KIS 확정값으로 교체하고 파생값을 다시 계산했다 — 같은 그룹 전 행의 `return_from_entry`, `overnight_screening_items`의 `entry_close`·`open_return`·`close_return`. 추적 화면의 3일차·10일차·MFE·MAE·승패는 day0 종가로 매번 계산된다. 9건은 마감 후 저장된 다른 그룹 행과 일치를 확인했고 21건은 대조 행이 없었다. 백업 `~/stockker-logs/backup-day0-prices-20261030T071053.json`. 스크리닝 판단 입력 기록(`tail_ratio`·`volume_ratio`·`classification`·`rsi14`·`quant_signal`)은 그날 스크리너가 본 값이라 바꾸지 않았다.

**미해결**:
- **10/28 SK스퀘어 — 마감 후 저장인데 불일치, 원인 미확인.** 16:18 저장(캐시 수정 이후)인데 922,000 vs 확정 921,000. 시간외 단일가 반영 가능성만 있고 검증 못 함. 다른 건과 같이 KIS 확정값으로 교정했다.
- **10/13 주성엔지니어링 — 교정 보류.** KIS는 262,000인데, 같은 거래일을 마감 후 저장한 다른 그룹 행 2개(9/10·9/16 발견)는 DB와 같은 263,000. 어느 쪽이 확정 종가인지 판정 못 해 가격·지표 모두 그대로 둠(day0 지표 비어 있음 → 추적 제외 상태 유지).
- **10/22 엘리스 — 범위 밖.** 신규상장(봉 부족) 건이라 31건 집계에 없었으나 같은 불일치(96,700 vs 93,600, −3.2%). 미교정.
- 스크리닝 실행 시각 가드(15:30 이전 실행 시 day0 저장 금지 등)는 없다. 재발 방지는 별도 결정.

### P3: day0 지표 복구 불가 — 신규상장 5건 (2026-10-30)

**현상**: 10/8 이후 재계산 덮어쓰기로 지워진 day0 지표를 KIS 일봉으로 백필(`backfill-day0-indicators`, 104건 복구)했으나, 발견일까지 상장 봉이 15개 미만인 5건은 RSI(14)를 정의할 수 없어 비어 있다 — 엠에스바이오 10/26·10/27, 엘리스 10/22·10/27, 멜콘 10/28. 추적 화면 퀀트 신호 판정에서 제외된다.
**참고**: 10/6 이전 day0 지표 결측 10건(7/7~9/21)은 원인이 달라 이번 범위 밖 — 별도 확인 필요.

### P3: 거래량비 두 기준 병존 — 같은 이벤트에 화면마다 다른 숫자 (2026-10-30)

**현상**: 스크리닝 `volumeRatio`는 당일 제외 20일 평균 대비, 추적 `vol_ratio_20`은 당일 포함 20일 평균 대비다. 예) 서산 10/29: 스크리닝 402%, 추적 339%. 변환식 `volRatio20 ≈ 20r/(r+19)` (r=4.02 → 349%).
**현재 방어**: 퀀트 신호 판정은 당일 포함 값(`vol_ratio_20`)으로 한다(10월 중순 통일). 추적 카드에는 `339% (당일 포함)`으로 기준을 표기한다.
**향후 개선**: 스크리닝 화면에도 기준을 표기하거나 한쪽으로 통일.

### P1

### P1: 완전 첫 방문의 현재가 지연 가능성

**현상**: 해당 종목의 live quote cache가 전혀 없는 첫 방문에서는 KIS quote 응답 시간 동안 현재가 skeleton 또는 `가격 지연됨` 상태가 보일 수 있다.  
**현재 방어**: KIS bootstrap은 quote-first로 동작하고 orderbook 기본 조회를 제거했다. 성공 quote는 10분 local cache로 저장되어 재진입 시 즉시 stale 가격을 표시한다.  
**대응**: 베타 중 실제 KIS 응답 시간을 관찰하고 필요 시 quote timeout/재시도 정책을 조정한다.

### P1: 브라우저 콘솔/모바일 최종 확인은 수동 필요

**현상**: Recharts width/height 경고와 ChartScale 반복 경고 원인은 수정했지만, 실제 브라우저 조합별 console warning과 모바일 레이아웃은 자동 테스트만으로 완전 보장하기 어렵다.  
**현재 방어**: chart container 높이 고정, 정상 live price skip warning 제거, SSE error console noise 완화.  
**대응**: Beta 공개 직전 홈/상세/섹터/workflow를 desktop/mobile viewport에서 수동 확인.

### P2: 오래된 snapshot 본문 오염의 완전 자동 판별 한계

**현상**: 과거에 저장된 snapshot이 `basis_source_ids` 2건 이상을 갖고 있으나, 실제 source 본문 자체가 잘못 큐레이션된 경우 완전 자동 판별이 어렵다.  
**현재 방어**: entity guard, weak snapshot rejection, sector mismatch guard.  
**대응**: 의심 종목은 snapshot invalidation 후 재생성.

### P2: DART corp-master의 현재 상장 상태 한계

**현상**: DART corp-master에는 상장폐지 또는 Stockker 지원 범위 밖 시장 종목이 포함될 수 있다.  
**현재 방어**: `listing-status` guard, DB validation, unsupported symbol 비활성화.  
**향후 개선**: KRX 현재 상장 master 정기 동기화.

### P2: KIS 순위성 API 래퍼 미구현

**현상**: 거래량순위, 체결강도 상위, 관심종목등록 상위 API는 공식 문서상 존재하지만 현재 코드에는 안정 래퍼가 없다.  
**현재 방어**: 홈/섹터 주목 기준은 source count, issue density, 대표 종목 quote, KIS 업종 흐름으로 설명한다.  
**향후 개선**: 새 provider가 아니라 기존 KIS 정보성 API 모듈 안에서 검증된 TR-ID와 응답 schema를 확보한 뒤 추가한다.

### P2: workflow 항목 개별 삭제 기능 없음

**현상**: 최근 본 종목/북마크/관심 종목 목록에서 개별 삭제 UX가 제한적이다.  
**대응**: Beta 이후 워크플로우 관리 UI에서 처리.

### P2: 관심 종목은 브라우저 local-first

**현상**: 관심 종목은 현재 브라우저 localStorage에만 저장되어 다른 기기/브라우저와 동기화되지 않는다.  
**현재 방어**: source of truth를 local-first로 문서화하고, 검색/홈/workflow 모두 같은 adapter를 사용한다.  
**향후 개선**: 인증/사용자 DB 도입 시 adapter 교체 방식으로 sync 추가.

### P3: intraday 차트 정책 동결

**현상**: 당일 분봉 차트는 기본적으로 표시하지 않는다.  
**이유**: 장중 변동성으로 AI 리서치 판단이 오염되는 것을 방지하기 위한 정책.  
**재개 조건**: `docs/release/intraday-reopen-checklist.md` 충족 후 별도 Phase에서 검토.

## 최근 해결

- Beta RC Gate: 검색 결과 없음 submit fallback 제거
- Beta RC Gate: DB-first 검색 timeout 및 local master alias 병합
- Beta RC Gate: 대한광통신/우리로/인벤티지랩/에스피시스템스 metadata 및 canonical sector coverage 보강
- Beta RC Gate: source card 초기 로드를 pagination endpoint로 복구
- Phase 32: 일봉 오늘 캔들 중복 표시 방지
- Phase 32: 해운 섹터 LS ELECTRIC 오등록 제거
- Phase 32: 미지원 DART-only 종목 `지디(155960)`, `젬(248020)` 검색/상세 차단
- Phase 32: source card 초기 로드도 pagination endpoint 사용
- Phase 32: source card에서 `collectedAt` 사용자-facing 날짜 표시 제거
- Phase 33: 검색 결과 관심 종목 추가 및 `/workflows/watchlist` 런타임 연결
- Phase 33: 홈 stale-first 클라이언트 UX 적용
- Phase 33: 종목 상세 responsive layout 개선
- Phase 31: 종목 상세 entity guard 및 weak snapshot rejection 강화
- Phase 37(보안): `/api/kis/health`의 `getKisConfig()` 자격증명 평문 노출 차단(실전키·tokenEncryptionKey·cronSecret·upstashToken) — 화이트리스트 마스킹 + cronSecret 인증 게이트, 토큰 암호화 키 sha256 KDF, 토큰 캐시 파일 0600
