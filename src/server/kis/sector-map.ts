/**
 * KIS 업종구분코드(bstp_cls_code) → Stockker sec-* 섹터ID 매핑
 *
 * 출처: idxcode.mst (KIS OpenAPI 마스터 파일, 2025-03-20 기준)
 * KOSPI: div=0, KOSDAQ: div=1
 *
 * KIS 업종분류는 전통 산업 기준이라 우리 테마 섹터(2차전지, AI인프라 등)와
 * 1:1 대응이 안 되는 경우가 있음 — 가장 근접한 섹터로 매핑.
 */
export const KIS_SECTOR_MAP: Record<string, string | null> = {
  // ── KOSPI ──────────────────────────────────────────────────
  "0005": null,                // 음식료·담배 (canonical 섹터 없음)
  "0008": "sec-battery",       // 화학 (2차전지 소재 일부 포함)
  "0009": "sec-obesity-bio",   // 제약
  "0012": "sec-defense",       // 기계·장비 (방산 종목 해당)
  "0013": "sec-semiconductor", // 전기·전자
  "0014": "sec-biotech",       // 의료·정밀기기
  "0015": "sec-auto",          // 운송장비·부품
  "0018": null,                // 건설 (canonical 섹터 없음)
  "0021": "sec-banking",       // 금융
  "0024": "sec-securities",    // 증권
  "0025": "sec-insurance",     // 보험
  "0026": null,                // 일반서비스는 Stockker canonical fallback 금지
  "0029": "sec-platform",      // IT 서비스
  "0030": "sec-entertainment", // 오락·문화

  // ── KOSDAQ ─────────────────────────────────────────────────
  "1006": null,                // 일반서비스는 Stockker canonical fallback 금지
  "1009": "sec-advanced-materials", // 제조
  "1023": "sec-battery",       // 화학
  "1024": "sec-obesity-bio",   // 제약
  "1027": "sec-defense",       // 기계·장비
  "1028": "sec-semiconductor", // 전기·전자
  "1029": "sec-biotech",       // 의료·정밀기기
  "1030": "sec-auto",          // 운송장비·부품
  "1032": "sec-platform",      // 통신
  "1033": "sec-platform",      // IT 서비스
  "1015": "sec-entertainment", // 오락·문화
  "1014": "sec-banking",       // 금융
};

/**
 * KIS 업종명(bstp_kor_isnm)으로도 매핑 — 코드 없이 이름만 있을 때 fallback
 */
export const KIS_SECTOR_NAME_MAP: Record<string, string | null> = {
  "전기·전자":     "sec-semiconductor",
  "제약":          "sec-obesity-bio",
  "의료·정밀기기": "sec-biotech",
  "기계·장비":     "sec-defense",
  "운송장비·부품": "sec-auto",
  "금융":          "sec-banking",
  "증권":          "sec-securities",
  "보험":          "sec-insurance",
  "IT 서비스":     "sec-platform",
  "오락·문화":     "sec-entertainment",
  "화학":          "sec-battery",
  "일반서비스":    null,
};

export function resolveKisSectorId(
  code?: string,
  name?: string
): string | null {
  if (code && KIS_SECTOR_MAP[code]) return KIS_SECTOR_MAP[code];
  if (name && KIS_SECTOR_NAME_MAP[name]) return KIS_SECTOR_NAME_MAP[name];
  return null;
}
