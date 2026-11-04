# Stockker Docs

문서는 성격별로 폴더를 나눠 관리합니다.

## 폴더 구조

| 폴더 | 용도 |
| --- | --- |
| `core/` | 현재 런타임 기준의 핵심 설계, 설정, API 계약, 데이터/테마/저장 정책 |
| `phases/` | Phase별 감사 문서와 완료 리포트, 제품 전환 기록. phase-40 까지만 있고 이후 기록은 아래 "Phase 체계 종료" 참고 |
| `release/` | 베타 릴리즈 체크리스트, 알려진 이슈, 동결 규칙, 인트라데이 재개 조건 |
| `ops/` | 운영 플레이북, 관찰성, KIS 설정 감사 |
| `ui/` | UI 검증 노트와 shadcn 관련 보조 정보 |

## 자주 보는 문서

- [아키텍처](core/architecture.md)
- [로컬 설정](core/setup.md)
- [테마 동작](core/theme-behavior.md)
- [리서치 워크플로우](core/research-workflows.md)
- Phase 리포트: `phases/` 참고
- [Beta RC Gate](release/beta-rc-gate.md)
- [베타 릴리즈 체크리스트](release/beta-release-checklist.md)
- [운영 플레이북](ops/ops-playbook.md)

## Phase 체계 종료

Phase 리포트는 phase-40(2026-08-19)까지 운영했고 이후 중단했다. 41·42 는 비공개 문서이며 저장소에 없다. 10/12 이후의 작업 기록은 [release/known-issues.md](release/known-issues.md) 와 [analysis/hypothesis-log.md](../analysis/hypothesis-log.md) 에 있다.
