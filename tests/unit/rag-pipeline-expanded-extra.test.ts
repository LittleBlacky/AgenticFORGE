import { describe, it, expect, vi } from "vitest";
import {
  searchVectorsExpanded,
  rerankWithCrossEncoder,
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
      queryVector: vi.fn().mockResolvedValue([{ id: "a", score: 0.8, payload: hit("a", 0.8).metadata }]),
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
    const items = [{ id: "a", score: 0.2 }, { id: "b", score: 0.9 }];
    const reranker = vi.fn().mockRejectedValue(new Error("rerank fail"));

    const out = await rerankWithCrossEncoder("q", items, 1, reranker);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(items[0]);
  });

  it("fills missing rerank scores with 0 and sorts by rerank score", async () => {
    const items = [{ id: "a", score: 0.1 }, { id: "b", score: 0.2 }, { id: "c", score: 0.3 }];
    const reranker = vi.fn().mockResolvedValue([0.2, 0.9]); // missing c -> 0

    const out = await rerankWithCrossEncoder("q", items, 3, reranker);
    expect((out[0] as any).id).toBe("b");
    const c = out.find((x: any) => x.id === "c") as any;
    expect(c.rerank_score).toBe(0);
  });
});
