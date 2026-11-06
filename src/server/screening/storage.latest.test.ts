import { afterEach, describe, expect, it, vi } from "vitest";

// Supabase 미구성이면 보조 저장소를 날짜를 거슬러 찾는다
vi.mock("@/lib/supabase/client", () => ({ getSupabaseAdmin: () => null }));

import { deleteScreeningResult, getLatestScreeningResult, saveScreeningResult } from "./storage";

const record = (date: string) => ({ date, reduceWeight: false, kosdaqValue: 700, items: [] });

describe("getLatestScreeningResult (Supabase 미구성)", () => {
  const dates = ["20990102", "20981229"];
  afterEach(async () => {
    await Promise.all(dates.map(deleteScreeningResult));
  });

  it("달을 넘겨 가장 최근 저장일을 찾는다", async () => {
    await saveScreeningResult(record("20981229"));
    expect((await getLatestScreeningResult("20990103"))?.date).toBe("20981229");
  });

  it("기준일보다 뒤의 저장분은 읽지 않는다", async () => {
    await saveScreeningResult(record("20990102"));
    expect(await getLatestScreeningResult("20990101")).toBeNull();
  });

  it("거슬러 볼 기간에 없으면 null 이다", async () => {
    expect(await getLatestScreeningResult("20980101")).toBeNull();
  });
});
