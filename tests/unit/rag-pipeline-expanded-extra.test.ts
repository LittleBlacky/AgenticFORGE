import { describe, it, expect, vi } from "vitest";
import { LLMClient } from "../../packages/core/src/llm";
import {
  searchVectorsExpanded,
  rerankWithCrossEncoder,
  compressRankedItems,
  createRagPipeline,
  tldrSummarize,
  type VectorSearchHit,
} from "../../packages/memory/src/rag/pipeline";

function hit(id: string, score: number, memoryId?: string): VectorSearchHit {
  return {
    id,
    score,
    metadata: {
      memory_id: memoryId ?? id,
      content: `content-${id}`,
      doc_id: "doc-1",
      start: 0,
      end: 10,
    },
  };
}

describe("searchVectorsExpanded extra branches", () => {
  it("falls back to original query when MQE LLM fails", async () => {
    const store = {
      queryVector: vi
        .fn()
        .mockResolvedValue([{ id: "a", score: 0.8, payload: hit("a", 0.8).metadata }]),
    } as any;

    const badLLM = {
      think: vi.fn().mockRejectedValue(new Error("llm down")),
    } as any;

    const results = await searchVectorsExpanded({
      store,
      query: "agent memory",
      llm: badLLM,
      options: { enableMqe: true, mqeExpansions: 2, topK: 5 },
    });

    expect(Array.isArray(results)).toBe(true);
    expect(store.queryVector).toHaveBeenCalled();
  });

  it("uses HYDE expansion and deduplicates by memory_id with max score", async () => {
    const store = {
      queryVector: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "x1", score: 0.4, payload: { memory_id: "m1", content: "base" } },
          { id: "x2", score: 0.3, payload: { memory_id: "m2", content: "base2" } },
        ])
        .mockResolvedValueOnce([
          { id: "x3", score: 0.9, payload: { memory_id: "m1", content: "hyde better" } },
        ]),
    } as any;

    const llm = {
      think: vi.fn().mockResolvedValue("hypothetical answer paragraph"),
    } as any;

    const results = await searchVectorsExpanded({
      store,
      query: "what is rag",
      llm,
      options: { enableHyde: true, topK: 5 },
    });

    const m1 = results.find((r) => (r.metadata.memory_id ?? r.id) === "m1");
    expect(m1?.score).toBe(0.9);
    expect(store.queryVector).toHaveBeenCalledTimes(2);
  });

  it("applies scoreThreshold and topK", async () => {
    const store = {
      queryVector: vi.fn().mockResolvedValue([
        { id: "a", score: 0.95, payload: { memory_id: "a" } },
        { id: "b", score: 0.5, payload: { memory_id: "b" } },
        { id: "c", score: 0.4, payload: { memory_id: "c" } },
      ]),
    } as any;

    const results = await searchVectorsExpanded({
      store,
      query: "vector db",
      options: { topK: 1, scoreThreshold: 0.9 },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBeGreaterThanOrEqual(0.9);
  });
});

describe("rerankWithCrossEncoder extra branches", () => {
  it("returns original slice when reranker throws", async () => {
    const items = [
      { id: "a", score: 0.2 },
      { id: "b", score: 0.9 },
    ];
    const reranker = vi.fn().mockRejectedValue(new Error("rerank fail"));

    const out = await rerankWithCrossEncoder("q", items, 1, reranker);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(items[0]);
  });

  it("fills missing rerank scores with 0 and sorts by rerank score", async () => {
    const items = [
      { id: "a", score: 0.1 },
      { id: "b", score: 0.2 },
      { id: "c", score: 0.3 },
    ];
    const reranker = vi.fn().mockResolvedValue([0.2, 0.9]); // missing c -> 0

    const out = await rerankWithCrossEncoder("q", items, 3, reranker);
    expect((out[0] as any).id).toBe("b");
    const c = out.find((x: any) => x.id === "c") as any;
    expect(c.rerank_score).toBe(0);
  });
});

