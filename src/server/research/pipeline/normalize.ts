import { SourceItem } from "@/types/research";

const MAX_AGE_DAYS = 30;

// Korean characters (Hangul syllables + Jamo + Compatibility Jamo)
const HANGUL_RE = /[가-힣ᄀ-ᇿ㄰-㆏]/;
// Scripts that should never appear in Korean market news
const ARABIC_RE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const DEVANAGARI_RE = /[ऀ-ॿঀ-৿]/;
// Short purely-Latin ticker/name (e.g. "HLB", "SK") — collision-prone in global news
const SHORT_LATIN_RE = /^[A-Za-z]{2,6}$/;

/**
 * 스크립트 필터: 아랍어·힌디 문자가 포함된 제목은 무조건 제외.
 * 짧은 영문 전용 회사명(예: "HLB")일 때 제목에 한글이 없으면 해외 동명 기업 기사로 간주해 제외.
 */
function isAcceptableTitle(title: string, companyName: string): boolean {
  if (ARABIC_RE.test(title) || DEVANAGARI_RE.test(title)) return false;
  if (SHORT_LATIN_RE.test(companyName) && !HANGUL_RE.test(title)) return false;
  return true;
}

/**
 * 회사명으로 소스 관련성을 판단한다.
 *
 * 개선 (Phase 29):
 * - 한국어 4자 이상 회사명은 3자 prefix 매칭 (2자였을 때 에이프릴바이오/에이비엘 혼동 발생)
 * - 2-3자 회사명은 2자 prefix 허용 (기존 유지)
 * - Disclosure(공시)는 회사명 완전 포함 필수 — 공시 제목이 짧아 오탐 多
 */
function isRelevantToCompany(item: SourceItem, companyName: string, companyAliases: string[] = []): boolean {
  const titleLower = item.title.toLowerCase();
  const snippetLower = (item.snippet || "").toLowerCase();
  const nameLower = companyName.toLowerCase();
  const aliasLowers = companyAliases.map(alias => alias.toLowerCase()).filter(alias => alias.length >= 2);

  // 회사명 전체가 제목에 있으면 무조건 통과
  // 스니펫은 접선 언급(섹터 브리핑에서 회사명 한 줄 등)으로 인한 오탐이 많아 제외
  if (titleLower.includes(nameLower)) return true;
  if (aliasLowers.some(alias => titleLower.includes(alias))) return true;

  // 공시는 전체 회사명이 제목에 있어야만 통과 (prefix 허용 안 함)
  if (item.sourceType === "disclosure") return false;

  // 뉴스는 prefix 매칭 허용
  // 4자 이상 한글 이름 → 3자 prefix (에이프릴바이오 → 에이프릴, 에이비엘바이오 → 에이비엘)
  // 2-3자 → 2자 prefix
  // 단, 혼합 이름(LIG디펜스앤에어로스페이스)에서 prefix가 한글 없이 라틴만이면
  //   너무 약한 매칭 — 이미 위에서 전체 이름 확인했으므로 prefix 적용 안 함
  if (HANGUL_RE.test(nameLower)) {
    const prefixLen = nameLower.length >= 4 ? 3 : 2;
    const prefix = nameLower.slice(0, prefixLen);
    // prefix 자체에 한글이 없으면 (예: "lig") 너무 약한 매칭 — 건너뜀
    if (!HANGUL_RE.test(prefix)) return false;
    if (titleLower.includes(prefix) || snippetLower.includes(prefix)) return true;
  } else if (nameLower.length >= 2) {
    // 영문 전용 회사명: 2자 prefix
    const prefix = nameLower.slice(0, 2);
    if (titleLower.includes(prefix) || snippetLower.includes(prefix)) return true;
  }

  return false;
}

/**
 * 섹터 미스매치 가드:
 * 섹터 ID를 제공하면 해당 섹터의 memberSymbols를 기반으로
 * 소스에 다른 섹터 고유 종목만 언급된 경우 낮은 신뢰도 표시.
 * (현재는 필터링이 아닌 로그만 — 완전 차단은 오탐 우려)
 */
export function normalizeSources(
  rawNews: SourceItem[],
  disclosures: SourceItem[],
  options?: { companyName?: string; companyAliases?: string[]; sectorMemberSymbols?: string[] }
): SourceItem[] {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const companyName = options?.companyName?.trim();

  const combined = [...(rawNews || []), ...(disclosures || [])];

  const seenTitles = new Set<string>();
  return combined
    .filter(item => {
      // 1) Mock 소스 제거
      if ((item as any)._isMock) return false;
      // 2) 제목 없음 제거
      if (!item.title || item.title === "제목 없음") return false;
      // 3) 스크립트 필터 (아랍어·힌디 제거, 짧은 영문명 한글 미포함 제거)
      if (companyName && !isAcceptableTitle(item.title, companyName)) return false;
      // 4) 날짜 기반 신선도 필터 (30일 이내)
      const ts = new Date(item.generatedAt || item.collectedAt).getTime();
      if (ts < cutoff) return false;
      // 5) 회사명 관련성 필터
      if (companyName && companyName.length >= 1) {
        if (!isRelevantToCompany(item, companyName, options?.companyAliases)) return false;
      }
      return true;
    })
    .filter(item => {
      // 6) 제목 중복 제거
      const titleKey = item.title.replace(/\s+/g, "").toLowerCase();
      if (seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.generatedAt || b.collectedAt).getTime() -
        new Date(a.generatedAt || a.collectedAt).getTime()
    );
}
