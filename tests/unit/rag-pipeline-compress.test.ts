import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { InMemoryVectorStore } from "../../packages/memory/src/storage/inMemory";
import {
  compressRankedItems,
  createRagPipeline,
  indexChunks,
  type RagChunk,
} from "../../packages/memory/src/rag/pipeline";

describe("compressRankedItems", () => {
  it("returns original items when compression disabled", () => {
    const items = [
      { id: "a", score: 0.8, content: "one", metadata: { doc_id: "d1", start: 0, end: 10 } },
      { id: "b", score: 0.7, content: "two", metadata: { doc_id: "d1", start: 12, end: 20 } },
    ];
    const out = compressRankedItems(items, false);
    expect(out).toEqual(items);
  });

  it("joins nearby chunks from same doc", () => {
    const items = [
      { id: "a", score: 0.8, content: "one", metadata: { doc_id: "d1", start: 0, end: 10 } },
      { id: "b", score: 0.9, content: "two", metadata: { doc_id: "d1", start: 20, end: 30 } },
    ];
    const out = compressRankedItems(items, true, 2, 20);
    expect(out.length).toBe(1);
    expect(String(out[0].content)).toContain("one");
    expect(String(out[0].content)).toContain("two");
    expect(Number(out[0].score)).toBe(0.9);
  });

  it("respects maxPerDoc when not joinable", () => {
    const items = [
      { id: "a", score: 0.9, content: "a", metadata: { doc_id: "d1", start: 0, end: 10 } },
      { id: "b", score: 0.8, content: "b", metadata: { doc_id: "d1", start: 500, end: 510 } },
      { id: "c", score: 0.7, content: "c", metadata: { doc_id: "d1", start: 1000, end: 1010 } },
    ];
    const out = compressRankedItems(items, true, 2, 10);
    expect(out.length).toBe(2);
  });

  it("handles unknown metadata safely", () => {
    const items = [
      { id: "a", score: 0.8, content: "x", metadata: null },
      { id: "b", score: 0.7, content: "y", metadata: undefined },
    ] as Array<Record<string, unknown>>;
    const out = compressRankedItems(items, true);
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("indexChunks vector normalization edge cases", () => {
  function chunk(content: string): RagChunk {
    return { id: randomUUID(), content, metadata: {} };
  }

  it("pads missing vectors when embedder returns fewer than expected", async () => {
    const store = new InMemoryVectorStore();
    const badEmbedder = {
      // should return 2 vectors for 2 chunks, but returns one
      encode: async (_text: string | string[]) => new Array(10).fill(0.1),
    } as any;

    const chunks = [chunk("first"), chunk("second")];
    await indexChunks({
      store,
      chunks,
      embedder: badEmbedder,
      dimension: 10,
      batchSize: 10,
    });

    const hits = await store.queryVector({ vector: new Array(10).fill(0.1), limit: 10 });
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("truncates vectors longer than target dimension", async () => {
    const store = new InMemoryVectorStore();
    const longEmbedder = {
      encode: async (_text: string | string[]) => [new Array(30).fill(0.2)],
    } as any;

    await indexChunks({
      store,
      chunks: [chunk("long vector")],
      embedder: longEmbedder,
      dimension: 8,
    });

    const hits = await store.queryVector({ vector: new Array(8).fill(0.2), limit: 5 });
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

describe("createRagPipeline addDocuments edge", () => {
  it("returns 0 when documents are missing", async () => {
    const store = new InMemoryVectorStore();
    const rag = createRagPipeline({ store, ragNamespace: "edge" });
    const added = await rag.addDocuments(["/no/such/file-1.txt", "/no/such/file-2.md"]);
    expect(added).toBe(0);
  });
});
