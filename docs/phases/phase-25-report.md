# Phase 25 Report — Beta Hardening & Release Freeze

## 1. 개요

Phase 25는 기능 확장이 아닌 **베타 품질 경화(Hardening)**에 집중했습니다. Phase 24까지 구축된 모든 기능이 일관되고, 신뢰할 수 있으며, 예측 가능하게 동작하도록 안정화하는 것이 목표였습니다.

---

## 2. 주요 수정 사항

### A. 워크플로우 버그 수정 (P0)

**문제**: `RecentResearchBoard`와 `BookmarksResearchBoard` 컴포넌트에 스테일 클로저(Stale Closure) 버그가 존재했습니다.

- `useEffect` 내에서 `const list = ...` 로 값을 읽은 뒤 `setSymbols(list)`로 상태를 업데이트했지만,
  내부의 `fetchAll` 함수가 상태값(`recentSymbols`, `bookmarks`)을 참조하고 있었습니다.
- React의 상태 업데이트는 비동기이므로, `fetchAll` 실행 시점에 상태는 여전히 빈 배열(`[]`)이었습니다.
- 결과: 감성 API 호출이 한 건도 발생하지 않아 두 워크플로우 페이지가 항상 "데이터 없음" 또는 로딩 상태로 멈춰 있었습니다.

**수정**: `fetchAll` 내부에서 상태 변수 대신 `list` 상수를 직접 참조하도록 변경. `useEffect` 의존성 배열도 `[]`로 정정.

---

### B. 홈 카드 로딩/빈/에러 상태 구분 (P1)

**문제**: 4개의 홈 카드(`TrendIssuesCard`, `TrendStocksCard`, `TrendSectorsCard`, `AIPicksCard`)가 `isLoading=true`인 로딩 중 상태와 `data=[]`인 빈 상태를 모두 "불러오는 중..."으로 동일하게 표시했습니다. 에러 상태도 처리되지 않았습니다.

**수정**:
- 각 카드에 **스켈레톤 로딩 UI** 추가 (animate-pulse 애니메이션)
- `isLoading=true` → 스켈레톤
- `error !== null` → "데이터를 불러오지 못했습니다." (명확한 실패 안내)
- `data=[]` → "현재 {항목}이 없습니다." (정상적인 빈 상태)

---

### C. AIPicksCard candidateCategory 배지 추가 (P1)

**문제**: AI 프롬프트에서 각 포착 후보를 `event_driven`, `momentum`, `undervalued` 중 하나로 분류하도록 설계되어 있었으나, UI에 표시되지 않았습니다. 사용자가 "왜 이 종목이 포착되었는가"를 이해하는 핵심 분류 정보가 숨겨져 있었습니다.

**수정**: 각 pick 카드에 candidateCategory 배지 추가. 한국어로 번역하여 표시:
- `event_driven` → "이벤트 주도"
- `momentum` → "모멘텀"
- `undervalued` → "저평가 주목"

---

### D. 홈 Footer 면책 문구 수정 (P0)

**문제**: `src/app/page.tsx` footer에 "본 서비스의 정보는 **AI 모킹 스텁 데이터**이며 투자 권유를 구하지 않습니다."라는 문구가 있었습니다. 베타 사용자에게 서비스가 mock/fake 데이터를 사용한다고 오해를 줄 수 있는 치명적인 copy 오류.

**수정**: "본 서비스는 투자 참고용 AI 리서치 정보를 제공하며, 투자 판단 및 책임은 전적으로 이용자 본인에게 있습니다."로 교체.

---

### E. 워크플로우 빈 상태 안내 개선 (P1)

**문제**: `/workflows/recent`와 `/workflows/bookmarks`에서 목록이 비어 있을 때 "최근 본 종목이 없습니다." 한 줄만 표시되어, 사용자가 어떻게 목록을 채울 수 있는지 알 수 없었습니다.

**수정**: 빈 상태에 추가 안내 문구 추가:
- Recent: "홈 화면 검색창에서 종목을 검색하고 상세 페이지를 방문하면 자동으로 이 목록에 추가됩니다."
- Bookmarks: "종목 상세 페이지 우측 상단의 북마크 아이콘을 눌러 나중에 다시 확인하고 싶은 리서치를 저장하세요."

---

### F. 문서 전면 업데이트

| 문서 | 변경 내용 |
|---|---|
| `README.md` | Next.js 16.1.6, Gemini 2.5 Flash로 정정. 명확한 빠른 시작 가이드. |
| `docs/core/setup.md` | "Phase 12" → "Phase 25 Beta". 전체 환경 변수 목록 (Gemini, GNews, NewsAPI, Supabase) 추가. VS Code 권장 설정 추가. |
| `docs/core/architecture.md` | Phase 25 기준으로 전면 재작성. 정확한 모델명, 파이프라인 다이어그램, 가드레일 테이블 포함. |
| `docs/phases/phase-25-audit.md` | 신규 생성. 베타 준비 상태 전체 진단. |
| `docs/release/beta-release-checklist.md` | 신규 생성. 배포 전 자동/수동 체크리스트. |
| `docs/release/known-issues.md` | 신규 생성. P0~P3 이슈 분류 및 임시 완화 방법. |
| `docs/release/release-freeze-rules.md` | 신규 생성. 베타 기간 동결 항목 명시. |
| `docs/ops/ops-playbook.md` | 신규 생성. 장애 대응 및 헬스 체크 가이드. |

---

## 3. 동결 항목 재확인

Phase 25 이후 다음 항목은 변경하지 않습니다:
- 인트라데이 숨김 정책
- 홈 화면 단일 fetch 아키텍처
- 명시적 저장 전용 정책
- 종목 상세 진입 속도 제한 보호
- 소스 페이지네이션
- AI/원본 분리
- 추천 Disclaimer 필수

---

## 4. 검증

Phase 25 완료 후 실행할 검증:

```bash
npm run validate        # lint + typecheck
npm run test:contracts
npm run test:persistence
npm run test:workflows
npm run test:evals
npm run build
```

수동 검증 항목:
1. 홈 카드 스켈레톤 로딩 → 데이터 정상 표시
2. 홈 footer에 "모킹 스텁" 문구 없음
3. AIPicksCard에 candidateCategory 배지 표시
4. `/workflows/recent` 접속 후 종목 조회 → 감성 데이터 카드 표시됨
5. `/workflows/bookmarks` 북마크 후 → 감성 데이터 카드 표시됨
6. 빈 워크플로우에서 안내 문구 표시

---

## 5. 결론

Phase 25는 기능 추가 없이 **신뢰성, 일관성, 문서화**에만 집중한 릴리즈입니다.

- 사용자가 보는 로딩/에러/빈 상태가 의도적이고 명확해졌습니다.
- 워크플로우 페이지의 핵심 버그가 수정되어 실제로 사용 가능해졌습니다.
- 베타 테스터와 개발자를 위한 문서가 현재 코드베이스와 일치하게 정비되었습니다.
- 릴리즈 동결 규칙이 명문화되어 팀 내 공통 기준이 생겼습니다.
