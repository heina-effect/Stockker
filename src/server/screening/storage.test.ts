import { describe, it, expect } from "vitest";
import { saveScreeningResult, getScreeningResult, deleteScreeningResult, type ScreeningResultRecord } from "./storage";

describe("Supabase Screening Storage Integration Test", () => {
  it("saves, retrieves, and deletes screening results via Supabase with fallback", async () => {
    const testDate = "20269999"; // 테스트 전용 임의 날짜

    const testRecord: ScreeningResultRecord = {
      date: testDate,
      reduceWeight: true,
      kosdaqValue: 888.88,
      items: [
        {
          symbol: "005930",
          name: "삼성전자",
          classification: "normal",
          entryClose: 310000,
          reasons: ["테스트 사유 1", "테스트 사유 2"],
        },
        {
          symbol: "000660",
          name: "SK하이닉스",
          classification: "exclude",
          entryClose: 2400000,
          reasons: ["제외 테스트 사유"],
        }
      ]
    };

    // 1. 저장 테스트 (네트워크 차단 환경에서는 로컬 캐시/파일로 폴백하여 조용히 성공해야 함)
    await saveScreeningResult(testRecord);
    
    // 2. 조회 테스트 (Supabase 조회 실패 시 폴백으로 임시 파일을 조회해 오는지 검증)
    const retrieved = await getScreeningResult(testDate);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.date).toBe(testDate);
    expect(retrieved?.reduceWeight).toBe(true);
    expect(retrieved?.kosdaqValue).toBe(888.88);
    expect(retrieved?.items.length).toBe(2);
    
    const samsung = retrieved?.items.find(i => i.symbol === "005930");
    expect(samsung).toBeDefined();
    expect(samsung?.name).toBe("삼성전자");
    expect(samsung?.entryClose).toBe(310000);
    expect(samsung?.reasons).toContain("테스트 사유 1");

    // 3. 삭제 테스트
    await deleteScreeningResult(testDate);
    
    // 4. 삭제 후 재조회 시 null 반환 확인
    const retrievedAfterDelete = await getScreeningResult(testDate);
    expect(retrievedAfterDelete).toBeNull();
  }, 15000); // 15초 타임아웃
});
