# User Persistence Model

## 1. 목적
개인화된 리서치 경험을 제공하기 위해 사용자의 관심사, 상태, 임시 입력값 등을 로컬 스토리지 기반으로 영속화(Persistent)합니다.
추후 백엔드 데이터베이스로 마이그레이션이 용이하도록 Adapter 패턴(`LocalStorageAdapter`)을 사용합니다.

## 2. Schema Definition (`src/lib/user-storage/local-adapter.ts`)
```typescript
export interface UserStorageSchema {
  watchlist: string[];             // 관심 종목 (티커 배열)
  recentSearches: string[];        // 최근 검색어 (최대 10개)
  recentViewed: string[];          // 최근 본 종목 (최대 10개)
  buyPrices: Record<string, number>; // 평단가 { "005930": 75000 }
  bookmarkedReports: string[];     // 북마크한 종목/리포트
  preferences: {
    theme: "light" | "dark" | "system";
    chartMode: "daily" | "intraday";
  }
}
```

## 3. 핵심 규칙
1. **명시적 저장 (Explicit Save)**:
   - "가이드 받기"를 눌러 AI 분석을 받는 행위 자체는 평단가를 저장하지 않습니다 (임시 입력 상태).
   - 분석 결과 확인 후 "이 평단가 저장" 버튼을 명시적으로 클릭해야만 `buyPrices`에 영구 기록됩니다.
2. **Hydration Flicker 방지**:
   - 컴포넌트 마운트 전에는 `isMounted` 또는 `hydrated` 상태를 추적하여 임의 렌더링을 방지하고 Skeleton을 보여줍니다.
3. **용량 및 제한 (Limitation)**:
   - `recentSearches`와 `recentViewed`는 최대 10개로 롤링(LIFO) 보관됩니다.
4. **추후 확장성**:
   - `LocalStorageAdapter.getAll() / setAll()`을 서버 API(ex: `GET /api/user/me`, `PATCH /api/user/me`)로 교체하는 것만으로 전체 시스템 마이그레이션이 완료되도록 설계되었습니다.
