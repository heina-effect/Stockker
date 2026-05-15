# Ops & Observability (Phase 24)

## 1. 개요
Stockker의 데이터 파이프라인과 AI 품질을 실시간으로 추적하기 위해 내부적으로 구축된 관측성(Observability) 시스템에 대해 설명합니다. 모든 모니터링 수치는 `/api/ops/metrics`를 통해 확인 가능합니다.

## 2. 주요 측정 지표 (Metrics)

### A. 파이프라인 수율 (Curation Ratio)
- `totalRawSources`: 4개 채널(KIS, DART, GNews, NewsAPI)에서 수집된 원본 뉴스의 총합.
- `totalCuratedEmbeddings`: 스팸 필터와 중복 제거, 퀄리티 캘리브레이션을 거쳐 최종적으로 `source_embeddings` 벡터 DB에 적재된 정제 데이터의 총합.
- `curationRatio`: 원본 뉴스 대비 정제된 뉴스의 비율 (일반적으로 30%~50% 유지). 이 수치가 너무 높으면 스팸 필터가 약해진 것이고, 너무 낮으면 AI 요약에 필요한 근거가 부족해질 수 있습니다.

### B. 매체 및 품질 기여도 (Provider & Quality Breakdown)
- **Provider Breakdown**: 지난 24시간 동안 벡터 스토어에 살아남은 뉴스들의 출처(KIS, DART, GNews 등) 비중. 특정 매체가 지나치게 지배적이지 않은지 모니터링합니다.
- **Quality Breakdown**: 큐레이터가 부여한 `high`, `medium`, `low`, `rejected` 등급 분포.
- **Rejected Ratio**: 수집되었으나 스코어 미달로 기각된 뉴스의 비율.

### C. 스냅샷 활용도 (Snapshot Reusability)
- `totalStockSnapshots`, `totalSectorSnapshots`: 현재 DB에 저장된 영구/반영구 리서치 스냅샷의 개수. 
- 이 수치가 빠르게 증가한다는 것은 시스템이 성공적으로 재사용 가능한 지식 에셋을 축적하고 있음을 의미합니다.

## 3. 평가 파이프라인 현황 (Evaluation Results)
(향후 고도화 시, Ops 대시보드에 Evaluation API의 실시간 Pass/Fail 로그를 통합하여 모니터링할 예정입니다.)
