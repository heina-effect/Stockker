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
