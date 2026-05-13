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
    "sector": "금융"
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
    "sector": "금융"
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
    "sector": "금융"
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
    "sector": "금융"
  },
  "012450": {
    "symbol": "012450",
    "name": "한화에어로스페이스",
    "market": "KOSPI",
    "sector": "방산"
  },
  "073120": {
    "symbol": "073120",
    "name": "LIG넥스원",
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
  "419080": {
    "symbol": "419080",
    "name": "펩트론",
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
  "054060": {
    "symbol": "054060",
    "name": "뉴로메카",
    "market": "KOSDAQ",
    "sector": "로봇"
  },
  "009150": {
    "symbol": "009150",
    "name": "삼성전기",
    "market": "KOSPI",
    "sector": "소재"
  },
  "033640": {
    "symbol": "033640",
    "name": "SKC",
    "market": "KOSPI",
    "sector": "소재"
  },
  "222420": {
    "symbol": "222420",
    "name": "이오테크닉스",
    "market": "KOSDAQ",
    "sector": "장비"
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
