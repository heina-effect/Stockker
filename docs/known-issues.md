# Known Issues — Stockker Beta RC

최종 업데이트: 2026-05-13 (Phase 32)

## 우선순위

- **P0**: 베타 배포 전 수정 필요
- **P1**: 베타 중 빠르게 수정
- **P2**: 베타 이후 개선
- **P3**: 장기 과제 또는 정책상 동결

## 현재 상태

### P0

현재 알려진 P0 이슈 없음.

### P1

현재 알려진 P1 이슈 없음.

### P2: 오래된 snapshot 본문 오염의 완전 자동 판별 한계

**현상**: 과거에 저장된 snapshot이 `basis_source_ids` 2건 이상을 갖고 있으나, 실제 source 본문 자체가 잘못 큐레이션된 경우 완전 자동 판별이 어렵다.  
**현재 방어**: entity guard, weak snapshot rejection, sector mismatch guard.  
**대응**: 의심 종목은 snapshot invalidation 후 재생성.

### P2: DART corp-master의 현재 상장 상태 한계

**현상**: DART corp-master에는 상장폐지 또는 Stockker 지원 범위 밖 시장 종목이 포함될 수 있다.  
**현재 방어**: `listing-status` guard, DB validation, unsupported symbol 비활성화.  
**향후 개선**: KRX 현재 상장 master 정기 동기화.

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
**재개 조건**: `docs/intraday-reopen-checklist.md` 충족 후 별도 Phase에서 검토.

## 최근 해결

- Phase 32: 일봉 오늘 캔들 중복 표시 방지
- Phase 32: 해운 섹터 LS ELECTRIC 오등록 제거
- Phase 32: 미지원 DART-only 종목 `지디(155960)`, `젬(248020)` 검색/상세 차단
- Phase 32: source card 초기 로드도 pagination endpoint 사용
- Phase 32: source card에서 `collectedAt` 사용자-facing 날짜 표시 제거
- Phase 33: 검색 결과 관심 종목 추가 및 `/workflows/watchlist` 런타임 연결
- Phase 33: 홈 stale-first 클라이언트 UX 적용
- Phase 33: 종목 상세 responsive layout 개선
- Phase 31: 종목 상세 entity guard 및 weak snapshot rejection 강화
