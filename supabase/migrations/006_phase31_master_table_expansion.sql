-- ============================================================
-- Stockker Migration 006 — Phase 31 sector/stock master expansion
-- Runtime table names are sector_master / stock_master.
-- ============================================================

INSERT INTO sector_master
  (sector_id, name, aliases, description, member_symbols, representative_symbols, icon_key, display_order)
VALUES
  ('sec-banking', '은행', ARRAY['금융지주','은행주','금리수혜','예대마진','금융'], '순이자마진(NIM)과 주주환원 정책이 핵심인 대형 금융지주 및 은행 섹터', ARRAY['105560','055550','086790','316140'], ARRAY['105560','055550'], 'landmark', 5),
  ('sec-securities', '증권', ARRAY['증권사','IB','브로커리지','거래대금'], '증시 거래대금 및 투자은행(IB) 수익, 자산운용 성과에 민감한 금융 섹터', ARRAY['006800','039490','005940','016360'], ARRAY['006800','039490'], 'line-chart', 13),
  ('sec-insurance', '보험', ARRAY['손해보험','생명보험','IFRS17','방어주'], '금리 상승기에 자산운용 수익률이 개선되는 고배당 성향의 보험 섹터', ARRAY['000810','005830','000060','001450'], ARRAY['000810','005830'], 'shield-check', 14),
  ('sec-shipbuilding', '조선', ARRAY['배','LNG선','조선소','도크'], '글로벌 물동량 및 친환경 선박 교체 수요에 따른 수주 산업 섹터', ARRAY['010140','009540','042660','010620'], ARRAY['010140','009540'], 'ship', 15),
  ('sec-heavy-machinery', '중공업', ARRAY['플랜트','엔진','기계','가스엔진'], '대형 엔진, 에너지 설비 및 산업용 중장비를 제조하는 기계 섹터', ARRAY['267250','010620','011170'], ARRAY['267250','011170'], 'anvil', 16),
  ('sec-construction', '건설', ARRAY['건설사','아파트','재건축','토목'], '국내 주택 경기 및 해외 플랜트 수주에 영향을 받는 건설·엔지니어링 섹터', ARRAY['000720','006360','047040'], ARRAY['000720','006360'], 'hard-hat', 17),
  ('sec-shipping', '해운', ARRAY['컨테이너','벌크선','물류','운임지수','BDI'], '글로벌 해상 운임(SCFI, BDI)과 물동량에 따라 실적이 결정되는 섹터', ARRAY['011200','028670','005880','044450','003280'], ARRAY['011200','028670'], 'anchor', 18),
  ('sec-nuclear', '원전', ARRAY['원자력','SMR','체코원전','에너지안보'], '탈탄소 정책과 AI 데이터센터 전력 수요로 재조명받는 원자력 발전 섹터', ARRAY['034020','052690','051600','011280'], ARRAY['034020','052690'], 'atom', 19),
  ('sec-energy', '에너지·화학', ARRAY['정유','석유','태양광','유가','수소'], '원유 정제 및 신재생 에너지, 기초 화학 소재를 다루는 섹터', ARRAY['096770','010950','009830','051910'], ARRAY['010950','009830'], 'fuel', 20),
  ('sec-retail', '백화점·유통', ARRAY['쇼핑','마트','면세점','편의점'], '내수 소비 지표와 관광객 수요에 민감한 온·오프라인 유통 섹터', ARRAY['069960','004170','023530','008770'], ARRAY['069960','004170'], 'shopping-bag', 21),
  ('sec-content', '영화·콘텐츠', ARRAY['미디어','OTT','드라마','영화관','K-콘텐츠'], '영상 제작, 배급 및 OTT 플랫폼 향 IP 파워를 보유한 미디어 섹터', ARRAY['035760','253450','079160','204990'], ARRAY['035760','253450'], 'clapperboard', 22),
  ('sec-food', '식음료', ARRAY['K푸드','라면','음식료','필수소비재'], '글로벌 수출 확대와 원자재 가격 하락 수혜를 받는 음식료 및 가공식품 섹터', ARRAY['003230','004370','097950','271560'], ARRAY['003230','004370'], 'utensils', 23),
  ('sec-beauty', '뷰티·의료기기', ARRAY['화장품','미용기기','올리브영','피부관리'], '글로벌 K-뷰티 확산과 고성장 중인 미용 의료기기(레이저, 리프팅) 섹터', ARRAY['192820','214150','290670','002790'], ARRAY['214150','290670'], 'sparkles', 24),
  ('sec-gaming', '게임', ARRAY['게임주','e스포츠','PC게임','모바일게임'], '신작 출시 모멘텀과 글로벌 플랫폼(스팀 등) 성과에 민감한 소프트웨어 섹터', ARRAY['259960','036570','064550','293490'], ARRAY['259960','036570'], 'gamepad-2', 25),
  ('sec-telecom', '통신', ARRAY['통신사','5G','6G','배당주'], '안정적인 현금 흐름과 높은 배당 수익률을 제공하는 대표적 방어 섹터', ARRAY['017670','030200','032640'], ARRAY['017670','030200'], 'signal', 26),
  ('sec-steel', '철강·금속', ARRAY['철강','금속','구리','비철금속'], '글로벌 경기 회복 및 원자재 가격 변동에 민감하게 반응하는 기초 소재 섹터', ARRAY['005490','004020','010130'], ARRAY['005490','010130'], 'mountain', 27),
  ('sec-travel', '여행·카지노', ARRAY['항공','카지노','면세점','호텔'], '여행 수요 및 외국인 입국객 수 지표에 따라 주가가 움직이는 서비스 섹터', ARRAY['003490','039130','035250','114090'], ARRAY['003490','039130'], 'plane', 28)
