import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// 헤드라인은 건수만, 수치는 접기 안에만 나온다(2026-11-06)
vi.mock("@/components/home/dashboard-header", () => ({ DashboardHeader: () => null }));

import TrackingPage from "./page";

const exitStats = (over: object = {}) => ({ n: 10, winCount: 3, lossCount: 7, winRatePct: 30, profitFactor: 0.99, expectancy: -0.04, kellyPct: -0.2, ...over });
const row = (label: string, values: number[], over: object = {}) => ({ label, total: values.length, values, stats: null, netExpectancy: null, ...over });
const quantItem = (over: object = {}) => ({
  symbol: "000001", name: "종목가", discoveryDate: "20261105", daysAfter: 1, rsi14: 55, volumeRatio: 250, entryClose: 1000, currentClose: 1010,
  group: "pending", day3ReturnPct: null, maxReturnSoFarPct: null, minReturnSoFarPct: null, exitDay3Pct: null, exitDay3NetPct: null, exitStop10Pct: null,
  peakReturnPct: null, endDate: null, endClose: null, endReturnPct: null, haltStartDaysAfter: null, isValidForStats: true, elapsedTradingDays: 1,
  observationEnded: false, haltIncomplete: false, isRecentlyActive: false, recentRecapture: null, corporateAction: null, corporateAdjustmentLabel: null,
  volumeBasis: "incl_today", judgedAt: "2026-11-05T06:40:00Z", ...over,
});
const body = {
  ok: true,
  summary: { total: 0, stopLoss: 0, hold: 0, watching: 0, corporateActionExcluded: 0 },
  stageCounts: { primary: 0, secondary: 0, ended: 0 },
  items: [],
  quantSignalItems: [quantItem()],
  quantSignalStats: {
    totalCount: 12, resultCount: 10, observingExcludedCount: 2, haltIncompleteCount: 0, corporateActionExcludedCount: 0, roundTripCostPct: 0.257,
    stopLossThresholdPct: -10, avgDay3ReturnPct: -0.04, avgMaxReturnSoFarPct: 9, exitDay3: exitStats(), exitDay3Net: exitStats(), exitStop10: exitStats(),
    exitDay3Trimmed: exitStats(), peak: exitStats(), sampleSymbolCount: 9,
  },
  quantBreakdown: {
    sensitivity: [
      row("전체", [1], { total: 12, stats: exitStats(), netExpectancy: -0.29 }),
      row("최고 1건 제외", [1], { stats: exitStats({ expectancy: -3.81 }), netExpectancy: -4.07 }),
      row("최저 1건 제외", [1], { stats: exitStats({ expectancy: 1.33 }), netExpectancy: 1.07 }),
      row("둘 다 제외", [1], { stats: exitStats({ expectancy: -2.75 }), netExpectancy: -3.01 }),
    ],
    byBasis: [row("당일 제외(excl_today)", [1, 2, 3, 4, 5], { stats: exitStats({ n: 5, expectancy: 4.91 }), netExpectancy: 4.65 }), row("당일 포함(incl_today)", [-5.35, 0.86])],
    byTime: [row("15:30 이전", [-4.98]), row("15:30~15:40", []), row("15:40~16:00", [33.95]), row("16시 이후", [])],
  },
  legacySample: {
    items: [{ symbol: "000007", name: "옛종목", discoveryDate: "20260703", exitDay3Pct: 5.5 }],
    stats: exitStats({ n: 42, winCount: 17, lossCount: 25, winRatePct: 40.5, profitFactor: 0.94, expectancy: -0.26 }),
    netExpectancy: -0.52,
  },
};

const open = async (label: RegExp) => fireEvent.click(await screen.findByRole("button", { name: label }));

describe("퀀트 신호 트래커 헤드라인", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => body })) as any;
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("건수만 쓰고 승률·손익비·Kelly 는 없다", async () => {
    render(<TrackingPage />);
    expect(await screen.findByText(/퀀트 신호 트래커 12건/)).toBeTruthy();
    expect(screen.getByText(/결과 10건 · 대기 2건/)).toBeTruthy();
    expect(screen.getByText(/발굴일 15:40 판정 기록 기준/)).toBeTruthy();
    const section = screen.getByText(/퀀트 신호 트래커 12건/).closest("section") as HTMLElement;
    expect(section.textContent).not.toMatch(/승률|손익비|Kelly|평균 최고/);
  });

  it("숫자를 쓰지 않는 이유를 응답 값으로 적는다", async () => {
    render(<TrackingPage />);
    expect(await screen.findByText("결과 10건으로는 한 건에 크게 흔들립니다(최고 1건 제외 -3.81%, 최저 1건 제외 +1.33%). 건수만 표시합니다")).toBeTruthy();
  });

  it("분해표는 접혀 있고 펼치면 나온다", async () => {
    render(<TrackingPage />);
    await screen.findByText(/결과 10건 · 대기 2건/);
    expect(screen.queryByText("둘 다 제외")).toBeNull();
    await open(/통계 근거 보기/);
    expect(screen.getByText("둘 다 제외")).toBeTruthy();
    expect(screen.getByText("-2.75%")).toBeTruthy();
    expect(screen.getByText("당일 제외(excl_today)")).toBeTruthy();
    expect(screen.getByText("15:30~15:40")).toBeTruthy();
  });

  it("결과 5건 미만 구간은 통계 불가로 나오고 개별 수익률만 있다", async () => {
    render(<TrackingPage />);
    await open(/통계 근거 보기/);
    const line = screen.getByText("당일 포함(incl_today)").closest("tr") as HTMLElement;
    expect(within(line).getByText("통계 불가 — -5.35%, +0.86%")).toBeTruthy();
    const empty = screen.getByText("16시 이후").closest("tr") as HTMLElement;
    expect(within(empty).getByText("통계 불가")).toBeTruthy();
  });

  it("재구성 표본은 접혀 있고 수치가 그 안에만 있다", async () => {
    render(<TrackingPage />);
    await screen.findByText(/결과 10건 · 대기 2건/);
    expect(document.body.textContent).not.toContain("40.5%");
    await open(/통계 근거 보기/);
    expect(document.body.textContent).not.toContain("40.5%");
    await open(/재구성 표본 1건 보기/);
    expect(screen.getByText(/결과 42건 · 17승 25패 · 승률 40.5% · 손익비 0.94 · 기대값 -0.26% · 비용 후 -0.52%/)).toBeTruthy();
    expect(screen.getByText(/조건을 검증하는 표본으로 쓸 수 없습니다/)).toBeTruthy();
    expect(screen.getByText("옛종목")).toBeTruthy();
  });
});
