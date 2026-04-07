import { describe, it, expect, beforeEach } from "vitest";
import {
  checkRateLimit,
  cleanupRateLimitStore,
  sanitizeInput,
  validateContentLength,
} from "../lib/security";

describe("Rate limiter", () => {
  // Use unique IPs per test to avoid cross-test pollution
  let testIp: string;
  let counter = 0;

  beforeEach(() => {
    counter++;
    testIp = `test-${counter}-${Date.now()}`;
  });

  it("allows requests under the limit", () => {
    const result = checkRateLimit(testIp, 5);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it("tracks remaining requests correctly", () => {
    checkRateLimit(testIp, 5);
    const result2 = checkRateLimit(testIp, 5);
    expect(result2.allowed).toBe(true);
    expect(result2.remaining).toBe(3);
  });

  it("blocks requests over the limit", () => {
    const max = 3;
    checkRateLimit(testIp, max);
    checkRateLimit(testIp, max);
    checkRateLimit(testIp, max);
    const result = checkRateLimit(testIp, max);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("returns resetAt timestamp", () => {
    const before = Date.now();
    const result = checkRateLimit(testIp, 5, 60000);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60000);
  });

  it("resets after the window expires", () => {
    // Use a very short window
    const result1 = checkRateLimit(testIp, 1, 1);
    expect(result1.allowed).toBe(true);

    // The 1ms window should have expired by now (or very soon)
    // Force a slightly delayed check
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* busy wait 5ms */
    }
    const result2 = checkRateLimit(testIp, 1, 1);
    expect(result2.allowed).toBe(true);
  });

  it("cleanupRateLimitStore removes expired entries", () => {
    // Create an entry with a 1ms window (immediately expired)
    checkRateLimit(testIp, 5, 1);
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* busy wait */
    }
    // Should not throw
    cleanupRateLimitStore();
  });
});

describe("Input sanitizer", () => {
  it("strips HTML tags", () => {
    expect(sanitizeInput("<b>bold</b>")).toBe("bold");
  });

  it("strips script tags", () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it("strips event handler attributes in tags", () => {
    expect(sanitizeInput('<img onerror="alert(1)" src="x">')).toBe("");
  });

  it("strips nested tags", () => {
    expect(sanitizeInput("<div><p>text</p></div>")).toBe("text");
  });

  it("leaves plain text unchanged", () => {
    expect(sanitizeInput("Hello, world!")).toBe("Hello, world!");
  });

  it("handles empty string", () => {
    expect(sanitizeInput("")).toBe("");
  });

  it("strips self-closing tags", () => {
    expect(sanitizeInput("line<br/>break")).toBe("linebreak");
  });

  it("preserves non-tag angle brackets in normal text", () => {
    // The regex strips anything that looks like <...>, so "5 > 3" stays
    expect(sanitizeInput("5 > 3")).toBe("5 > 3");
  });
});

describe("Content length validator", () => {
  it("accepts content under 100KB", () => {
    const content = "a".repeat(1000);
    const result = validateContentLength(content);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("rejects content over 100KB", () => {
    const content = "a".repeat(200 * 1024);
    const result = validateContentLength(content);
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("exceeds");
  });

  it("accepts content exactly at the limit", () => {
    const content = "a".repeat(100 * 1024);
    const result = validateContentLength(content);
    expect(result.valid).toBe(true);
  });

  it("rejects content just over the limit", () => {
    const content = "a".repeat(100 * 1024 + 1);
    const result = validateContentLength(content);
    expect(result.valid).toBe(false);
  });

  it("accepts empty string", () => {
    const result = validateContentLength("");
    expect(result.valid).toBe(true);
  });

  it("respects custom maxBytes parameter", () => {
    const result = validateContentLength("hello", 3);
    expect(result.valid).toBe(false);
  });

  it("handles multi-byte unicode characters correctly", () => {
    // Each emoji is 4 bytes in UTF-8
    const emojis = "😀😀😀";
    // 12 bytes for 3 emojis
    const result = validateContentLength(emojis, 12);
    expect(result.valid).toBe(true);

    const resultTight = validateContentLength(emojis, 11);
    expect(resultTight.valid).toBe(false);
  });
});
