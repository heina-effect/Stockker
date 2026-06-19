export interface StockMetadata {
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ" | "INDEX" | "ETF";
  sector?: string;
}

export const STOCK_UNIVERSE: Record<string, StockMetadata> = {
  "1001": {
    "symbol": "1001",
    "name": "KOSDAQ",
    "market": "INDEX"
  },
  "105560": {
    "symbol": "105560",
    "name": "KB금융",
    "market": "KOSPI",
    "sector": "증권"
  },
  "114800": {
    "symbol": "114800",
    "name": "KODEX 인버스",
    "market": "ETF",
    "sector": "시장대표"
  },
  "122630": {
    "symbol": "122630",
    "name": "KODEX 레버리지",
    "market": "ETF",
    "sector": "시장대표"
  },
  "122870": {
    "symbol": "122870",
    "name": "와이지엔터테인먼트",
    "market": "KOSDAQ",
    "sector": "엔터"
  },
  "133690": {
    "symbol": "133690",
    "name": "TIGER 미국나스닥100",
    "market": "ETF",
    "sector": "해외주식"
  },
  "196170": {
    "symbol": "196170",
    "name": "알테오젠",
    "market": "KOSDAQ",
    "sector": "바이오"
  },
  "247540": {
    "symbol": "247540",
    "name": "에코프로비엠",
    "market": "KOSDAQ",
    "sector": "2차전지"
  },
  "252670": {
    "symbol": "252670",
    "name": "KODEX 200선물인버스2X",
    "market": "ETF",
    "sector": "시장대표"
  },
  "259960": {
    "symbol": "259960",
    "name": "크래프톤",
    "market": "KOSPI",
    "sector": "게임"
  },
  "305080": {
    "symbol": "305080",
    "name": "TIGER 미국배당다우존스",
    "market": "ETF",
    "sector": "해외주식"
  },
  "305540": {
    "symbol": "305540",
    "name": "KINDEX 미국나스닥100",
    "market": "ETF",
    "sector": "해외주식"
  },
  "352820": {
    "symbol": "352820",
    "name": "하이브",
    "market": "KOSPI",
    "sector": "엔터"
  },
  "360750": {
    "symbol": "360750",
    "name": "TIGER 미국S&P500",
    "market": "ETF",
    "sector": "해외주식"
  },
  "373220": {
    "symbol": "373220",
    "name": "LG에너지솔루션",
    "market": "KOSPI",
    "sector": "화학"
  },
  "005930": {
    "symbol": "005930",
    "name": "삼성전자",
    "market": "KOSPI",
    "sector": "IT"
  },
  "000660": {
    "symbol": "000660",
    "name": "SK하이닉스",
    "market": "KOSPI",
    "sector": "IT"
  },
  "035420": {
    "symbol": "035420",
    "name": "NAVER",
    "market": "KOSPI",
    "sector": "IT"
  },
  "035720": {
    "symbol": "035720",
    "name": "카카오",
    "market": "KOSPI",
    "sector": "IT"
  },
  "005380": {
    "symbol": "005380",
    "name": "현대차",
    "market": "KOSPI",
    "sector": "자동차"
  },
  "000270": {
    "symbol": "000270",
    "name": "기아",
    "market": "KOSPI",
    "sector": "자동차"
  },
  "042700": {
    "symbol": "042700",
    "name": "한미반도체",
    "market": "KOSPI",
    "sector": "IT"
  },
  "039030": {
    "symbol": "039030",
    "name": "이오테크닉스",
    "market": "KOSDAQ",
    "sector": "IT"
  },
  "068270": {
    "symbol": "068270",
    "name": "셀트리온",
    "market": "KOSPI",
    "sector": "바이오"
  },
  "028300": {
    "symbol": "028300",
    "name": "HLB",
    "market": "KOSDAQ",
    "sector": "바이오"
  },
  "0001": {
    "symbol": "0001",
    "name": "KOSPI",
    "market": "INDEX"
  },
  "055550": {
    "symbol": "055550",
    "name": "신한지주",
    "market": "KOSPI",
    "sector": "은행"
  },
  "086790": {
    "symbol": "086790",
    "name": "하나금융지주",
    "market": "KOSPI",
    "sector": "금융"
  },
  "051910": {
    "symbol": "051910",
    "name": "LG화학",
    "market": "KOSPI",
    "sector": "화학"
  },
  "006400": {
    "symbol": "006400",
    "name": "삼성SDI",
    "market": "KOSPI",
    "sector": "화학"
  },
  "006800": {
    "symbol": "006800",
    "name": "미래에셋증권",
    "market": "KOSPI",
    "sector": "금융"
  },
  "096770": {
    "symbol": "096770",
    "name": "SK이노베이션",
    "market": "KOSPI",
    "sector": "화학"
  },
  "003670": {
    "symbol": "003670",
    "name": "포스코퓨처엠",
    "market": "KOSPI",
    "sector": "화학"
  },
  "005490": {
    "symbol": "005490",
    "name": "POSCO홀딩스",
    "market": "KOSPI",
    "sector": "철강"
  },
  "069500": {
    "symbol": "069500",
    "name": "KODEX 200",
    "market": "ETF",
    "sector": "시장대표"
  },
  "041510": {
    "symbol": "041510",
    "name": "에스엠",
    "market": "KOSDAQ",
    "sector": "엔터"
  },
  "086520": {
    "symbol": "086520",
    "name": "에코프로",
    "market": "KOSDAQ",
    "sector": "2차전지"
  },
  "036570": {
    "symbol": "036570",
    "name": "엔씨소프트",
    "market": "KOSPI",
    "sector": "게임"
  },
  "039490": {
    "symbol": "039490",
    "name": "키움증권",
    "market": "KOSPI",
    "sector": "증권"
  },
  "071050": {
    "symbol": "071050",
    "name": "한국금융지주",
    "market": "KOSPI",
    "sector": "금융"
  },
  "138040": {
    "symbol": "138040",
    "name": "메리츠금융지주",
    "market": "KOSPI",
    "sector": "금융"
  },
  "316140": {
    "symbol": "316140",
    "name": "우리금융지주",
    "market": "KOSPI",
    "sector": "은행"
  },
  "012450": {
    "symbol": "012450",
    "name": "한화에어로스페이스",
    "market": "KOSPI",
    "sector": "방산"
  },
  "079550": {
    "symbol": "079550",
    "name": "LIG디펜스앤에어로스페이스",
    "market": "KOSPI",
    "sector": "방산"
  },
  "272210": {
    "symbol": "272210",
    "name": "한화시스템",
    "market": "KOSPI",
    "sector": "방산"
  },
  "064350": {
    "symbol": "064350",
    "name": "현대로템",
    "market": "KOSPI",
    "sector": "방산"
  },
  "267260": {
    "symbol": "267260",
    "name": "HD현대일렉트릭",
    "market": "KOSPI",
    "sector": "전력"
  },
  "010120": {
    "symbol": "010120",
    "name": "LS ELECTRIC",
    "market": "KOSPI",
    "sector": "전력"
  },
  "000880": {
    "symbol": "000880",
    "name": "한화",
    "market": "KOSPI",
    "sector": "방산"
  },
  "006260": {
    "symbol": "006260",
    "name": "LS",
    "market": "KOSPI",
    "sector": "전력"
  },
  "000100": {
    "symbol": "000100",
    "name": "유한양행",
    "market": "KOSPI",
    "sector": "제약"
  },
  "128940": {
    "symbol": "128940",
    "name": "한미약품",
    "market": "KOSPI",
    "sector": "제약"
  },
  "087010": {
    "symbol": "087010",
    "name": "펩트론",
    "market": "KOSDAQ",
    "sector": "바이오"
  },
  "397030": {
    "symbol": "397030",
    "name": "에이프릴바이오",
    "market": "KOSDAQ",
    "sector": "바이오"
  },
  "389470": {
    "symbol": "389470",
    "name": "인벤티지랩",
    "market": "KOSDAQ",
    "sector": "바이오"
  },
  "277810": {
    "symbol": "277810",
    "name": "레인보우로보틱스",
    "market": "KOSPI",
    "sector": "로봇"
  },
  "454910": {
    "symbol": "454910",
    "name": "두산로보틱스",
    "market": "KOSDAQ",
    "sector": "로봇"
  },
  "348340": {
    "symbol": "348340",
    "name": "뉴로메카",
    "market": "KOSDAQ",
    "sector": "로봇"
  },
  "317830": {
    "symbol": "317830",
    "name": "에스피시스템스",
    "market": "KOSDAQ",
    "sector": "로봇"
  },
  "009150": {
    "symbol": "009150",
    "name": "삼성전기",
    "market": "KOSPI",
    "sector": "소재"
  },
  "011790": {
    "symbol": "011790",
    "name": "SKC",
    "market": "KOSPI",
    "sector": "소재"
  },
  "222420": {
    "symbol": "222420",
    "name": "쎄노텍",
    "market": "KOSDAQ",
    "sector": "소재"
  },
  "005940": {
    "symbol": "005940",
    "name": "NH투자증권",
    "market": "KOSPI",
    "sector": "증권"
  },
  "016360": {
    "symbol": "016360",
    "name": "삼성증권",
    "market": "KOSPI",
    "sector": "증권"
  },
  "000810": {
    "symbol": "000810",
    "name": "삼성화재",
    "market": "KOSPI",
    "sector": "보험"
  },
  "005830": {
    "symbol": "005830",
    "name": "DB손해보험",
    "market": "KOSPI",
    "sector": "보험"
  },
  "000060": {
    "symbol": "000060",
    "name": "메리츠화재",
    "market": "KOSPI",
    "sector": "보험"
  },
  "001450": {
    "symbol": "001450",
    "name": "현대해상",
    "market": "KOSPI",
    "sector": "보험"
  },
  "010140": {
    "symbol": "010140",
    "name": "삼성중공업",
    "market": "KOSPI",
    "sector": "조선"
  },
  "009540": {
    "symbol": "009540",
    "name": "HD한국조선해양",
    "market": "KOSPI",
    "sector": "조선"
  },
  "042660": {
    "symbol": "042660",
    "name": "한화오션",
    "market": "KOSPI",
    "sector": "조선"
  },
  "010620": {
    "symbol": "010620",
    "name": "HD현대미포",
    "market": "KOSPI",
    "sector": "조선"
  },
  "267250": {
    "symbol": "267250",
    "name": "HD현대",
    "market": "KOSPI",
    "sector": "중공업"
  },
  "011170": {
    "symbol": "011170",
    "name": "롯데케미칼",
    "market": "KOSPI",
    "sector": "에너지·화학"
  },
  "000720": {
    "symbol": "000720",
    "name": "현대건설",
    "market": "KOSPI",
    "sector": "건설"
  },
  "006360": {
    "symbol": "006360",
    "name": "GS건설",
    "market": "KOSPI",
    "sector": "건설"
  },
  "047040": {
    "symbol": "047040",
    "name": "대우건설",
    "market": "KOSPI",
    "sector": "건설"
  },
  "011200": {
    "symbol": "011200",
    "name": "HMM",
    "market": "KOSPI",
    "sector": "해운"
  },
  "028670": {
    "symbol": "028670",
    "name": "팬오션",
    "market": "KOSPI",
    "sector": "해운"
  },
  "005880": {
    "symbol": "005880",
    "name": "대한해운",
    "market": "KOSPI",
    "sector": "해운"
  },
  "044450": {
    "symbol": "044450",
    "name": "KSS해운",
    "market": "KOSPI",
    "sector": "해운"
  },
  "003280": {
    "symbol": "003280",
    "name": "흥아해운",
    "market": "KOSPI",
    "sector": "해운"
  },
  "034020": {
    "symbol": "034020",
    "name": "두산에너빌리티",
    "market": "KOSPI",
    "sector": "원전"
  },
  "052690": {
    "symbol": "052690",
    "name": "한전기술",
    "market": "KOSPI",
    "sector": "원전"
  },
  "051600": {
    "symbol": "051600",
    "name": "한전KPS",
    "market": "KOSPI",
    "sector": "원전"
  },
  "011280": {
    "symbol": "011280",
    "name": "태림포장",
    "market": "KOSPI",
    "sector": "원전"
  },
  "010950": {
    "symbol": "010950",
    "name": "S-Oil",
    "market": "KOSPI",
    "sector": "에너지·화학"
  },
  "009830": {
    "symbol": "009830",
    "name": "한화솔루션",
    "market": "KOSPI",
    "sector": "에너지·화학"
  },
  "069960": {
    "symbol": "069960",
    "name": "현대백화점",
    "market": "KOSPI",
    "sector": "유통"
  },
  "004170": {
    "symbol": "004170",
    "name": "신세계",
    "market": "KOSPI",
    "sector": "유통"
  },
  "023530": {
    "symbol": "023530",
    "name": "롯데쇼핑",
    "market": "KOSPI",
    "sector": "유통"
  },
  "008770": {
    "symbol": "008770",
    "name": "호텔신라",
    "market": "KOSPI",
    "sector": "여행·카지노"
  },
  "035760": {
    "symbol": "035760",
    "name": "CJ ENM",
    "market": "KOSDAQ",
    "sector": "콘텐츠"
  },
  "253450": {
    "symbol": "253450",
    "name": "스튜디오드래곤",
    "market": "KOSDAQ",
    "sector": "콘텐츠"
  },
  "079160": {
    "symbol": "079160",
    "name": "CJ CGV",
    "market": "KOSPI",
    "sector": "콘텐츠"
  },
  "204990": {
    "symbol": "204990",
    "name": "코썬바이오",
    "market": "KOSDAQ",
    "sector": "콘텐츠"
  },
  "003230": {
    "symbol": "003230",
    "name": "삼양식품",
    "market": "KOSPI",
    "sector": "식음료"
  },
  "004370": {
    "symbol": "004370",
    "name": "농심",
    "market": "KOSPI",
    "sector": "식음료"
  },
  "097950": {
    "symbol": "097950",
    "name": "CJ제일제당",
    "market": "KOSPI",
    "sector": "식음료"
  },
  "271560": {
    "symbol": "271560",
    "name": "오리온",
    "market": "KOSPI",
    "sector": "식음료"
  },
  "192820": {
    "symbol": "192820",
    "name": "코스맥스",
    "market": "KOSPI",
    "sector": "뷰티"
  },
  "214150": {
    "symbol": "214150",
    "name": "클래시스",
    "market": "KOSDAQ",
    "sector": "뷰티"
  },
  "290670": {
    "symbol": "290670",
    "name": "대보마그네틱",
    "market": "KOSDAQ",
    "sector": "뷰티"
  },
  "002790": {
    "symbol": "002790",
    "name": "아모레퍼시픽홀딩스",
    "market": "KOSPI",
    "sector": "뷰티"
  },
  "064550": {
    "symbol": "064550",
    "name": "바이오니아",
    "market": "KOSDAQ",
    "sector": "게임"
  },
  "293490": {
    "symbol": "293490",
    "name": "카카오게임즈",
    "market": "KOSDAQ",
    "sector": "게임"
  },
  "017670": {
    "symbol": "017670",
    "name": "SK텔레콤",
    "market": "KOSPI",
    "sector": "통신"
  },
  "030200": {
    "symbol": "030200",
    "name": "KT",
    "market": "KOSPI",
    "sector": "통신"
  },
  "032640": {
    "symbol": "032640",
    "name": "LG유플러스",
    "market": "KOSPI",
    "sector": "통신"
  },
  "010170": {
    "symbol": "010170",
    "name": "대한광통신",
    "market": "KOSDAQ",
    "sector": "광통신"
  },
  "046970": {
    "symbol": "046970",
    "name": "우리로",
    "market": "KOSDAQ",
    "sector": "광통신"
  },
  "004020": {
    "symbol": "004020",
    "name": "현대제철",
    "market": "KOSPI",
    "sector": "철강"
  },
  "010130": {
    "symbol": "010130",
    "name": "고려아연",
    "market": "KOSPI",
    "sector": "철강"
  },
  "003490": {
    "symbol": "003490",
    "name": "대한항공",
    "market": "KOSPI",
    "sector": "여행·카지노"
  },
  "039130": {
    "symbol": "039130",
    "name": "하나투어",
    "market": "KOSPI",
    "sector": "여행·카지노"
  },
  "035250": {
    "symbol": "035250",
    "name": "강원랜드",
    "market": "KOSPI",
    "sector": "여행·카지노"
  },
  "114090": {
    "symbol": "114090",
    "name": "GKL",
    "market": "KOSPI",
    "sector": "여행·카지노"
  }
};

/**
 * 티커(symbol)를 입력받아 안전하게 종목명을 반환합니다.
 * 등록되어 있지 않은 경우 티커를 그대로 반환합니다.
 */
export function getStockName(symbol: string): string {
  if (!symbol) return "";
  return STOCK_UNIVERSE[symbol]?.name || symbol;
}

/**
 * 티커(symbol)를 입력받아 전체 메타데이터를 반환합니다.
 */
export function getStockMeta(symbol: string): StockMetadata | undefined {
  return STOCK_UNIVERSE[symbol];
}
