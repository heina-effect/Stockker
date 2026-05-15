# Phase 23 Report — Multi-Source Research Productization & Snapshot Reuse

## 1. 개요
Phase 23에서는 Stockker의 기존 4-Source 파이프라인(KIS, DART, GNews, NewsAPI) 및 Supabase pgvector 인프라를 바탕으로, 실시간 요청에 의한 과도한 생성(Regeneration)을 줄이고 저장된 리서치 자산(Snapshots)의 재사용률을 높여 "Daily-use Research Product"로서의 품질을 고도화했습니다.

## 2. 주요 구현 사항 및 개선점

### A. Docs vs Runtime 불일치 해소 (Mandatory Reality Check)
- 기존 `architecture.md` 및 `research-api-contract.md`에 남아 있던 과거 KIS/DART 단일 소스 중심의 서술과 "GPT-5.4" 등의 허구적 명세(Drift)를 완전히 제거했습니다.
- 현재의 4-Source 파이프라인, Gemini 단일 아키텍처(Flash/Flash-Lite), 그리고 Supabase 기반의 DB-First 정책이 문서와 정확히 일치하도록 동기화했습니다 (`docs/phases/phase-23-audit.md` 참조).

### B. Snapshot 재사용 극대화 (DB-First 큐레이션)
- `/api/stocks/[symbol]/issues` 라우트에서 호출하는 `generateIssues` 로직을 대폭 개선했습니다.
- 기존에는 매 요청 시마다 4개 소스 API를 병렬 호출하여 큐레이팅하였으나, 이제 **최근 1시간 내에 저장된 Curated Sources가 DB에 충분히 존재할 경우** 외부 Fetch를 생략하고 DB 캐시를 즉시 사용하여 클러스터링을 수행하도록 변경했습니다.
- 이를 통해 불필요한 API 할당량 소모와 지연 시간(Latency)을 줄였습니다.

### C. 멀티 소스 퀄리티 캘리브레이션 (Quality Calibration)
- `embedding-curator.ts` 내부의 큐레이션 알고리즘을 강화했습니다.
- **Provider Trust 조정**: 신뢰도가 높은 출처(공시, 경제/금융 전문지)에 더 높은 가중치를 부여했습니다.
- **스팸/노이즈 거름망 강화**: 유사도 기반의 스팸 페널티 곡선을 더 가파르게 조정하여, 실속 없는 일반 뉴스 노출을 차단했습니다.
- **Cross-Source Confirmation**: 여러 매체에서 교차 확인(Cross-confirm)된 이슈에 대한 보너스 가중치를 상향하여, 보다 팩트 기반의 주요 이슈가 랭킹 상단에 노출되도록 했습니다.

### D. 내부 옵스(Ops) 및 퀄리티 모니터링 가시성 확보
- `/api/ops/metrics` 엔드포인트를 고도화하여 내부 운영 모니터링 수준을 향상시켰습니다.
- 단순히 전체 데이터 수량만 보여주던 것을 넘어, 최근 24시간 동안 수집된 데이터의 **Provider Breakdown**(매체별 비중), **Quality Breakdown**(high, medium, low, rejected 비중), 그리고 **기각률(Rejected Ratio)**을 한눈에 확인할 수 있도록 JSON 응답을 세분화했습니다.

### E. AI Home Intelligence의 추천 안전성 및 설명력 강화
- `aiGenerateHomeIntelligence` 프롬프트를 세밀하게 조정하여, "왜 이 이슈/종목이 트렌딩하는가"에 대한 이유를 반드시 수집된 **실제 데이터(Curated Sources) 기반으로만 작성**하도록 강제했습니다 (No Hallucination).
- AI 추천 픽(AI Picks)에 대해 `event_driven`, `momentum`, `undervalued`의 명확한 카테고리화를 요구하고, 투자 위험성과 책임 고지(Disclaimer)를 더욱 엄격하게 준수하도록 가드레일을 덧씌웠습니다.

### F. Saved Research Workflows (사용자 저장 상태 기반 모아보기)
- 기존에 로컬 스토리지에만 저장되고 단편적으로 쓰이던 `watchlist`를 활용하여, `/workflows/watchlist` 라우트에 **"관심 종목 리서치 모아보기"** 페이지를 신규 구축했습니다.
- 여러 관심 종목의 AI 요약 리포트를 한 화면에서 빠르게 브라우징할 수 있도록 하여, 실제 Daily Research 업무 흐름에 부합하는 사용자 경험을 제공합니다.

## 3. 결론 및 다음 단계
이러한 일련의 품질 개선(Hardening) 작업을 통해 Stockker는 불필요한 연산을 줄이면서도 훨씬 더 신뢰성 있고 일관된 "일간 주식 리서치 경험"을 제공할 수 있게 되었습니다. 
향후 페이즈에서는 저장된 사용자의 관심 종목 이력 등을 적극 활용하는 "Saved Research Workflows(관심 종목 모아보기, 열람 히스토리 등)" 화면을 본격적으로 확장할 예정입니다.
