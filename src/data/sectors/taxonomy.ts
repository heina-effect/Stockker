export interface SectorTheme {
  sectorId: string;
  name: string;
  aliases: string[];
  description: string;
  memberSymbols: string[];
  representativeSymbols: string[];
  iconKey?: string;
}

export const SECTOR_UNIVERSE: Record<string, SectorTheme> = {
  "sec-semiconductor": {
    sectorId: "sec-semiconductor",
    name: "반도체",
    aliases: ["메모리", "시스템반도체", "HBM", "IT"],
    description: "메모리, 파운드리, 팹리스 및 관련 소부장 기업을 포함하는 IT 하드웨어의 핵심 섹터",
    memberSymbols: ["005930", "000660", "042700", "039030"],
    representativeSymbols: ["005930", "000660"],
    iconKey: "cpu"
  },
  "sec-battery": {
    sectorId: "sec-battery",
    name: "2차전지",
    aliases: ["배터리", "전기차배터리", "EV"],
    description: "전기차 탑재 배터리 셀 제조 및 양극재/음극재 등 관련 소재 생산업체",
    memberSymbols: ["373220", "247540", "006400", "086520", "003670"],
    representativeSymbols: ["373220", "247540"],
    iconKey: "battery"
  },
  "sec-biotech": {
    sectorId: "sec-biotech",
    name: "바이오·제약",
    aliases: ["바이오", "제약", "신약", "CMO", "헬스케어"],
    description: "신약 개발, 바이오 시밀러, 위탁생산(CMO) 및 의료기기 관련 섹터",
    memberSymbols: ["068270", "196170", "028300"],
    representativeSymbols: ["068270", "196170"],
    iconKey: "flask"
  },
  "sec-platform": {
    sectorId: "sec-platform",
    name: "인터넷·플랫폼",
    aliases: ["IT플랫폼", "인터넷", "소프트웨어", "포털"],
    description: "국내 주요 포털, 메신저 및 IT 서비스 플랫폼 기반 소프트웨어 기업",
    memberSymbols: ["035420", "035720"],
    representativeSymbols: ["035420", "035720"],
    iconKey: "layout"
  },
  "sec-finance": {
    sectorId: "sec-finance",
    name: "금융",
    aliases: ["은행", "금융지주", "보험", "증권"],
    description: "국내 주요 금융지주, 은행 및 보험사 중심의 전통 금융 섹터",
    memberSymbols: ["105560", "055550", "086790"],
    representativeSymbols: ["105560", "055550"],
    iconKey: "landmark"
  },
  "sec-entertainment": {
    sectorId: "sec-entertainment",
    name: "엔터테인먼트",
    aliases: ["엔터", "K팝", "연예기획사", "미디어"],
    description: "글로벌 K-pop 아티스트 매니지먼트 및 콘텐츠 제작 기업",
    memberSymbols: ["352820", "122870", "041510"],
    representativeSymbols: ["352820", "122870"],
    iconKey: "music"
  },
  "sec-auto": {
    sectorId: "sec-auto",
    name: "자동차",
    aliases: ["완성차", "자동차부품", "전기차"],
    description: "내연기관 및 친환경 전기차 제조, 관련 자동차 부품 공급 기업",
    memberSymbols: ["005380", "000270"],
    representativeSymbols: ["005380", "000270"],
    iconKey: "car"
  }
};
