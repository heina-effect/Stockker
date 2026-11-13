import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// 화면 진입은 저장분(/latest)만 읽고, 실시간 조회는 버튼으로만 나간다(2026-11-05).
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/home/dashboard-header", () => ({ DashboardHeader: () => null }));

import OvernightScreeningPage from "./page";
import { OvernightScreeningCard } from "@/components/home/overnight-screening-card";

const LATEST = "/api/screening/overnight/latest";
const MARKET = "/api/screening/overnight/market-state";
const FRESH = "/api/screening/overnight?fresh=1";

const stock = (name: string, classification = "normal") => ({ symbol: "000001", name, price: 10000, classification, reasons: ["사유"] });
const saved = (over: object = {}) => ({
  ok: true,
  source: "saved",
  empty: false,
  tradeDate: "20261105",
  savedAt: "2026-11-05T06:41:18.000Z",
  isToday: true,
  today: "20261105",
  results: { normal: [stock("저장종목")], aggressive: [], exclude: [] },
  excludedNotice: [],
  disclaimer: "면책",
  ...over,
});
const market = { ok: true, kosdaqState: { value: 700.5, maState: null }, kospiState: { value: 2500.5, maState: null }, fetchedAt: "2026-11-05T09:10:00.000Z" };
const live = {
  ok: true,
  persisted: false,
  persistSkippedReason: "view_only",
  kosdaqState: { value: 701.5, maState: null },
  kospiState: { value: 2501.5, maState: null },
  results: { normal: [{ ...stock("실시간종목"), changeRate: 3.2 }], aggressive: [], exclude: [] },
  excludedNotice: [],
  generatedAt: "2026-11-05T09:11:00.000Z",
  dataSource: "fresh",
  dataFetchedAt: "2026-11-05T09:11:01.000Z",
  priceWarning: null,
  disclaimer: "면책",
};

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

function mockApi(routes: Record<string, ReturnType<typeof json>>) {
  const fetchMock = vi.fn(async (url: string) => routes[url] ?? json(200, { ok: false }));
  global.fetch = fetchMock as any;
  return () => fetchMock.mock.calls.map((c) => c[0]);
}

const isExecutionPath = (url: string) => url.split("?")[0] === "/api/screening/overnight";

