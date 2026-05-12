# Known Issues — Stockker Beta

최종 업데이트: 2026-05-11 (Phase 25)

---

## 우선순위 분류

- **P0**: 베타 배포 전 반드시 수정 필요
- **P1**: 베타 중 수정 필요 (사용자 경험 저해)
- **P2**: 베타 이후 수정 (기능적 한계, 용인 가능)
- **P3**: 장기 개선 과제 (현재 정책상 동결)

---

## 현재 알려진 이슈

### [FIXED — Phase 25] ~~P0: RecentResearchBoard 스테일 클로저 버그~~
~~`/workflows/recent`에서 sentiment API 호출이 빈 배열로 수행되어 감성 데이터가 표시되지 않음.~~  
**Phase 25에서 수정됨**: `fetchAll`이 state 대신 `list` 상수를 참조하도록 수정.

### [FIXED — Phase 25] ~~P0: BookmarksResearchBoard 동일한 버그~~
**Phase 25에서 수정됨**.

### [FIXED — Phase 25] ~~P0: 홈 footer 면책 문구 오류~~
~~"AI 모킹 스텁 데이터" 문구가 베타 사용자에게 노출됨.~~  
**Phase 25에서 수정됨**.

---

### P1: 섹터 최초 진입 시 긴 로딩 (blocking SSR)

**현상**: 섹터 스냅샷이 DB에 없는 경우, `/sectors/[sectorId]` 페이지가 모든 대표 종목의 이슈를 순차 수집 후 AI 요약까지 완료되어야 응답함. 수 십 초 소요 가능.  
**원인**: `generateSectorSnapshot`이 SSR blocking 방식으로 호출됨.  
**임시 완화**: 스냅샷 TTL(1시간) 내에는 stale 데이터를 즉시 반환하므로, 최초 1회 이후부터는 빠름.  
**해결 방향**: Suspense + fallback UI 또는 ISR(Incremental Static Regeneration) 도입 — 현재 동결.

---

### P1: sentimentCooldown이 서버 재시작 시 초기화됨

**현상**: `orchestrator.ts`의 `sentimentCooldown` Map은 메모리-only. 서버 재시작 또는 서버리스 cold-start 시 쿨다운이 초기화되어 동일 종목에 대해 AI 호출이 연속 발생할 수 있음.  
**영향**: API 쿼터 소모 증가.  
**임시 완화**: DB 스냅샷 TTL(1시간)이 1차 방어선 역할.  
**해결 방향**: Upstash Redis에 cooldown 상태 저장 — Phase 26 이후.

---

### P2: 워크플로우 항목 삭제 기능 없음

**현상**: `/workflows/recent`, `/workflows/bookmarks`에서 개별 항목을 제거할 수 없음. 전체 초기화도 없음.  
**해결 방향**: 카드 우측 상단에 제거 버튼 추가 — Phase 26 이후.

---

### P2: 홈 인텔리전스 fallback 시 빈 카드 노출

**현상**: Gemini API 쿼터 초과 또는 네트워크 오류 시, `/api/home/intelligence`가 `{}` (빈 객체)를 반환하고 홈 카드들이 에러 메시지를 표시함.  
**영향**: 사용자 경험 저해 (에러 메시지가 다소 무뚝뚝함).  
**임시 완화**: Phase 25에서 각 카드의 에러 상태에 안내 문구 추가.  
**해결 방향**: 마지막 성공한 응답을 로컬 캐시에 보관하여 fallback으로 사용 — Phase 26 이후.

---

### P2: 섹터 상세 페이지에 breadcrumb/뒤로가기 없음

**현상**: `/sectors/[sectorId]` 진입 후 홈으로 돌아가려면 브라우저 백 버튼 사용 또는 헤더 로고 클릭 필요.  
**해결 방향**: `DashboardHeader`에 breadcrumb 추가 또는 섹터 페이지에 "← 홈으로" 링크 추가.

---

### P3: 인트라데이 차트 (의도적 동결)

**현상**: 당일 분봉 차트가 표시되지 않음.  
**이유**: 장중 변동성이 AI 판단을 오염시키는 것을 방지하기 위한 정책적 결정.  
**상태**: `docs/intraday-reopen-checklist.md` 조건 충족 시 재도입 검토. 현재 동결.

---

### P3: buyPrices 워크플로우 미구현

**현상**: 저장된 매수 평단가(`buyPrices`)가 워크플로우 대시보드에 통합되지 않음.  
**현재**: `BuyPricePlanCard`에서만 개별적으로 표시됨.  
**해결 방향**: `/workflows/portfolio` 페이지 또는 watchlist에 통합 — Phase 26 이후.

---

## 이슈 추가 방법

새로운 이슈 발견 시 이 파일에 추가하세요:

```markdown
### [P0/P1/P2/P3]: 이슈 제목

**현상**: 어떤 증상이 나타나는가
**원인**: 왜 발생하는가 (알고 있다면)
**임시 완화**: 당장 피할 수 있는 방법
**해결 방향**: 장기 해결 방안
```
