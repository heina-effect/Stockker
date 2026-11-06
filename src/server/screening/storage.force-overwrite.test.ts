import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({ results: {} as Record<string, unknown> }));

// select().eq() 로 끝나는 조회와 .order().limit() 까지 가는 조회를 모두 받는 가짜 쿼리
function query(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown) => resolve(h.results[table]),
  };
  return chain;
}
vi.mock("@/lib/supabase/client", () => ({ getSupabaseAdmin: () => ({ from: query }) }));

import { getScreeningSavedInfo, logForceOverwrite } from "./storage";

describe("첫 저장 보호 저장소", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "stockker-force-"));
    vi.spyOn(os, "homedir").mockReturnValue(home);
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("그날 항목이 있으면 건수와 저장 시각을 준다", async () => {
    h.results.overnight_screening_items = { data: [{ created_at: "2026-11-05T06:40:18Z" }], error: null, count: 8 };
    await expect(getScreeningSavedInfo("20261105")).resolves.toEqual({ itemCount: 8, savedAt: "2026-11-05T06:40:18Z" });
  });

  it("그날 항목이 없으면 null 이다", async () => {
    h.results.overnight_screening_items = { data: [], error: null, count: 0 };
    await expect(getScreeningSavedInfo("20261105")).resolves.toBeNull();
  });

  it("조회가 실패하면 저장 없음으로 넘기지 않고 던진다", async () => {
    h.results.overnight_screening_items = { data: null, error: new Error("db down"), count: null };
    await expect(getScreeningSavedInfo("20261105")).rejects.toThrow("db down");
  });

  it("덮어쓰기 전 항목과 궤적 그룹, 삭제될 그룹을 파일에 남긴다", async () => {
    h.results.overnight_screening_items = {
      data: [{ symbol: "000001", classification: "exclude", created_at: "t" }],
      error: null,
    };
    h.results.stock_trajectory = { data: [{ symbol: "000001" }, { symbol: "000002" }], error: null };
    await logForceOverwrite("20261105", ["000001"]);
    const dir = path.join(home, "stockker-logs");
    const [file] = fs.readdirSync(dir);
    const log = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    expect(file).toMatch(/^force-overwrite-20261105-/);
    expect(log.trajectoryGroups).toEqual(["000001", "000002"]);
    expect(log.trajectoryGroupsToDelete).toEqual(["000002"]);
    expect(log.itemRows).toHaveLength(1);
    expect(log.trajectoryRows).toHaveLength(2);
  });

  it("궤적을 읽지 못하면 던져서 기록 없는 덮어쓰기를 막는다", async () => {
    h.results.overnight_screening_items = { data: [], error: null };
    h.results.stock_trajectory = { data: null, error: new Error("db down") };
    await expect(logForceOverwrite("20261105", [])).rejects.toThrow("db down");
  });
});
