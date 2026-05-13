import { describe, expect, it } from "vitest";
import { validateStaticMaster } from "./master-validation";

describe("static master validation", () => {
  it("has no hard DART/taxonomy consistency errors", () => {
    const issues = validateStaticMaster();
    const errors = issues.filter(issue => issue.severity === "error");
    expect(errors).toEqual([]);
  });

  it("keeps known corrected symbols stable", () => {
    const issues = validateStaticMaster();
    const symbolsWithErrors = new Set(
      issues.filter(issue => issue.severity === "error").map(issue => issue.symbol),
    );

    expect(symbolsWithErrors.has("000880")).toBe(false);
    expect(symbolsWithErrors.has("006260")).toBe(false);
    expect(symbolsWithErrors.has("087010")).toBe(false);
    expect(symbolsWithErrors.has("011790")).toBe(false);
    expect(symbolsWithErrors.has("348340")).toBe(false);
  });
});