ON CONFLICT (sector_id) DO UPDATE SET
  name = EXCLUDED.name,
  aliases = EXCLUDED.aliases,
  description = EXCLUDED.description,
  member_symbols = EXCLUDED.member_symbols,
  representative_symbols = EXCLUDED.representative_symbols,
  icon_key = EXCLUDED.icon_key,
  display_order = EXCLUDED.display_order,
  is_active = TRUE,
  updated_at = NOW();

UPDATE sector_master SET
  aliases = ARRAY['방산','K-방산','전투기','미사일','위성','항공우주','A&D'],
  member_symbols = ARRAY['012450','079550','272210','064350'],
  representative_symbols = ARRAY['012450','079550'],
  updated_at = NOW()
WHERE sector_id = 'sec-defense';

UPDATE sector_master SET
  member_symbols = ARRAY['196170','000100','128940','087010'],
  representative_symbols = ARRAY['196170','000100'],
  updated_at = NOW()
WHERE sector_id = 'sec-obesity-bio';

UPDATE sector_master SET
  member_symbols = ARRAY['277810','454910','348340'],
  representative_symbols = ARRAY['277810','454910'],
  updated_at = NOW()
WHERE sector_id = 'sec-robotics';

UPDATE sector_master SET
  member_symbols = ARRAY['009150','011790','039030'],
  representative_symbols = ARRAY['009150','011790'],
  updated_at = NOW()
WHERE sector_id = 'sec-advanced-materials';

UPDATE sector_master SET
  member_symbols = ARRAY['267260','010120','006260','042700'],
  representative_symbols = ARRAY['267260','010120'],
  updated_at = NOW()
WHERE sector_id = 'sec-ai-infra';

