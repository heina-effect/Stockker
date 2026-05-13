-- ============================================================
-- Stockker Migration 005 — stock_master, sector_master 테이블
-- DB 중심 종목·섹터 관리로 전환
-- ============================================================

-- ─── sector_master 테이블 ────────────────────────────────────
CREATE TABLE IF NOT EXISTS sector_master (
  sector_id               TEXT PRIMARY KEY,
  name                    TEXT NOT NULL,
  aliases                 TEXT[] NOT NULL DEFAULT '{}',
  description             TEXT NOT NULL DEFAULT '',
  member_symbols          TEXT[] NOT NULL DEFAULT '{}',
  representative_symbols  TEXT[] NOT NULL DEFAULT '{}',
  icon_key                TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  display_order           SMALLINT NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sector_master_active
  ON sector_master (is_active, display_order);

CREATE INDEX IF NOT EXISTS idx_sector_master_members
  ON sector_master USING GIN (member_symbols);

-- ─── stock_master 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS stock_master (
  symbol      TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  market      TEXT NOT NULL
                CHECK (market IN ('KOSPI','KOSDAQ','INDEX','ETF')),
  sector_tag  TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_master_market
  ON stock_master (market)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_stock_master_updated
  ON stock_master (updated_at DESC);

-- ─── RLS (Row Level Security) ─────────────────────────────────
ALTER TABLE sector_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_master  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sector_master' AND policyname = 'Public read sector_master'
  ) THEN
    CREATE POLICY "Public read sector_master"
      ON sector_master FOR SELECT USING (TRUE);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'stock_master' AND policyname = 'Public read stock_master'
  ) THEN
    CREATE POLICY "Public read stock_master"
      ON stock_master FOR SELECT USING (TRUE);
  END IF;
END$$;

-- ─── Seed Data: sector_master (기존 taxonomy.ts에서) ────────────
INSERT INTO sector_master
  (sector_id, name, aliases, description, member_symbols, representative_symbols, icon_key, display_order)
VALUES
  ('sec-semiconductor', '반도체',
   ARRAY['메모리','시스템반도체','HBM','IT'],
   '메모리, 파운드리, 팹리스 및 관련 소부장 기업을 포함하는 IT 하드웨어의 핵심 섹터',
   ARRAY['005930','000660','042700','039030'],
   ARRAY['005930','000660'],
   'cpu', 1),

  ('sec-battery', '2차전지',
   ARRAY['배터리','전기차배터리','EV'],
   '전기차 탑재 배터리 셀 제조 및 양극재/음극재 등 관련 소재 생산업체',
   ARRAY['373220','247540','006400','086520','003670'],
   ARRAY['373220','247540'],
   'battery', 2),

  ('sec-biotech', '바이오·제약',
   ARRAY['바이오','제약','신약','CMO','헬스케어'],
   '신약 개발, 바이오 시밀러, 위탁생산(CMO) 및 의료기기 관련 섹터',
   ARRAY['068270','196170','028300'],
   ARRAY['068270','196170'],
   'flask', 3),

  ('sec-platform', '인터넷·플랫폼',
   ARRAY['IT플랫폼','인터넷','소프트웨어','포털'],
   '국내 주요 포털, 메신저 및 IT 서비스 플랫폼 기반 소프트웨어 기업',
   ARRAY['035420','035720'],
   ARRAY['035420','035720'],
   'layout', 4),

  ('sec-finance', '금융',
   ARRAY['은행','금융지주','보험','증권'],
   '국내 주요 금융지주, 은행 및 보험사 중심의 전통 금융 섹터',
   ARRAY['105560','055550','086790'],
   ARRAY['105560','055550'],
   'landmark', 5),

  ('sec-entertainment', '엔터테인먼트',
   ARRAY['엔터','K팝','연예기획사','미디어'],
   '글로벌 K-pop 아티스트 매니지먼트 및 콘텐츠 제작 기업',
   ARRAY['352820','122870','041510'],
   ARRAY['352820','122870'],
   'music', 6),

  ('sec-auto', '자동차',
   ARRAY['완성차','자동차부품','전기차'],
   '내연기관 및 친환경 전기차 제조, 관련 자동차 부품 공급 기업',
   ARRAY['005380','000270'],
   ARRAY['005380','000270'],
   'car', 7),

  ('sec-defense', '우주항공·방산',
   ARRAY['K-방산','전투기','미사일','위성','A&D'],
   '글로벌 지정학적 리스크와 국방 현대화 수요에 따른 대규모 수출 모멘텀 섹터',
   ARRAY['012450','073120','272210','064350'],
   ARRAY['012450','073120'],
   'shield', 8),

  ('sec-ai-infra', 'AI 인프라·전력',
   ARRAY['변압기','전력설비','구리','데이터센터','SMR'],
   'AI 연산 수요 폭증으로 인한 데이터센터 증설 및 노후 전력망 교체 수혜 섹터',
   ARRAY['267260','010120','000880','042700'],
   ARRAY['267260','010120'],
   'zap', 9),

  ('sec-obesity-bio', '차세대 바이오·비만',
   ARRAY['비만치료제','GLP-1','플랫폼바이오','ADC'],
   '글로벌 메가 트렌드인 비만 치료제 및 약물 전달 플랫폼 기술 중심의 고성장 바이오',
   ARRAY['196170','000100','128940','419080'],
   ARRAY['196170','000100'],
   'dna', 10),

  ('sec-robotics', '로봇·자동화',
   ARRAY['협동로봇','휴머노이드','스마트팩토리','AGV'],
   '인구 구조 변화와 AI 결합을 통한 산업 및 서비스 로봇 시장 확대 섹터',
   ARRAY['277810','454910','054060'],
   ARRAY['277810','454910'],
   'bot', 11),

  ('sec-advanced-materials', '첨단 소재·기판',
   ARRAY['유리기판','TGV','반도체소재','나노'],
   '차세대 반도체 패키징 솔루션인 유리기판 및 고부가가치 첨단 소재 관련주',
   ARRAY['009150','033640','222420'],
   ARRAY['009150','033640'],
   'layers', 12)
