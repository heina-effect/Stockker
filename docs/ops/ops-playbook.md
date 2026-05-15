# Ops Playbook — Stockker Beta

운영 및 장애 대응 가이드입니다. 베타 기간 중 담당 개발자가 참고하세요.

---

## 1. 헬스 체크

```bash
# 서비스 상태 확인
curl http://localhost:3000/api/health

# 내부 메트릭 확인 (DB 연결 필요)
curl http://localhost:3000/api/ops/metrics
```

정상 응답 예시:
```json
{
  "ok": true,
  "metrics": {
    "totalRawSources": 1245,
    "totalCuratedEmbeddings": 890,
    "curationRatio": "71%",
    "totalStockSnapshots": 48,
    "totalSectorSnapshots": 7,
    "recent24h": {
      "totalCurated": 120,
      "providerBreakdown": { "KIS": 45, "DART": 20, "GNews": 35, "NewsAPI": 20 },
      "qualityBreakdown": { "high": 60, "medium": 40, "low": 15, "rejected": 5 },
      "rejectedRatio": "4%"
    }
  }
}
```

---

## 2. 홈 인텔리전스 캐시

**증상**: 홈 화면이 오랫동안 스켈레톤 상태로 유지됨  
**원인**: `/api/home/intelligence` 응답 지연 또는 실패

**확인**:
```bash
curl -w "\n총 소요: %{time_total}s\n" http://localhost:3000/api/home/intelligence
```

**대응**:
1. 응답이 `{}` (빈 객체)인 경우 → Gemini API 쿼터 확인
2. 응답 시간 > 10초 → Upstash Redis 연결 확인 (캐시 미스 + AI 재생성 중)
3. 캐시를 강제로 재생성하려면 서버 재시작 (`npm run dev:reset`)

---

## 3. Gemini API 쿼터 초과 대응

**증상**: 홈 카드 / 종목 감성 / 섹터 요약이 빈 상태 또는 fallback 데이터로 표시됨  
**원인**: Gemini API 429 / 쿼터 초과

**확인**: 개발 환경에서 홈 카드 하단의 Dev Overlay (`data._meta.fallbackReason`) 확인

**대응**:
1. **단기**: 대부분의 기능이 스냅샷 재사용으로 동작하므로 잠시 대기하면 자동 회복
2. **중기**: `GEMINI_API_KEY` 쿼터 증설 요청 또는 키 교체
3. **장기**: `/api/ops/metrics`의 `rejectedRatio`가 지속적으로 높다면 소스 수집 빈도 조정

---

## 4. Supabase DB 연결 실패

**증상**: `/api/ops/metrics` → `{ ok: false, error: "Database not connected" }`  
**원인**: `SUPABASE_SERVICE_ROLE_KEY` 또는 `NEXT_PUBLIC_SUPABASE_URL` 환경 변수 누락/오류

**확인**:
```bash
# 환경 변수 확인
echo $NEXT_PUBLIC_SUPABASE_URL
echo $SUPABASE_SERVICE_ROLE_KEY
```

**대응**:
1. `.env.local` 파일의 Supabase 변수 재확인
2. Supabase 대시보드에서 프로젝트 상태 확인
3. DB 없이도 기본 기능은 fallback으로 동작함 (스냅샷 없이 실시간 생성)

---

## 5. 스냅샷 재생성 강제 실행

특정 종목/섹터 스냅샷을 강제로 재생성하고 싶을 때:

```bash
# 종목 스냅샷 강제 재생성 (TTL 만료 대기 없이)
# → Supabase에서 해당 symbol의 updated_at을 과거로 업데이트하면 다음 접속 시 재생성됨
# (직접 DB 쿼리 필요)

# 섹터 스냅샷 강제 재생성
# → 섹터 상세 페이지 접속 시 stale 판단 후 백그라운드 재생성 시작됨
```

---

## 6. 소스 파이프라인 모니터링

정상적인 소스 수집 비율:
- **KIS**: 5-20건/종목
- **DART**: 0-5건/종목 (공시 있을 때만)
- **GNews**: 5-10건/키워드
- **NewsAPI**: 5-10건/키워드

비정상 징후:
- 특정 소스의 수집이 24시간 동안 0건 → API 키 유효성 확인
- `rejectedRatio` > 30% → 소스 품질 저하 또는 필터 과도 작동

---

## 6.5 Master 데이터 검증

검색/섹터/연관 종목이 이상하게 보일 때 먼저 master를 검증합니다.

```bash
npm run validate:master
npm run validate:db-master
```

증상별 확인:
- 검색에 없는 종목이 노출됨 → `listing-status.ts`, `stock_master.is_active` 확인
- 섹터에 엉뚱한 종목이 노출됨 → `sector_master.member_symbols`, `src/data/sectors/taxonomy.ts` 확인
- DB row가 1,000건만 읽히는 것처럼 보임 → `db-registry.ts` pagination 유지 확인
- DART에는 있으나 현재 지원하지 않는 종목 → unsupported symbol로 비활성화

---

## 7. 개발 서버 재시작

```bash
# 일반 재시작
npm run dev

# 포트 충돌 + .next 캐시 초기화
npm run dev:reset
```

---

## 8. AI 평가(Eval) 실패 시

```bash
npm run test:evals
```

실패 항목:
- **면책 조항 누락**: AI 프롬프트의 disclaimer 요구사항 확인
- **지시적 표현**: `orchestrator.ts` 프롬프트에서 금지 어구 제거
- **출처 부족**: `MIN_REAL_SOURCES` (현재 2) 이하로 호출된 경우 — 소스 파이프라인 확인
- **최신성 부족**: 3일 이상 지난 소스만 있는 경우 — GNews/NewsAPI 키 확인

---

## 9. 베타 기간 중 긴급 연락

문제 발생 시:
1. `docs/release/known-issues.md`에 이슈 기록
2. P0 이슈: 즉시 hotfix PR 생성
3. P1 이슈: 다음 배포 주기에 포함
4. 동결 항목 관련 문의: `docs/release/release-freeze-rules.md` 참조
