import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/kis/rest-client", () => ({}));
vi.mock("@/lib/supabase/client", () => ({}));
vi.mock("@/server/screening/storage", () => ({}));
vi.mock("@/server/screening/indicators", () => ({}));
vi.mock("@/server/screening/entry-invariant", () => ({}));
vi.mock("@/server/screening/paginate", () => ({}));
vi.mock("@/server/screening/rate-limit-retry", () => ({}));
vi.mock("@/server/screening/trading-calendar", () => ({}));

import { compareTrajectoryTargets } from "./trajectory-update";

// 처리 순서(2026-11-03): 즐겨찾기 → 마지막 저장일이 오래된 순 → 발굴일이 오래된 순
const g = (discoveryDate: string, lastStored: string | null, favorite = false) => ({ discoveryDate, lastStored, favorite });
const order = (list: ReturnType<typeof g>[]) => [...list].sort(compareTrajectoryTargets);

describe("compareTrajectoryTargets", () => {
  it("마지막 저장일이 오래된 그룹이 먼저 온다(최신 발굴일 우선이 아니다)", () => {
    const fresh = g("20261102", "20261102");
    const lagging = g("20260920", "20261030");
    expect(order([fresh, lagging])).toEqual([lagging, fresh]);
  });

  it("마지막 저장일이 같으면 발굴일이 오래된 그룹이 먼저", () => {
    const a = g("20261001", "20261030");
    const b = g("20260925", "20261030");
    expect(order([a, b])).toEqual([b, a]);
  });

  it("저장된 행이 없는 그룹은 가장 뒤처진 것으로 본다", () => {
    const none = g("20261102", null);
    const some = g("20260920", "20261030");
    expect(order([some, none])).toEqual([none, some]);
  });

  it("즐겨찾기는 저장일과 무관하게 먼저", () => {
    const fav = g("20261102", "20261102", true);
    const lagging = g("20260920", "20261001");
    expect(order([lagging, fav])).toEqual([fav, lagging]);
  });
});