ON CONFLICT (sector_id) DO NOTHING;

-- ─── Seed Data: stock_master (기존 metadata.ts에서) ────────────
INSERT INTO stock_master (symbol, name, market, sector_tag)
VALUES
  ('1001', 'KOSDAQ', 'INDEX', NULL),
  ('105560', 'KB금융', 'KOSPI', '금융'),
  ('114800', 'KODEX 인버스', 'ETF', '시장대표'),
  ('122630', 'KODEX 레버리지', 'ETF', '시장대표'),
  ('122870', '와이지엔터테인먼트', 'KOSDAQ', '엔터'),
  ('133690', 'TIGER 미국나스닥100', 'ETF', '해외주식'),
  ('196170', '알테오젠', 'KOSDAQ', '바이오'),
  ('247540', '에코프로비엠', 'KOSDAQ', '2차전지'),
  ('252670', 'KODEX 200선물인버스2X', 'ETF', '시장대표'),
  ('259960', '크래프톤', 'KOSPI', '게임'),
  ('305080', 'TIGER 미국배당다우존스', 'ETF', '해외주식'),
  ('305540', 'KINDEX 미국나스닥100', 'ETF', '해외주식'),
  ('352820', '하이브', 'KOSPI', '엔터'),
  ('360750', 'TIGER 미국S&P500', 'ETF', '해외주식'),
  ('373220', 'LG에너지솔루션', 'KOSPI', '화학'),
  ('005930', '삼성전자', 'KOSPI', 'IT'),
  ('000660', 'SK하이닉스', 'KOSPI', 'IT'),
  ('035420', 'NAVER', 'KOSPI', 'IT'),
  ('035720', 'KAKAO', 'KOSPI', 'IT'),
  ('000270', '기아', 'KOSPI', '자동차'),
  ('005380', '현대차', 'KOSPI', '자동차'),
  ('006400', '삼성SDI', 'KOSPI', '2차전지'),
  ('051910', 'LG화학', 'KOSPI', '화학'),
  ('086520', '에코프로', 'KOSDAQ', '2차전지'),
  ('003670', '포스코인터내셔널', 'KOSPI', '철강'),
  ('068270', '셀트리온', 'KOSPI', '바이오'),
  ('028300', 'HLB', 'KOSDAQ', '바이오'),
  ('041510', 'SK스퀘어', 'KOSPI', '엔터'),
  ('055550', '신한지주', 'KOSPI', '금융'),
  ('086790', '하나금융지주', 'KOSPI', '금융'),
  ('071050', '한국금융지주', 'KOSPI', '금융'),
  ('138040', '메리츠금융지주', 'KOSPI', '금융'),
  ('316140', '우리금융지주', 'KOSPI', '금융'),
  ('012450', '한화에어로스페이스', 'KOSPI', '방산'),
  ('073120', 'LIG넥스원', 'KOSPI', '방산'),
  ('272210', '한화시스템', 'KOSPI', '방산'),
  ('064350', '현대로템', 'KOSPI', '방산'),
  ('267260', 'HD현대일렉트릭', 'KOSPI', '전력'),
  ('010120', 'LS ELECTRIC', 'KOSPI', '전력'),
  ('000880', 'LS', 'KOSPI', '전력'),
  ('000100', '유한양행', 'KOSPI', '제약'),
  ('128940', '한미약품', 'KOSPI', '제약'),
  ('419080', '펩트론', 'KOSDAQ', '바이오'),
  ('277810', '레인보우로보틱스', 'KOSPI', '로봇'),
  ('454910', '두산로보틱스', 'KOSDAQ', '로봇'),
  ('054060', '뉴로메카', 'KOSDAQ', '로봇'),
  ('009150', '삼성전기', 'KOSPI', '소재'),
  ('033640', 'SKC', 'KOSPI', '소재'),
  ('222420', '이오테크닉스', 'KOSDAQ', '장비')
ON CONFLICT (symbol) DO NOTHING;

-- ─── 검증 쿼리 (실행 후 결과 확인) ───────────────────────────
SELECT
  'sector_master' AS tbl, COUNT(*) AS cnt FROM sector_master
UNION ALL
SELECT 'stock_master', COUNT(*) FROM stock_master;
