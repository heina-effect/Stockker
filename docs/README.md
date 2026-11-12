# Stockker Docs

문서는 성격별로 폴더를 나눠 관리합니다.

## 폴더 구조

| 폴더 | 용도 |
| --- | --- |
| `core/` | 현재 런타임 기준의 핵심 설계, 설정, API 계약, 데이터/테마/저장 정책 |
| `phases/` | Phase별 감사 문서와 완료 리포트, 제품 전환 기록. 기능 단위 phase 는 phase-40 까지. 현재 운용 방식은 아래 "Phase 체계 — 현재 운용 방식" 참고 |
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

## Phase 체계 — 현재 운용 방식

- 기능 단위 phase 는 phase-40(2026-08-19)에서 끝냈다.
- 41·42 는 비공개 문서이며 저장소에 없다.
- **2026-11-12 부터, 여러 단계에 걸친 구조 변경에 한해 번호를 이어 쓴다**(43 부터). 이 성격의 작업은 버그도 가설도 단일 기능도 아니어서 다음 항목의 세 곳 어디에도 들어가지 않는다.
- 그 밖의 기록에는 phase 를 쓰지 않는다. 버그는 [release/known-issues.md](release/known-issues.md), 가설은 [analysis/hypothesis-log.md](../analysis/hypothesis-log.md), 기능은 커밋 메시지에 남긴다.
