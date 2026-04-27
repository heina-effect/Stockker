# User Persistence Model

Stockker 서비스는 클라이언트 우선(Local-First) 영구 저장 모델을 활용하여 로그인 없이도 개인화된 리서치 경험을 제공합니다. 

## 저장 대상 원칙
- **관심 종목 (Watchlist)**: 브라우저 캐시에 누적, 홈 Dashboard 렌더링 시 최우선 노출.
- **최근 검색어**: GNB Search에서 접근 가능한 맥락 리스트.
- **평균 매수가 (Buy Price Plan)**: 종목 상세 페이지 내 대응 가이드 용도. 자동 저장(Auto-save) 금지 원칙(명시적 저장 버튼 클릭 시에만 영구 보존).
- **UI 설정**: 마지막으로 시청 중이던 차트 모드(`일봉` vs `당일`).

## 로컬 아답터 (`LocalStorageAdapter`)
추후 `ServerAdapter` 또는 Next.js `Edge API`로의 마이그레이션을 대비해 싱글톤 아답터 디자인 패턴을 유지합니다.

### 명시적 저장 원칙 (Explicit Save Policy)
입력 중인 값("임시 입력")이 바로 영구화되어 혼선을 주지 않도록,
사용자가 의도적으로 `가이드 받기` 및 `저장`을 승인한 값만 LocalStorage로 내려갑니다.
- `저장됨`: 영구 보관 중.
- `임시 입력`: 세션 탭 이탈 시 삭제.
