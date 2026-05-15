# Stockker Phase 19 Report — Gemini Embedding News Curation & Vector Store Integration

## 1. 개요

Phase 19는 **Gemini Embedding을 소스 품질 필터/랭커로 사용**하는 작업입니다.
뉴스/공시를 더 가져오는 게 아니라, 이미 가져온 소스를 더 잘 선별합니다.

---

## 2. 핵심 구현 내역

### 2.1 Embedding Curator 파이프라인 (`embedding-curator.ts`)

이슈/감성 파이프라인에 새로운 Step 3이 추가되었습니다:

```
[Fetch] → [Normalize] → [Embed + Score] → [Cluster/Dedupe] → [Curated] → [AI 생성]
```

**스팸 필터**: 스팸성 헤드라인 레퍼런스 셋을 임베딩, 유사도 ≥ 0.82인 소스 자동 제거

**품질 스코어링** (0-100):
- 스팸 센트로이드 역유사도
- Provider 신뢰도 가중치 (Open DART=1.0 ~ Mock News=0.0)
- 시간 기반 신선도 (6시간 이내 = 만점)
- 전략 태그 수 보너스 (실적/수주/규제 등 7종)
- 크로스 소스 확인 보너스

**의미적 중복 제거**: 유사도 ≥ 0.88인 소스를 동일 이슈로 묶고 대표 소스 선택

**Non-fatal 설계**: Embedding API 실패 시 `normalized` 소스를 그대로 사용 (파이프라인 중단 없음)

### 2.2 Vector Store 추상화 레이어 (`vector-store.ts`)

| 어댑터 | 상태 | 조건 |
|---|---|---|
| In-Memory | ✅ 기본 동작 | 항상 (Supabase 미설정 시) |
| Supabase pgvector | ✅ 구현 완료 | `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` 설정 |
| Pinecone | 🔜 인터페이스 준수 | 향후 어댑터 추가 가능 |

**인터페이스**: `upsertSourceEmbeddings`, `searchSimilarSources`, `fetchSourceCluster`, `findNearestTrustedCentroid`, `findNearestSpamCentroid`

### 2.3 SourceItem 타입 확장 (`types/research.ts`)

```typescript
_qualityScore?: number;          // 0-100
_qualityLabel?: SourceQualityLabel; // high / medium / low / rejected
_strategyTags?: string[];
_crossConfirmCount?: number;
_isMock?: boolean;
```

### 2.4 UI 개선

**IssueTimelineCard**:
- 제목 옆 `AI 선별` 보라색 배지 추가
- 크로스 소스 확인 시 `근거 충분 (N개 소스 확인)` 초록 배지

**SentimentScoreCard**:
- 출처별 `근거 충분 / 근거 보통 / 근거 부족` 레이블 표시
- **"더 보기" 페이지네이션**: 첫 3개 표시 후 접기/펼치기 가능
- Dev Meta에 `sourceCount` 추가

---

## 3. 품질 레이블 정책

> ⚠️ "신뢰도 95%" 같은 수치는 절대 표시하지 않습니다.

| 레이블 | UI 표시 | 색상 |
|---|---|---|
| `high` | 근거 충분 | 초록 |
| `medium` | 근거 보통 | 노란 |
| `low` | 근거 부족 | 회색 |
| `rejected` | 미표시 (필터링됨) | — |

---

## 4. 파이프라인 변화

| Before | After |
|---|---|
| KIS 뉴스 10개 전부 Gemini Flash에 전달 | Embedding 스코어링 후 curated 소스만 전달 |
| 스팸/광고성 뉴스가 감성 분석에 포함될 가능성 | 유사도 ≥ 0.82 스팸 자동 제거 |
| 동일 이슈 중복 소스 다수 전달 | 의미적 중복 제거 후 대표 소스만 전달 |
| 소스 품질 정보 없음 | quality_score + quality_label per source |
| 출처 목록 전체 표시 | 3개 우선 표시 + 더 보기 UI |

---

## 5. 향후 과제 (Phase 20+)
- Supabase pgvector 실제 연결 및 `source_embeddings` 테이블 생성
- 신뢰 센트로이드 / 스팸 센트로이드 실제 벡터 계산 후 DB 저장
- Gemini Embedding을 이용한 홈 인텔리전스 후보 군집화
- 관련 종목/섹터 Embedding 기반 recall 개선