INSERT INTO stock_master (symbol, name, market, sector_tag)
VALUES
  ('397030','에이프릴바이오','KOSDAQ','바이오'),
  ('087010','펩트론','KOSDAQ','바이오'),
  ('011790','SKC','KOSPI','소재'),
  ('348340','뉴로메카','KOSDAQ','로봇'),
  ('222420','쎄노텍','KOSDAQ','소재'),
  ('033640','네패스','KOSDAQ','소재'),
  ('000880','한화','KOSPI','방산'),
  ('006260','LS','KOSPI','전력'),
  ('035720','카카오','KOSPI','IT'),
  ('003670','포스코퓨처엠','KOSPI','2차전지'),
  ('041510','에스엠','KOSDAQ','엔터'),
  ('316140','우리금융지주','KOSPI','은행'),
  ('039490','키움증권','KOSPI','증권'),
  ('005940','NH투자증권','KOSPI','증권'),
  ('016360','삼성증권','KOSPI','증권'),
  ('000810','삼성화재','KOSPI','보험'),
  ('005830','DB손해보험','KOSPI','보험'),
  ('000060','메리츠화재','KOSPI','보험'),
  ('001450','현대해상','KOSPI','보험'),
  ('010140','삼성중공업','KOSPI','조선'),
  ('009540','HD한국조선해양','KOSPI','조선'),
  ('042660','한화오션','KOSPI','조선'),
  ('010620','HD현대미포','KOSPI','조선'),
  ('267250','HD현대','KOSPI','중공업'),
  ('011170','롯데케미칼','KOSPI','에너지·화학'),
  ('000720','현대건설','KOSPI','건설'),
  ('006360','GS건설','KOSPI','건설'),
  ('047040','대우건설','KOSPI','건설'),
  ('011200','HMM','KOSPI','해운'),
  ('028670','팬오션','KOSPI','해운'),
  ('005880','대한해운','KOSPI','해운'),
  ('044450','KSS해운','KOSPI','해운'),
  ('003280','흥아해운','KOSPI','해운'),
  ('034020','두산에너빌리티','KOSPI','원전'),
  ('052690','한전기술','KOSPI','원전'),
  ('051600','한전KPS','KOSPI','원전'),
  ('011280','태림포장','KOSPI','원전'),
  ('010950','S-Oil','KOSPI','에너지·화학'),
  ('009830','한화솔루션','KOSPI','에너지·화학'),
  ('069960','현대백화점','KOSPI','유통'),
  ('004170','신세계','KOSPI','유통'),
  ('023530','롯데쇼핑','KOSPI','유통'),
  ('008770','호텔신라','KOSPI','여행·카지노'),
  ('035760','CJ ENM','KOSDAQ','콘텐츠'),
  ('253450','스튜디오드래곤','KOSDAQ','콘텐츠'),
  ('079160','CJ CGV','KOSPI','콘텐츠'),
  ('204990','코썬바이오','KOSDAQ','콘텐츠'),
  ('003230','삼양식품','KOSPI','식음료'),
  ('004370','농심','KOSPI','식음료'),
  ('097950','CJ제일제당','KOSPI','식음료'),
  ('271560','오리온','KOSPI','식음료'),
  ('192820','코스맥스','KOSPI','뷰티'),
  ('214150','클래시스','KOSDAQ','뷰티'),
  ('290670','대보마그네틱','KOSDAQ','뷰티'),
  ('002790','아모레퍼시픽홀딩스','KOSPI','뷰티'),
  ('064550','바이오니아','KOSDAQ','게임'),
  ('293490','카카오게임즈','KOSDAQ','게임'),
  ('017670','SK텔레콤','KOSPI','통신'),
  ('030200','KT','KOSPI','통신'),
  ('032640','LG유플러스','KOSPI','통신'),
  ('004020','현대제철','KOSPI','철강'),
  ('010130','고려아연','KOSPI','철강'),
  ('003490','대한항공','KOSPI','여행·카지노'),
  ('039130','하나투어','KOSPI','여행·카지노'),
  ('035250','강원랜드','KOSPI','여행·카지노'),
  ('114090','GKL','KOSPI','여행·카지노')
ON CONFLICT (symbol) DO UPDATE SET
  name = EXCLUDED.name,
  market = EXCLUDED.market,
  sector_tag = EXCLUDED.sector_tag,
  is_active = TRUE,
  updated_at = NOW();

UPDATE stock_master
SET name = '엔젯', sector_tag = NULL, updated_at = NOW()
WHERE symbol = '419080';

UPDATE stock_master
SET is_active = FALSE, updated_at = NOW()
WHERE symbol = '054060' AND name = '뉴로메카';

UPDATE stock_master
SET is_active = FALSE, updated_at = NOW()
WHERE symbol = '073120' AND name = 'LIG넥스원';
