# Phase 12 Audit: 현재 상태 진단 및 파이프라인/영속성 구조 검토

## 1. 개요
본 감사는 Phase 11에서 달성한 상세 페이지 진입 안정성(Rate-Limit EGW00201 해결)과 당일 차트 숨김(Hidden) 정책을 기반으로, AI 리포트 출처 실연동 및 로컬 스토리지 기반 사용자 영속성 기초를 마련하기 위한 현재 상태 진단입니다.

## 2. KIS 뉴스 및 공시 Source 현황
- **KIS 뉴스**: `getDomesticStockNews`를 통해 연결되어 있으나, 리포트에 구조적으로 병합되지 못함.
- **Open DART 공시**: `disclosure-provider.ts`가 fallback 위주로 작성되어 실제 DART API 연결이 누락되어 있음. Symbol 기반 검색을 위한 corp_code 매핑이 필요함.

## 3. 리포트 생성 파이프라인
- 기존 `model-router.ts` 내에 데이터 수집 로직이 강결합되어 있음.
- 중복 제거(dedupe), 정렬, 소스 병합(merge), 랭킹/클러스터링 처리가 체계적으로 분리되지 않음.
- AI 요약 결과와 원본(Raw Source)의 출처 표기가 모호함.

## 4. User Storage (Local-First) 현황
- `local-adapter.ts`에서 평단가(Buy Price) 저장은 명시적이지만, 전체 스키마가 부족.
- 최근 본 종목, 최근 검색어, 북마크 상태 등이 저장소에 반영되지 않음.
- 관련 UI들이 이 데이터를 읽고/쓰지 않음.

## 5. 결론 및 진행 방향
- **Open DART API 통합**: `corp-code-map.json`을 통해 티커-고유번호 매핑을 적용하고 실제 DART API 연동.
- **파이프라인화**: `pipeline/collect.ts`, `normalize.ts`, `rank.ts` 등을 도입하여 파이프라인을 구축.
- **로컬 스토리지 확장**: 최근 검색어, 최근 본 종목, 북마크 기능을 추가하고 각 UI에 반영.
- **차트**: 당일 차트 Hidden 유지 및 안정성(Phase 11 핫픽스) 보존.
