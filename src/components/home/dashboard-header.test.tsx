import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardHeader } from "./dashboard-header";

const themeMock = vi.hoisted(() => ({
  setTheme: vi.fn(),
  currentTheme: "system",
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    theme: themeMock.currentTheme,
    setTheme: themeMock.setTheme,
  }),
}));

describe("DashboardHeader theme control", () => {
  beforeEach(() => {
    themeMock.setTheme.mockClear();
    themeMock.currentTheme = "system";
  });

  it("offers explicit light, dark, and system appearance controls", async () => {
    render(<DashboardHeader />);

    await waitFor(() => {
      expect(screen.getByLabelText("라이트 모드")).toBeTruthy();
    });

    fireEvent.click(screen.getByLabelText("라이트 모드"));
    fireEvent.click(screen.getByLabelText("다크 모드"));
    fireEvent.click(screen.getByLabelText("시스템 설정"));

    expect(themeMock.setTheme).toHaveBeenCalledWith("light");
    expect(themeMock.setTheme).toHaveBeenCalledWith("dark");
    expect(themeMock.setTheme).toHaveBeenCalledWith("system");
  });
});
