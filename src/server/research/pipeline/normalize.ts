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
 * 회사명의 앞 2-4자(한국어) 또는 전체(영문)를 제목·스니펫에서 검색.
 */
function isRelevantToCompany(item: SourceItem, companyName: string): boolean {
  const titleLower = item.title.toLowerCase();
  const snippetLower = (item.snippet || "").toLowerCase();
  const nameLower = companyName.toLowerCase();

  // 회사명 그대로 검색
  if (titleLower.includes(nameLower) || snippetLower.includes(nameLower)) return true;

  // 한국어 회사명은 앞 2자도 허용 (예: "삼성전자" → "삼성")
  if (nameLower.length >= 2) {
    const prefix = nameLower.slice(0, 2);
    if (titleLower.includes(prefix) || snippetLower.includes(prefix)) return true;
  }

  return false;
}

export function normalizeSources(
  rawNews: SourceItem[],
  disclosures: SourceItem[],
  options?: { companyName?: string }
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
      // 5) 회사명 관련성 필터 — provider 타입 무관하게 적용
      if (companyName && companyName.length >= 1) {
        if (!isRelevantToCompany(item, companyName)) return false;
      }
      return true;
    })
    .filter(item => {
      // 5) 제목 중복 제거
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
