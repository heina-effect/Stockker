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
    memberSymbols: ["068270", "196170", "028300", "397030"],
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
  },
  "sec-defense": {
    sectorId: "sec-defense",
    name: "우주항공·방산",
    aliases: ["방산", "K-방산", "전투기", "미사일", "위성", "항공우주", "A&D"],
    description: "글로벌 지정학적 리스크와 국방 현대화 수요에 따른 대규모 수출 모멘텀 섹터",
    memberSymbols: ["012450", "079550", "272210", "064350"],
    representativeSymbols: ["012450", "079550"],
    iconKey: "shield"
  },
  "sec-ai-infra": {
    sectorId: "sec-ai-infra",
    name: "AI 인프라·전력",
    aliases: ["전력", "변압기", "전력설비", "구리", "데이터센터", "SMR"],
    description: "AI 연산 수요 폭증으로 인한 데이터센터 증설 및 노후 전력망 교체 수혜 섹터",
    memberSymbols: ["267260", "010120", "006260", "042700"],
    representativeSymbols: ["267260", "010120"],
    iconKey: "zap"
  },
  "sec-obesity-bio": {
    sectorId: "sec-obesity-bio",
    name: "차세대 바이오·비만",
    aliases: ["비만치료제", "GLP-1", "플랫폼바이오", "ADC"],
    description: "글로벌 메가 트렌드인 비만 치료제 및 약물 전달 플랫폼 기술 중심의 고성장 바이오",
    memberSymbols: ["196170", "000100", "128940", "087010"],
    representativeSymbols: ["196170", "000100"],
    iconKey: "dna"
  },
  "sec-robotics": {
    sectorId: "sec-robotics",
    name: "로봇·자동화",
    aliases: ["협동로봇", "휴머노이드", "스마트팩토리", "AGV"],
    description: "인구 구조 변화와 AI 결합을 통한 산업 및 서비스 로봇 시장 확대 섹터",
    memberSymbols: ["277810", "454910", "348340"],
    representativeSymbols: ["277810", "454910"],
    iconKey: "bot"
  },
  "sec-advanced-materials": {
    sectorId: "sec-advanced-materials",
    name: "첨단 소재·기판",
    aliases: ["소재", "장비", "유리기판", "TGV", "반도체소재", "나노"],
    description: "차세대 반도체 패키징 솔루션인 유리기판 및 고부가가치 첨단 소재 관련주",
    memberSymbols: ["009150", "011790", "039030"],
    representativeSymbols: ["009150", "011790"],
    iconKey: "layers"
  },
  "sec-banking": {
    sectorId: "sec-banking",
    name: "은행",
    aliases: ["금융지주", "은행주", "금리수혜", "예대마진", "금융"],
    description: "순이자마진(NIM)과 주주환원 정책이 핵심인 대형 금융지주 및 은행 섹터",
    memberSymbols: ["105560", "055550", "086790", "316140"],
    representativeSymbols: ["105560", "055550"],
    iconKey: "landmark"
  },
  "sec-securities": {
    sectorId: "sec-securities",
    name: "증권",
    aliases: ["증권사", "IB", "브로커리지", "거래대금"],
    description: "증시 거래대금 및 투자은행(IB) 수익, 자산운용 성과에 민감한 금융 섹터",
    memberSymbols: ["006800", "039490", "005940", "016360"],
    representativeSymbols: ["006800", "039490"],
    iconKey: "line-chart"
  },
  "sec-insurance": {
    sectorId: "sec-insurance",
    name: "보험",
    aliases: ["손해보험", "생명보험", "IFRS17", "방어주"],
    description: "금리 상승기에 자산운용 수익률이 개선되는 고배당 성향의 보험 섹터",
    memberSymbols: ["000810", "005830", "000060", "001450"],
    representativeSymbols: ["000810", "005830"],
    iconKey: "shield-check"
  },
  "sec-shipbuilding": {
    sectorId: "sec-shipbuilding",
    name: "조선",
    aliases: ["배", "LNG선", "조선소", "도크"],
    description: "글로벌 물동량 및 친환경 선박 교체 수요에 따른 수주 산업 섹터",
    memberSymbols: ["010140", "009540", "042660", "010620"],
    representativeSymbols: ["010140", "009540"],
    iconKey: "ship"
  },
  "sec-heavy-machinery": {
    sectorId: "sec-heavy-machinery",
    name: "중공업",
    aliases: ["플랜트", "엔진", "기계", "가스엔진"],
    description: "대형 엔진, 에너지 설비 및 산업용 중장비를 제조하는 기계 섹터",
    memberSymbols: ["267250", "010620", "011170"],
    representativeSymbols: ["267250", "011170"],
    iconKey: "anvil"
  },
  "sec-construction": {
    sectorId: "sec-construction",
    name: "건설",
    aliases: ["건설사", "아파트", "재건축", "토목"],
    description: "국내 주택 경기 및 해외 플랜트 수주에 영향을 받는 건설·엔지니어링 섹터",
    memberSymbols: ["000720", "006360", "047040"],
    representativeSymbols: ["000720", "006360"],
    iconKey: "hard-hat"
  },
  "sec-shipping": {
    sectorId: "sec-shipping",
    name: "해운",
    aliases: ["컨테이너", "벌크선", "물류", "운임지수", "BDI"],
    description: "글로벌 해상 운임(SCFI, BDI)과 물동량에 따라 실적이 결정되는 섹터",
    memberSymbols: ["011200", "028670", "010120"],
    representativeSymbols: ["011200", "028670"],
    iconKey: "anchor"
  },
  "sec-nuclear": {
    sectorId: "sec-nuclear",
    name: "원전",
    aliases: ["원자력", "SMR", "체코원전", "에너지안보"],
    description: "탈탄소 정책과 AI 데이터센터 전력 수요로 재조명받는 원자력 발전 섹터",
    memberSymbols: ["034020", "052690", "051600", "011280"],
    representativeSymbols: ["034020", "052690"],
    iconKey: "atom"
  },
  "sec-energy": {
    sectorId: "sec-energy",
    name: "에너지·화학",
    aliases: ["정유", "석유", "태양광", "유가", "수소"],
    description: "원유 정제 및 신재생 에너지, 기초 화학 소재를 다루는 섹터",
    memberSymbols: ["096770", "010950", "009830", "051910"],
    representativeSymbols: ["010950", "009830"],
    iconKey: "fuel"
  },
  "sec-retail": {
    sectorId: "sec-retail",
    name: "백화점·유통",
    aliases: ["쇼핑", "마트", "면세점", "편의점"],
    description: "내수 소비 지표와 관광객 수요에 민감한 온·오프라인 유통 섹터",
    memberSymbols: ["069960", "004170", "023530", "008770"],
    representativeSymbols: ["069960", "004170"],
    iconKey: "shopping-bag"
  },
  "sec-content": {
    sectorId: "sec-content",
    name: "영화·콘텐츠",
    aliases: ["미디어", "OTT", "드라마", "영화관", "K-콘텐츠"],
    description: "영상 제작, 배급 및 OTT 플랫폼 향 IP 파워를 보유한 미디어 섹터",
    memberSymbols: ["035760", "253450", "079160", "204990"],
    representativeSymbols: ["035760", "253450"],
    iconKey: "clapperboard"
  },
  "sec-food": {
    sectorId: "sec-food",
    name: "식음료",
    aliases: ["K푸드", "라면", "음식료", "필수소비재"],
    description: "글로벌 수출 확대와 원자재 가격 하락 수혜를 받는 음식료 및 가공식품 섹터",
    memberSymbols: ["003230", "004370", "097950", "271560"],
    representativeSymbols: ["003230", "004370"],
    iconKey: "utensils"
  },
  "sec-beauty": {
    sectorId: "sec-beauty",
    name: "뷰티·의료기기",
    aliases: ["화장품", "미용기기", "올리브영", "피부관리"],
    description: "글로벌 K-뷰티 확산과 고성장 중인 미용 의료기기(레이저, 리프팅) 섹터",
    memberSymbols: ["192820", "214150", "290670", "002790"],
    representativeSymbols: ["214150", "290670"],
    iconKey: "sparkles"
  },
  "sec-gaming": {
    sectorId: "sec-gaming",
    name: "게임",
    aliases: ["게임주", "e스포츠", "PC게임", "모바일게임"],
    description: "신작 출시 모멘텀과 글로벌 플랫폼(스팀 등) 성과에 민감한 소프트웨어 섹터",
    memberSymbols: ["259960", "036570", "064550", "293490"],
    representativeSymbols: ["259960", "036570"],
    iconKey: "gamepad-2"
  },
  "sec-telecom": {
    sectorId: "sec-telecom",
    name: "통신",
    aliases: ["통신사", "5G", "6G", "배당주"],
    description: "안정적인 현금 흐름과 높은 배당 수익률을 제공하는 대표적 방어 섹터",
    memberSymbols: ["017670", "030200", "032640"],
    representativeSymbols: ["017670", "030200"],
    iconKey: "signal"
  },
  "sec-steel": {
    sectorId: "sec-steel",
    name: "철강·금속",
    aliases: ["철강", "금속", "구리", "비철금속"],
    description: "글로벌 경기 회복 및 원자재 가격 변동에 민감하게 반응하는 기초 소재 섹터",
    memberSymbols: ["005490", "004020", "010130"],
    representativeSymbols: ["005490", "010130"],
    iconKey: "mountain"
  },
  "sec-travel": {
    sectorId: "sec-travel",
    name: "여행·카지노",
    aliases: ["항공", "카지노", "면세점", "호텔"],
    description: "여행 수요 및 외국인 입국객 수 지표에 따라 주가가 움직이는 서비스 섹터",
    memberSymbols: ["003490", "039130", "035250", "114090"],
    representativeSymbols: ["003490", "039130"],
    iconKey: "plane"
  }
};

export type SectorId = keyof typeof SECTOR_UNIVERSE;

function normalizeSectorLookup(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "").replace(/[·ㆍ.]/g, "");
}

export function isSectorId(value: string | undefined | null): value is SectorId {
  return Boolean(value && Object.prototype.hasOwnProperty.call(SECTOR_UNIVERSE, value));
}

export function getSectorById(value: string | undefined | null): SectorTheme | null {
  if (!isSectorId(value)) return null;
  return SECTOR_UNIVERSE[value];
}

export function resolveSectorId(value: string | undefined | null): SectorId | null {
  if (!value) return null;
  if (isSectorId(value)) return value;

  const normalized = normalizeSectorLookup(value);
  for (const [sectorId, sector] of Object.entries(SECTOR_UNIVERSE)) {
    const candidates = [sector.name, sector.sectorId, ...sector.aliases].map(normalizeSectorLookup);
    if (candidates.includes(normalized)) return sectorId as SectorId;
  }

  return null;
}
