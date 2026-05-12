import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("global theme contract", () => {
  it("uses class-based dark tokens instead of media-query-only colors", () => {
    const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf-8");

    expect(css).toContain("@custom-variant dark");
    expect(css).toContain(".dark {");
    expect(css).toContain("--color-background: var(--background)");
    expect(css).toContain("--color-card: var(--card)");
    expect(css).not.toContain("@media (prefers-color-scheme: dark)");
  });

  it("applies background and foreground tokens at the app body", () => {
    const layout = fs.readFileSync(path.join(root, "src/app/layout.tsx"), "utf-8");

    expect(layout).toContain("bg-background text-foreground");
    expect(layout).toContain('ThemeProvider attribute="class"');
    expect(layout).toContain('defaultTheme="system"');
  });
});
