# KIS Configuration Audit Report

본 문서는 Stockker 프로젝트 내 KIS(한국투자증권) 관련 설정 및 환경변수, 그리고 AI 모델명 표기의 현황을 조사하고 정규화 방향을 정리한 리포트입니다.

## 1. KIS 환경변수 인벤토리

| 파일 경로 | 현재 변수명 / 문자열 | 추정 의미 | Canonical Target | 정책 (Keep/Alias/Rename) | 비고 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `.env.example` | `KIS_ENV` | 실행 환경 (real/mock) | `KIS_MODE` | Alias | `KIS_MODE`로 전환 권장 |
| `.env.example` | `KIS_APP_KEY` | 앱 키 | `KIS_APP_KEY` | Keep | 범용 키로 유지 |
| `.env.example` | `KIS_APP_SECRET` | 앱 시크릿 | `KIS_APP_SECRET` | Keep | 범용 시크릿으로 유지 |
| `.env.example` | `KIS_API_BASE_URL` | REST API URL | `KIS_REST_BASE_URL` | Alias | `KIS_MODE`에 따라 자동 결정 지원 |
| `.env.example` | `KIS_WS_BASE_URL` | 웹소켓 URL | `KIS_WS_BASE_URL` | Alias | `KIS_MODE`에 따라 자동 결정 지원 |
| `config.ts` | `kisParsed.KIS_ENV` | 환경 구분 로직 | `kisConfig.env` | Rename | `kisConfig.mode`로 통일 |
| `auth.ts` | `mock-access-token` | 토큰 플레이스홀더 | - | Remove | 실제 발급 로직으로 교체 |

## 2. AI 모델명 전수 조사 (Gemini)

| 파일 경로 | 현재 표기 | 수정 후 표기 | 비고 |
| :--- | :--- | :--- | :--- |
| `config.ts` | `gemini-3-flash-preview` | `Gemini 3 Flash` | 모델 설정 기본값 |
| `analyze/route.ts` | `Gemini: 뉴스 다건 요약...` | `Gemini 3 Flash: 뉴스 다건 요약...` | 주석 내 설명 |
| `task.md` | `Gemini 3 Flash` | `Gemini 3 Flash` | 이미 올바르게 사용 중 |

## 3. 판별 결과

- **고객 유형**: 현재 설정은 "개인/일반 고객(Retail) 대시보드 모드"를 타깃으로 하고 있습니다.
- **충돌 여부**: Phase 1의 `.env.example`과 `src/server/kis/*` 구조를 유지하되, 내부 로직을 더욱 엄격한 Canonical Schema로 업데이트할 예정입니다.
- **레거시 흔적**: 특별한 레거시 YAML이나 제휴사 전용 설정은 발견되지 않았으며, 순수 REST/WebSocket API 기반으로 구축되어 있습니다.

## 4. 향후 조치 사항
- `src/server/kis/config.ts`에서 Zod 스키마를 Canonical Name 중심으로 재작성.
- `Gemini 3 Flash` 공식 모델명을 코드 및 주석에서 일관되게 사용.
- `KIS_MODE`가 `prod`인 경우 실전 서버, `mock`인 경우 모의 투자 서버로 자동 라우팅 구현.
