import { describe, expect, it } from "vitest";
import { describeHttpError } from "./http-error";

const res = (status: number, body: string) => new Response(body, { status });

describe("describeHttpError", () => {
  it("reads the GNews errors array", async () => {
    const out = await describeHttpError(res(429, JSON.stringify({ errors: ["Too many requests, please slow down."] })));
    expect(out).toBe('status=429 message="Too many requests, please slow down."');
  });

  it("reads the NewsAPI code and message", async () => {
    const out = await describeHttpError(res(429, JSON.stringify({ status: "error", code: "rateLimited", message: "You have made too many requests recently." })));
    expect(out).toBe('status=429 message="rateLimited: You have made too many requests recently."');
  });

  it("masks the key if the body echoes it and keeps non-JSON bodies short", async () => {
    const out = await describeHttpError(res(403, `forbidden for key SECRET123 ${"x".repeat(300)}`), "SECRET123");
    expect(out).not.toContain("SECRET123");
    expect(out).toContain("***");
    expect(out.length).toBeLessThan(260);
  });

  it("handles an empty body", async () => {
    expect(await describeHttpError(res(500, ""))).toBe('status=500 message="(빈 본문)"');
  });
});
