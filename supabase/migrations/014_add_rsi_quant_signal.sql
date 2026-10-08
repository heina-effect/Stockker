-- 스키마 이력 복구용 마이그레이션.
--
-- overnight_screening_items.rsi14 / .quant_signal 컬럼은 Phase 41(퀀트 진입 조건 도입)에서
-- 대시보드 SQL 에디터로 수동 추가되어 실제 운영 DB에는 이미 존재하지만, 이를 추가하는
-- ALTER TABLE이 마이그레이션 파일로 남아있지 않아 스키마 재현 이력이 끊겨 있었다(2026-09-10
-- 코드베이스 정리 감사에서 발견). 이미 컬럼이 있는 환경에서 재실행해도 안전하도록
-- IF NOT EXISTS로 작성한다 — 실제 운영 DB에는 추가 변경이 없다.

ALTER TABLE public.overnight_screening_items
  ADD COLUMN IF NOT EXISTS rsi14 numeric,              -- 포착일 RSI(14), Wilder 평활 기준
  ADD COLUMN IF NOT EXISTS quant_signal boolean;        -- 퀀트 진입 조건(RSI 50~60 + 거래량 200~400%) 충족 여부
