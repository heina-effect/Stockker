# Beta Release Checklist — Stockker Phase 25

## 사용 방법
배포 전 이 체크리스트를 순서대로 확인하세요. 모든 항목이 통과해야 베타 배포를 진행할 수 있습니다.

---

## 1. 코드 품질 (자동)

- [ ] `npm run lint` 통과 (0 오류)
- [ ] `npm run typecheck` 통과 (0 오류)
- [ ] `npm run build` 성공 (빌드 실패 없음)
- [ ] `npm run test:contracts` 통과
- [ ] `npm run test:persistence` 통과
- [ ] `npm run test:workflows` 통과
- [ ] `npm run test:evals` 통과 (AI 출력물 평가 통과)
- [ ] `npm run validate:full` 전체 통과

---

## 2. 홈 화면 수동 검증

- [ ] 홈 로딩 시 4개 카드가 스켈레톤 상태를 보여줌 (빈 "불러오는 중..." 아님)
- [ ] 홈 로딩 완료 후 "실시간 핵심 이슈" 카드에 이슈 목록이 노출됨
- [ ] "지금 주목받는 종목" 카드에 종목명, 이유, 출처 수가 표시됨
- [ ] "지금 주목받는 섹터" 카드에 아이콘, 섹터명, 주도주 배지가 표시됨
- [ ] "AI 포착 후보" 카드에 관찰 후보 배지, candidateCategory 배지, riskSummary, disclaimer가 표시됨
- [ ] 홈 footer에 "AI 모킹 스텁" 문구가 없음
- [ ] 홈 footer에 올바른 면책 조항이 표시됨

---

## 3. 종목 상세 페이지 수동 검증

- [ ] 종목 URL 직접 접속 시 종목명/티커가 AI 로딩 전에 즉시 표시됨
- [ ] AI Summary 섹션이 로딩 중일 때 스켈레톤으로 표시됨 (빈 상태 아님)
- [ ] 북마크 버튼이 상태를 toggle하고 localStorage에 저장됨
- [ ] 종목 조회 시 `/workflows/recent`에 해당 종목이 추가됨
- [ ] 소스 목록이 페이지네이션으로 로드됨

---

## 4. 섹터 상세 페이지 수동 검증

- [ ] 섹터 페이지 접속 시 AI 요약, 주도주, 소외주, 관찰 후보가 표시됨 (스냅샷 있을 때)
- [ ] 스냅샷 없을 때 생성이 완료된 후 표시됨
- [ ] 섹터별 disclaimer 카드가 우측 사이드에 표시됨

---

## 5. 워크플로우 페이지 수동 검증

- [ ] `/workflows/watchlist`: 관심 종목 목록이 표시됨 (기본 종목 포함)
- [ ] `/workflows/recent`: 최근 본 종목이 없을 때 "어떻게 추가하나요" 안내가 표시됨
- [ ] `/workflows/recent`: 종목 조회 후 해당 종목의 감성 데이터가 카드에 표시됨 (버그 수정 확인)
- [ ] `/workflows/bookmarks`: 북마크 없을 때 "어떻게 추가하나요" 안내가 표시됨
- [ ] `/workflows/bookmarks`: 북마크한 종목의 감성 데이터가 카드에 표시됨 (버그 수정 확인)

---

## 6. 가드레일 회귀 확인

- [ ] 홈 화면에서 개발자 도구 네트워크 탭 확인: `/api/home/intelligence` 요청이 1회만 발생함 (카드별 중복 fetch 없음)
- [ ] 종목 상세 접속 시 KIS/DART 직접 API 호출이 즉시 발생하지 않음
- [ ] 인트라데이 차트가 표시되지 않음
- [ ] AI 추천 카드에 "매수 추천", "강력 매수" 등의 지시적 표현이 없음
- [ ] 모든 추천 카드(TrendStocks, TrendSectors, AIPicksCard)에 면책 조항이 표시됨

---

## 7. 문서 확인

- [ ] `docs/setup.md` — 최신 환경 변수 목록 포함 (Gemini, GNews, NewsAPI, Supabase)
- [ ] `docs/architecture.md` — Phase 25 기준으로 업데이트됨
- [ ] `docs/known-issues.md` — 최신 알려진 이슈 반영
- [ ] `docs/release-freeze-rules.md` — 동결 항목 명시됨
- [ ] `README.md` — 버전/모델 정보가 정확함

---

## 8. Ops 확인

- [ ] `/api/health` 응답: `{ ok: true }` 또는 동등한 상태
- [ ] `/api/ops/metrics` 응답: 정상 메트릭 반환 (DB 연결 필요)
- [ ] 환경 변수 중 필수 항목(GEMINI_API_KEY, Supabase)이 배포 환경에 설정됨

---

## 릴리즈 승인 기준

위 체크리스트의 모든 항목이 통과되었을 때만 베타 배포를 진행합니다.

미통과 항목이 있을 경우: `docs/known-issues.md`에 기록 후 P0 여부를 판단하세요.
