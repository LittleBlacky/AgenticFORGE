/**
 * @agenticforge/memory — HashTextEmbedder 和 OpenAITextEmbedder 构造器测试
 */
import { describe, it, expect } from "vitest";
import {
  HashTextEmbedder,
  OpenAITextEmbedder,
} from "../../packages/memory/src/embedding/embedders";

// ===========================================================================
// HashTextEmbedder
// ===========================================================================
describe("HashTextEmbedder", () => {
  it("encode() single string returns number[]", async () => {
    const embedder = new HashTextEmbedder(64);
    const result = await embedder.encode("hello world");
    expect(Array.isArray(result)).toBe(true);
    expect((result as number[]).length).toBe(64);
  });

  it("encode() returns vector of correct dimension", async () => {
    const embedder = new HashTextEmbedder(128);
    const v = (await embedder.encode("test")) as number[];
    expect(v.length).toBe(128);
  });

  it("encode() returns normalized vector (L2 norm ≈ 1)", async () => {
    const embedder = new HashTextEmbedder(64);
    const v = (await embedder.encode("normalize me")) as number[];
    const norm = Math.sqrt(v.reduce((acc, n) => acc + n * n, 0));
    expect(norm).toBeCloseTo(1.0, 5);
  });

  it("encode() returns zero vector for empty string", async () => {
    const embedder = new HashTextEmbedder(32);
    const v = (await embedder.encode("")) as number[];
    expect(v.every((n) => n === 0)).toBe(true);
  });

  it("encode() array of strings returns number[][]", async () => {
    const embedder = new HashTextEmbedder(32);
    const result = await embedder.encode(["hello", "world"]);
    expect(Array.isArray(result)).toBe(true);
    expect((result as number[][])[0]!.length).toBe(32);
    expect((result as number[][])[1]!.length).toBe(32);
  });

  it("encode() same text produces same vector", async () => {
    const embedder = new HashTextEmbedder(64);
    const v1 = (await embedder.encode("deterministic")) as number[];
    const v2 = (await embedder.encode("deterministic")) as number[];
    expect(v1).toEqual(v2);
  });

  it("encode() different texts produce different vectors", async () => {
    const embedder = new HashTextEmbedder(64);
    const v1 = (await embedder.encode("agenticforge framework")) as number[];
    const v2 = (await embedder.encode("quantum physics experiment")) as number[];
    // Different multi-word inputs should produce different sparse vectors
    expect(v1).not.toEqual(v2);
  });

  it("uses default dimension of 384", async () => {
    const embedder = new HashTextEmbedder();
    const v = (await embedder.encode("test")) as number[];
    expect(v.length).toBe(384);
  });
});

// ===========================================================================
// OpenAITextEmbedder — constructor validation
// ===========================================================================
describe("OpenAITextEmbedder — constructor", () => {
  it("throws when model is missing", () => {
    expect(() => new OpenAITextEmbedder({ apiKey: "k", baseURL: "http://x" })).toThrow();
  });

  it("throws when apiKey is missing", () => {
    expect(
      () => new OpenAITextEmbedder({ model: "text-embedding-3-small", baseURL: "http://x" }),
    ).toThrow();
  });

  it("throws when baseURL is missing", () => {
    expect(
      () => new OpenAITextEmbedder({ model: "text-embedding-3-small", apiKey: "k" }),
    ).toThrow();
  });

  it("constructs successfully with all required fields", () => {
    expect(
      () =>
        new OpenAITextEmbedder({
          model: "text-embedding-3-small",
          apiKey: "sk-test",
          baseURL: "https://api.openai.com/v1",
        }),
    ).not.toThrow();
  });
});
