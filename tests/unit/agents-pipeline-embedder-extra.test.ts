import { describe, it, expect, vi } from "vitest";
import {
  mergeSnippetsGrouped,
} from "../../packages/memory/src/rag/pipeline";
import { OpenAITextEmbedder } from "../../packages/memory/src/embedding/embedders";
import { createDefaultTextEmbedder } from "../../packages/memory/src/embedding/factory";
import { FunctionCallAgent } from "../../packages/agents/src/function-call-agent/FunctionCallAgent";

// ===========================================================================
// FunctionCallAgent.extractMessageContent (private static)
// ===========================================================================
describe("FunctionCallAgent.extractMessageContent", () => {
  const fn = (FunctionCallAgent as any).extractMessageContent as (v: unknown) => string;

  it("returns empty string for null/undefined", () => {
    expect(fn(null)).toBe("");
    expect(fn(undefined)).toBe("");
  });

  it("returns string as-is", () => {
    expect(fn("hello")).toBe("hello");
  });

  it("extracts joined text from array parts", () => {
    const result = fn([{ text: "A" }, { text: "B" }, { type: "x" }]);
    expect(result).toBe("AB");
  });

  it("stringifies non-array object", () => {
    const result = fn({ a: 1 });
    expect(typeof result).toBe("string");
    expect(result).toContain("[object Object]");
  });
});

// ===========================================================================
// mergeSnippetsGrouped
// ===========================================================================
describe("mergeSnippetsGrouped", () => {
  it("returns merged snippets without citations", () => {
    const ranked = [
      { content: "chunk1", score: 0.9, metadata: { doc_id: "d1", start: 0, end: 6 } },
      { content: "chunk2", score: 0.8, metadata: { doc_id: "d1", start: 7, end: 13 } },
    ];
    const out = mergeSnippetsGrouped(ranked, 200, false);
    expect(out).toContain("chunk1");
    expect(out).toContain("chunk2");
    expect(out).not.toContain("References:");
  });

  it("adds references when citations enabled", () => {
    const ranked = [
      {
        content: "important text",
        score: 0.9,
        metadata: { source_path: "doc.md", doc_id: "d1", start: 0, end: 14, heading_path: "H1" },
      },
    ];
    const out = mergeSnippetsGrouped(ranked, 500, true);
    expect(out).toContain("References:");
    expect(out).toContain("[1]");
    expect(out).toContain("doc.md");
  });

  it("clips output by maxChars and still stays valid", () => {
    const ranked = [
      {
        content: "x".repeat(500),
        score: 0.9,
        metadata: { source_path: "doc.md", doc_id: "d1", start: 0, end: 500 },
      },
    ];
    const out = mergeSnippetsGrouped(ranked, 60, true);
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
  });

  it("handles empty content entries", () => {
    const ranked = [
      { content: "", score: 0.9, metadata: { doc_id: "d1" } },
      { content: "valid", score: 0.8, metadata: { doc_id: "d1" } },
    ];
    const out = mergeSnippetsGrouped(ranked, 200, true);
    expect(out).toContain("valid");
  });
});

// ===========================================================================
// OpenAITextEmbedder.encode with mocked client
// ===========================================================================
describe("OpenAITextEmbedder.encode", () => {
  it("encodes single string using mocked client", async () => {
    const emb = new OpenAITextEmbedder({
      model: "text-embedding-3-small",
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
    });

    (emb as any).client = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [0.1, 0.2, 0.3] }],
        }),
      },
    };

    const vec = await emb.encode("hello");
    expect(vec).toEqual([0.1, 0.2, 0.3]);
  });

  it("encodes string array using mocked client", async () => {
    const emb = new OpenAITextEmbedder({
      model: "text-embedding-3-small",
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
    });

    (emb as any).client = {
      embeddings: {
        create: vi.fn().mockResolvedValue({
          data: [{ embedding: [1, 2] }, { embedding: [3, 4] }],
        }),
      },
    };

    const vecs = await emb.encode(["a", "b"]);
    expect(vecs).toEqual([[1, 2], [3, 4]]);
  });
});

// ===========================================================================
// createDefaultTextEmbedder env path
// ===========================================================================
describe("createDefaultTextEmbedder env path", () => {
  it("returns OpenAITextEmbedder when env is complete", () => {
    const prevModel = process.env.EMBEDDING_MODEL_ID;
    const prevKey = process.env.EMBEDDING_API_KEY;
    const prevBase = process.env.EMBEDDING_BASE_URL;

    process.env.EMBEDDING_MODEL_ID = "text-embedding-3-small";
    process.env.EMBEDDING_API_KEY = "sk-test";
    process.env.EMBEDDING_BASE_URL = "https://api.openai.com/v1";

    const emb = createDefaultTextEmbedder(32);
    expect(emb).toBeInstanceOf(OpenAITextEmbedder);

    process.env.EMBEDDING_MODEL_ID = prevModel;
    process.env.EMBEDDING_API_KEY = prevKey;
    process.env.EMBEDDING_BASE_URL = prevBase;
  });
});
