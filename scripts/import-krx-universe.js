import fs from 'fs';
import path from 'path';

const universe = {
  "005930": { symbol: "005930", name: "삼성전자", market: "KOSPI", sector: "IT" },
  "000660": { symbol: "000660", name: "SK하이닉스", market: "KOSPI", sector: "IT" },
  "035420": { symbol: "035420", name: "NAVER", market: "KOSPI", sector: "IT" },
  "035720": { symbol: "035720", name: "카카오", market: "KOSPI", sector: "IT" },
  "005380": { symbol: "005380", name: "현대차", market: "KOSPI", sector: "자동차" },
  "000270": { symbol: "000270", name: "기아", market: "KOSPI", sector: "자동차" },
  "042700": { symbol: "042700", name: "한미반도체", market: "KOSPI", sector: "IT" },
  "039030": { symbol: "039030", name: "이오테크닉스", market: "KOSDAQ", sector: "IT" },
  "068270": { symbol: "068270", name: "셀트리온", market: "KOSPI", sector: "바이오" },
  "028300": { symbol: "028300", name: "HLB", market: "KOSDAQ", sector: "바이오" },
  "0001": { symbol: "0001", name: "KOSPI", market: "INDEX" },
  "1001": { symbol: "1001", name: "KOSDAQ", market: "INDEX" },
  // 1. 주요 금융/지주
  "055550": { symbol: "055550", name: "신한지주", market: "KOSPI", sector: "금융" },
  "105560": { symbol: "105560", name: "KB금융", market: "KOSPI", sector: "금융" },
  "086790": { symbol: "086790", name: "하나금융지주", market: "KOSPI", sector: "금융" },
  // 2. 주요 2차전지/화학
  "373220": { symbol: "373220", name: "LG에너지솔루션", market: "KOSPI", sector: "화학" },
  "051910": { symbol: "051910", name: "LG화학", market: "KOSPI", sector: "화학" },
  "006400": { symbol: "006400", name: "삼성SDI", market: "KOSPI", sector: "화학" },
  "096770": { symbol: "096770", name: "SK이노베이션", market: "KOSPI", sector: "화학" },
  "003670": { symbol: "003670", name: "포스코퓨처엠", market: "KOSPI", sector: "화학" },
  // 3. 주요 철강/중공업
  "005490": { symbol: "005490", name: "POSCO홀딩스", market: "KOSPI", sector: "철강" },
  // 4. 주요 대표 ETF
  "069500": { symbol: "069500", name: "KODEX 200", market: "ETF", sector: "시장대표" },
  "122630": { symbol: "122630", name: "KODEX 레버리지", market: "ETF", sector: "시장대표" },
  "114800": { symbol: "114800", name: "KODEX 인버스", market: "ETF", sector: "시장대표" },
  "252670": { symbol: "252670", name: "KODEX 200선물인버스2X", market: "ETF", sector: "시장대표" },
  "133690": { symbol: "133690", name: "TIGER 미국나스닥100", market: "ETF", sector: "해외주식" },
  "360750": { symbol: "360750", name: "TIGER 미국S&P500", market: "ETF", sector: "해외주식" },
  "305080": { symbol: "305080", name: "TIGER 미국배당다우존스", market: "ETF", sector: "해외주식" },
  "305540": { symbol: "305540", name: "KINDEX 미국나스닥100", market: "ETF", sector: "해외주식" },
  // 5. 기타 코스닥/테마
  "041510": { symbol: "041510", name: "에스엠", market: "KOSDAQ", sector: "엔터" },
  "122870": { symbol: "122870", name: "와이지엔터테인먼트", market: "KOSDAQ", sector: "엔터" },
  "352820": { symbol: "352820", name: "하이브", market: "KOSPI", sector: "엔터" },
  "247540": { symbol: "247540", name: "에코프로비엠", market: "KOSDAQ", sector: "2차전지" },
  "086520": { symbol: "086520", name: "에코프로", market: "KOSDAQ", sector: "2차전지" },
  "196170": { symbol: "196170", name: "알테오젠", market: "KOSDAQ", sector: "바이오" },
  "259960": { symbol: "259960", name: "크래프톤", market: "KOSPI", sector: "게임" },
  "036570": { symbol: "036570", name: "엔씨소프트", market: "KOSPI", sector: "게임" }
};

const fileData = `export interface StockMetadata {
  symbol: string;
  name: string;
  market: "KOSPI" | "KOSDAQ" | "INDEX" | "ETF";
  sector?: string;
}

export const STOCK_UNIVERSE: Record<string, StockMetadata> = ${JSON.stringify(universe, null, 2)};

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
`;

fs.writeFileSync(path.join(process.cwd(), 'src/lib/stocks/metadata.ts'), fileData);
