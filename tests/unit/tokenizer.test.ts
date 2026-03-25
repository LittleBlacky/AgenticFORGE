/**
 * context/src/tokenizer — createTokenCounter, estimateTokens, ApproxTokenCounter
 */
import { describe, it, expect } from "vitest";
import { createTokenCounter, estimateTokens } from "../../packages/context/src/tokenizer";

describe("createTokenCounter — approx mode", () => {
  it("count() returns ceil(length/4) by default", () => {
    const counter = createTokenCounter();
    expect(counter.count("aaaa")).toBe(1); // 4/4 = 1
    expect(counter.count("a".repeat(8))).toBe(2);
    expect(counter.count("a".repeat(5))).toBe(2); // ceil(5/4)
  });

  it("count() returns 0 for empty string", () => {
    const counter = createTokenCounter();
    expect(counter.count("")).toBe(0);
  });

  it("custom charsPerToken changes ratio", () => {
    const counter = createTokenCounter({ charsPerToken: 2 });
    expect(counter.count("aaaa")).toBe(2); // ceil(4/2)
  });

  it("falls back to approx when encodingName is invalid", () => {
    const counter = createTokenCounter({ encodingName: "nonexistent_encoding" });
    expect(counter.count("hello world")).toBeGreaterThan(0);
  });

  it("count() handles long text", () => {
    const counter = createTokenCounter();
    const text = "a".repeat(1000);
    expect(counter.count(text)).toBe(250);
  });
});

describe("estimateTokens", () => {
  it("uses counter when provided", () => {
    const counter = createTokenCounter({ charsPerToken: 2 });
    expect(estimateTokens("aaaa", counter)).toBe(2);
  });

  it("uses default chars/4 when no counter", () => {
    expect(estimateTokens("a".repeat(8))).toBe(2);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("returns ceil value for non-divisible length", () => {
    expect(estimateTokens("a".repeat(5))).toBe(2); // ceil(5/4)
  });
});
