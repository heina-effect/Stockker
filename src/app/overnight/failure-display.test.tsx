import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 스크리닝·홈 AI 후보가 실패했을 때 화면에 종목·지수·가격 숫자가 하나도 나오지 않아야 한다(2026-10-30).
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/home/dashboard-header", () => ({ DashboardHeader: () => null }));
const intel = vi.hoisted(() => ({ value: {} as any }));
vi.mock("@/components/home/home-intelligence-provider", () => ({ useHomeIntelligence: () => intel.value }));

import OvernightScreeningPage from "./page";
import { OvernightScreeningCard } from "@/components/home/overnight-screening-card";
import { AIPicksCard } from "@/components/home/ai-picks-card";

const FAIL = { ok: false, error: "screening_failed", reason: "no_symbols_analyzed", failedAt: "2026-10-30T02:00:00.000Z" };
const respond = (status: number, body: unknown) => {
  global.fetch = vi.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body }) as any;
};
// 렌더된 텍스트에 숫자가 0건인지 (실패 사유 코드 문자열에도 숫자는 없다)
const digitsIn = (el: HTMLElement) => (el.textContent || "").match(/\d/g) ?? [];

describe("실패 시 숫자 0건", () => {
  afterEach(() => vi.restoreAllMocks());

  it("스크리닝 화면 — '스크리닝 실패' 만 보이고 숫자 없음", async () => {
    respond(503, FAIL);
    const { container } = render(<OvernightScreeningPage />);
    expect(await screen.findByText("스크리닝 실패 — 데이터를 가져오지 못했습니다")).toBeTruthy();
    expect(digitsIn(container)).toEqual([]);
  });

  it("홈 스크리닝 카드 — 실패 문구만, 숫자 없음", async () => {
    respond(503, FAIL);
    const { container } = render(<OvernightScreeningCard />);
    expect(await screen.findByText("스크리닝 실패 — 데이터를 가져오지 못했습니다")).toBeTruthy();
    expect(digitsIn(container)).toEqual([]);
  });

  it("홈 AI 후보 — 생성 실패 + 캐시 없음이면 고정 종목·가격 없이 실패 문구", () => {
    intel.value = { data: { aiPicks: [], _meta: { mode: "fallback" } }, isLoading: false, error: null };
    const { container } = render(<AIPicksCard />);
    expect(screen.getByText(/AI 후보 생성 실패/)).toBeTruthy();
    expect(digitsIn(container)).toEqual([]);
  });
});
