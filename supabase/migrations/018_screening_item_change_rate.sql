-- 스크리닝 항목의 등락률(2026-11-06).
--
-- 화면이 저장분을 읽게 되면서(안 B) "전일대비"가 사라졌다. 값은 스크리닝 때 이미 있는 거래량 순위의 prdy_ctrt 인데
-- 저장하지 않고 있었다. 과거분은 screening.log 가 있는 10/22 부터만 채운다. 그 전은 NULL 로 두고 소급 계산하지 않는다.

ALTER TABLE public.overnight_screening_items
  ADD COLUMN IF NOT EXISTS change_rate numeric;         -- 스크리닝 시점 전일대비 등락률(%)