describe("저장분 열람", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("/overnight 진입은 /latest 를 부르고 실행 경로를 부르지 않는다", async () => {
    const calls = mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market) });
    render(<OvernightScreeningPage />);
    expect(await screen.findByText("저장종목")).toBeTruthy();
    await screen.findByText("700.50");
    expect(calls()).toContain(LATEST);
    expect(calls().filter(isExecutionPath)).toEqual([]);
  });

  it("홈 카드도 /latest 를 부르고 실행 경로를 부르지 않으며 버튼이 없다", async () => {
    const calls = mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market) });
    render(<OvernightScreeningCard />);
    expect(await screen.findByText(/11월 5일 15:41 선별 결과/)).toBeTruthy();
    await screen.findByText(/코스닥 700\.50/);
    expect(calls()).toContain(LATEST);
    expect(calls().filter(isExecutionPath)).toEqual([]);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("버튼은 ?fresh=1 을 부르고 결과가 실시간 값으로 바뀐다", async () => {
    const calls = mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market), [FRESH]: json(200, live) });
    render(<OvernightScreeningPage />);
    fireEvent.click(await screen.findByRole("button", { name: "새로 조회" }));
    expect(await screen.findByText("실시간종목")).toBeTruthy();
    expect(calls().filter(isExecutionPath)).toEqual([FRESH]);
    expect(screen.getByText("지금 조회한 선별 결과")).toBeTruthy();
    expect(screen.getByText("701.50")).toBeTruthy();
    expect(screen.queryByText(/시점이 다릅니다/)).toBeNull();
    // 새로 조회 값은 저장되지 않아 다시 들어오면 저장분으로 돌아간다 — 그 사실을 시점 표시에 적는다
    expect(screen.getByText("18:11 새로 조회 (저장 안 됨 · 페이지를 떠나면 사라집니다)")).toBeTruthy();
  });

  it("버튼이 실패하면 저장분을 그대로 보이고 알린다", async () => {
    mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market), [FRESH]: json(503, { ok: false }) });
    render(<OvernightScreeningPage />);
    fireEvent.click(await screen.findByRole("button", { name: "새로 조회" }));
    expect((await screen.findByRole("alert")).textContent).toContain("저장된 결과를 그대로 표시합니다");
    expect(screen.getByText("저장종목")).toBeTruthy();
  });

  it("지수 조회가 실패해도 선별 결과는 그대로 보인다", async () => {
    mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(503, { ok: false }) });
    render(<OvernightScreeningPage />);
    expect(await screen.findByText("지수를 받지 못했습니다")).toBeTruthy();
    expect(screen.getByText("저장종목")).toBeTruthy();
    expect(screen.getByText("11월 5일 15:41 선별 결과")).toBeTruthy();
  });

  it("홈 카드도 지수 실패와 무관하게 종목 수를 보인다", async () => {
    mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(503, { ok: false }) });
    render(<OvernightScreeningCard />);
    expect(await screen.findByText("지수를 받지 못했습니다")).toBeTruthy();
    expect(screen.getByText("정석 오버나이트 통과")).toBeTruthy();
  });

  it("두 영역의 시점을 따로 적는다", async () => {
    mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market) });
    render(<OvernightScreeningPage />);
    expect(await screen.findByText("11월 5일 15:41 선별 결과")).toBeTruthy();
    expect(await screen.findByText("18:10 조회 · 아래 선별 결과는 15:41 저장분이라 시점이 다릅니다")).toBeTruthy();
  });

  it("오늘 결과가 아니면 맨 위에 알린다", async () => {
    mockApi({ [LATEST]: json(200, saved({ tradeDate: "20261104", savedAt: "2026-11-04T06:40:18.000Z", isToday: false })), [MARKET]: json(200, market) });
    render(<OvernightScreeningPage />);
    expect((await screen.findByRole("note")).textContent).toContain("오늘 결과가 아닙니다 — 11월 4일 저장분입니다");
    expect(screen.getByText("오늘 아님")).toBeTruthy();
  });

  it("오늘 결과면 알림 없이 오늘로 표시한다", async () => {
    mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market) });
    render(<OvernightScreeningPage />);
    expect(await screen.findByText("오늘")).toBeTruthy();
    expect(screen.queryByRole("note")).toBeNull();
  });

  // 정석·공격형은 2026-11-13 윗꼬리 게이트 제거 전까지 82일간 0건이라 지표 카드가 그려진 적이 없다
  describe("정석·공격형 카드", () => {
    const withMetrics = (symbol: string, name: string, classification: string, tailRatio: number) => ({
      symbol, name, price: 10000, changeRate: 5, classification,
      reasons: ["주봉·일봉 정배열 충족", `윗꼬리 ${tailRatio.toFixed(1)}% (참고값, 판정 미사용)`],
      metrics: { volumeRatio: 250, tailRatio, freshnessCount: classification === "normal" ? 4 : 0, rsi14: 58, quantSignal: false },
    });
    const filled = saved({
      results: {
        normal: [withMetrics("000001", "정석종목", "normal", 9.4)],
        aggressive: [withMetrics("000002", "공격형종목", "aggressive", 12.6), withMetrics("000003", "공격형둘", "aggressive", 1.2)],
        exclude: [],
      },
    });

    it("정석 탭에 지표·사유·상세 링크를 그린다", async () => {
      mockApi({ [LATEST]: json(200, filled), [MARKET]: json(200, market) });
      render(<OvernightScreeningPage />);
      expect(await screen.findByText("정석종목")).toBeTruthy();
      expect(screen.getByText("정석 통과")).toBeTruthy();
      expect(screen.getByText("9.4%")).toBeTruthy();
      expect(screen.getByText("4/4 개")).toBeTruthy();
      expect(screen.getByText("통과 및 검증 근거")).toBeTruthy();
      expect(screen.getByText("윗꼬리 9.4% (참고값, 판정 미사용)")).toBeTruthy();
      // 상세는 종목명 링크로 간다. 같은 곳으로 가던 "상세분석 ➔" 링크는 지웠다(2026-11-13)
      expect(screen.getByRole("link", { name: "정석종목" }).getAttribute("href")).toBe("/stocks/000001");
      expect(screen.queryByText("상세분석 ➔")).toBeNull();
    });

    it("윗꼬리 값에 통과·미달 색을 입히지 않는다", async () => {
      mockApi({ [LATEST]: json(200, filled), [MARKET]: json(200, market) });
      render(<OvernightScreeningPage />);
      const tail = await screen.findByText("9.4%");
      expect(tail.className).not.toMatch(/rose|emerald/);
    });

    it("공격형 탭으로 바꾸면 공격형 카드를 그린다", async () => {
      mockApi({ [LATEST]: json(200, filled), [MARKET]: json(200, market) });
      render(<OvernightScreeningPage />);
      fireEvent.click(await screen.findByRole("button", { name: /공격형 추세 지속/ }));
      expect(await screen.findByText("공격형종목")).toBeTruthy();
      expect(screen.getByText("공격형둘")).toBeTruthy();
      expect(screen.getAllByText("공격형 추세")).toHaveLength(2);
      expect(screen.queryByText("정석종목")).toBeNull();
    });

    it("거시 불안정·신선도 0 공격형 카드에 정배열 충족과 분류 사유 줄을 따로 그린다", async () => {
      const agg = {
        ...withMetrics("000004", "불안정공격형", "aggressive", 3.0),
        reasons: ["거시 지표 불안정", "주봉·일봉 정배열 충족", "거래량 260%", "윗꼬리 3.0% (참고값, 판정 미사용)", "공격형 사유: 테마 신선도 0/3 미달"],
      };
      mockApi({ [LATEST]: json(200, saved({ results: { normal: [], aggressive: [agg], exclude: [] } })), [MARKET]: json(200, market) });
      render(<OvernightScreeningPage />);
      fireEvent.click(await screen.findByRole("button", { name: /공격형 추세 지속/ }));
      expect(await screen.findByText("주봉·일봉 정배열 충족")).toBeTruthy();
      expect(screen.getByText("거시 지표 불안정")).toBeTruthy();
      const cls = screen.getByText("공격형 사유: 테마 신선도 0/3 미달").closest("li")!;
      expect(cls.getAttribute("data-kind")).toBe("classification-reason");
      expect(cls.textContent).toContain("→");
      expect(screen.getByText("주봉·일봉 정배열 충족").closest("li")!.getAttribute("data-kind")).toBeNull();
    });

    it("홈 카드가 분류별 종목 수를 그린다", async () => {
      mockApi({ [LATEST]: json(200, filled), [MARKET]: json(200, market) });
      render(<OvernightScreeningCard />);
      expect(await screen.findByText("정석 오버나이트 통과")).toBeTruthy();
      const count = (label: string) => screen.getByText(label).closest("a")?.textContent ?? "";
      expect(count("정석 오버나이트 통과")).toContain("1");
      expect(count("공격형 추세 지속")).toContain("2");
    });
  });

  // 지수 등락 색(2026-11-13) — 상승 red-500 / 하락 blue-500 / 보합 slate-500, 전일 대비는 text-xs
  describe("지수 전일 대비", () => {
    const withChange = (kosdaq: [number, number] | null, kospi: [number, number] | null) => ({
      ...market,
      kosdaqState: { value: 700.5, maState: null, change: kosdaq?.[0] ?? null, changeRate: kosdaq?.[1] ?? null },
      kospiState: { value: 2500.5, maState: null, change: kospi?.[0] ?? null, changeRate: kospi?.[1] ?? null },
    });

    it("상승은 빨강, 하락은 파랑으로 지수와 전일 대비를 그린다", async () => {
      mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, withChange([8.25, 1.1916], [-30.5, -1.2050])) });
      render(<OvernightScreeningPage />);
      const up = await screen.findByTestId("index-change-코스닥");
      expect(up.textContent).toBe("+8.25 (+1.19%)");
      expect(up.className).toContain("text-red-500");
      expect(up.className).toContain("text-xs");
      expect(screen.getByTestId("index-value-코스닥").className).toContain("text-red-500");
      const down = screen.getByTestId("index-change-코스피");
      expect(down.textContent).toBe("−30.50 (−1.21%)");
      expect(down.className).toContain("text-blue-500");
      expect(screen.getByTestId("index-value-코스피").className).toContain("text-blue-500");
    });

    it("보합은 회색 0.00 (0.00%)", async () => {
      mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, withChange([0, 0], [0.001, 0.00004])) });
      render(<OvernightScreeningPage />);
      const flat = await screen.findByTestId("index-change-코스닥");
      expect(flat.textContent).toBe("0.00 (0.00%)");
      expect(flat.className).toContain("text-slate-500");
      expect(screen.getByTestId("index-value-코스닥").className).toContain("text-slate-500");
      expect(screen.getByTestId("index-change-코스피").textContent).toBe("0.00 (0.00%)");
    });

    it("전일 대비가 없는 응답이면 지수만 무색으로 그린다", async () => {
      mockApi({ [LATEST]: json(200, saved()), [MARKET]: json(200, market) });
      render(<OvernightScreeningPage />);
      const v = await screen.findByTestId("index-value-코스닥");
      expect(v.className).not.toMatch(/red-500|blue-500|slate-500/);
      expect(screen.queryByTestId("index-change-코스닥")).toBeNull();
    });
  });

  it("저장 결과가 없으면 빈 상태를 보이고 새로 조회는 남는다", async () => {
    mockApi({
      [LATEST]: json(200, saved({ empty: true, tradeDate: null, savedAt: null, isToday: false, results: { normal: [], aggressive: [], exclude: [] } })),
      [MARKET]: json(200, market),
    });
    render(<OvernightScreeningPage />);
    expect(await screen.findByText("저장된 선별 결과 없음")).toBeTruthy();
    expect(screen.getByText("저장된 선별 결과가 없습니다.")).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("button", { name: "새로 조회" })).toBeTruthy());
    expect(screen.queryByRole("note")).toBeNull();
  });
});