describe("pipeline compression + helper branches", () => {
  it("compressRankedItems merges adjacent snippets and enforces maxPerDoc", () => {
    const ranked = [
      {
        id: "a1",
        memory_id: "a1",
        score: 0.3,
        content: "part-1",
        metadata: { doc_id: "docA", start: 0, end: 10 },
      },
      {
        id: "a2",
        memory_id: "a2",
        score: 0.9,
        content: "part-2",
        metadata: { doc_id: "docA", start: 12, end: 22 },
      },
      {
        id: "a3",
        memory_id: "a3",
        score: 0.1,
        content: "part-3",
        metadata: { doc_id: "docA", start: 500, end: 510 },
      },
      {
        id: "a4",
        memory_id: "a4",
        score: 0.2,
        content: "part-4",
        metadata: { doc_id: "docA", start: 700, end: 710 },
      },
    ] as Array<Record<string, unknown>>;

    const out = compressRankedItems(ranked, true, 2, 50);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(String(out[0].content)).toContain("part-1");
    expect(String(out[0].content)).toContain("part-2");
    expect(Number(out[0].score)).toBe(0.9);
    expect(out.some((x) => x.id === "a4")).toBe(false);
  });

  it("compressRankedItems non-merge branch keeps item when start goes backwards", () => {
    const ranked = [
      {
        id: "b1",
        memory_id: "b1",
        score: 0.2,
        content: "b1",
        metadata: { doc_id: "docB", start: 100, end: 120 },
      },
      {
        id: "b2",
        memory_id: "b2",
        score: 0.4,
        content: "b2",
        metadata: { doc_id: "docB", start: 90, end: 99 },
      },
    ] as Array<Record<string, unknown>>;

    const out = compressRankedItems(ranked, true, 3, 200);
    expect(out).toHaveLength(2);
    expect(String(out[0].content)).toBe("b1");
    expect(String(out[1].content)).toBe("b2");
  });

  it("compressRankedItems handles missing ranges and maxPerDoc hard limit", () => {
    const ranked = [
      { id: "c1", memory_id: "c1", score: 0.1, content: "", metadata: { doc_id: "docC" } },
      { id: "c2", memory_id: "c2", score: 0.4, content: "second", metadata: { doc_id: "docC" } },
      {
        id: "c3",
        memory_id: "c3",
        score: 0.9,
        content: "third",
        metadata: { doc_id: "docC", start: 9999, end: 10020 },
      },
    ] as Array<Record<string, unknown>>;

    const out = compressRankedItems(ranked, true, 1, 0);
    expect(out).toHaveLength(1);
    expect(String(out[0].id)).toBe("c1");
  });

  it("compressRankedItems covers nullish metadata branches in merge path", () => {
    const ranked = [
      { id: "n1", memory_id: "n1", score: 0.1, content: "", metadata: { doc_id: "docN" } },
      {
        id: "n2",
        memory_id: "n2",
        score: 0.8,
        content: "later",
        metadata: { doc_id: "docN", start: 1 },
      },
    ] as Array<Record<string, unknown>>;

    const out = compressRankedItems(ranked, true, 5, 10);
    expect(out).toHaveLength(1);
    expect(String(out[0].content)).toBe("later");
    expect(Number(out[0].score)).toBe(0.8);
  });

  it("compressRankedItems updates lastMeta.end when previous end is missing", () => {
    const ranked = [
      {
        id: "m1",
        memory_id: "m1",
        score: 0.3,
        content: "abc",
        metadata: { doc_id: "docM", start: 5 },
      },
      {
        id: "m2",
        memory_id: "m2",
        score: 0.4,
        content: "def",
        metadata: { doc_id: "docM", start: 9, end: 15 },
      },
    ] as Array<Record<string, unknown>>;

    const out = compressRankedItems(ranked, true, 5, 20);
    expect(out).toHaveLength(1);
    const meta = (out[0].metadata ?? {}) as Record<string, unknown>;
    expect(Number(meta.end)).toBeGreaterThanOrEqual(15);
  });

  it("createRagPipeline.searchAdvanced triggers normalize1DVector pad path", async () => {
    const store = {
      queryVector: vi
        .fn()
        .mockResolvedValue([{ id: "x", score: 0.8, payload: { memory_id: "x", content: "cx" } }]),
      upsertVector: vi.fn().mockResolvedValue(undefined),
      deleteVector: vi.fn().mockResolvedValue(undefined),
    } as any;

    const rag = createRagPipeline({
      store,
      dimension: 8,
      embedder: {
        encode: async (_: string | string[]) => [0.1, 0.2, 0.3],
      } as any,
    });

    const out = await rag.searchAdvanced("query", 3, false, false);
    expect(Array.isArray(out)).toBe(true);
    expect(store.queryVector).toHaveBeenCalled();
  });

  it("tldr summarize catches LLM failure and returns null", async () => {
    const llm = { think: vi.fn().mockRejectedValue(new Error("summarize fail")) } as any;
    const out = await tldrSummarize("a long text", 3, llm);
    expect(out).toBeNull();
  });

  it("tldr summarize uses default LLMClient when llm not provided", async () => {
    const prevModel = process.env.LLM_MODEL_ID;
    const prevKey = process.env.LLM_API_KEY;
    const prevBase = process.env.LLM_BASE_URL;
    process.env.LLM_MODEL_ID = "test-model";
    process.env.LLM_API_KEY = "test-key";
    process.env.LLM_BASE_URL = "https://example.com/v1";

    const spy = vi.spyOn(LLMClient.prototype, "think").mockResolvedValue("summary-by-default");
    const out = await tldrSummarize("hello world", 3);
    expect(out).toBe("summary-by-default");
    spy.mockRestore();

    if (prevModel === undefined) delete process.env.LLM_MODEL_ID;
    else process.env.LLM_MODEL_ID = prevModel;
    if (prevKey === undefined) delete process.env.LLM_API_KEY;
    else process.env.LLM_API_KEY = prevKey;
    if (prevBase === undefined) delete process.env.LLM_BASE_URL;
    else process.env.LLM_BASE_URL = prevBase;
  });
});
