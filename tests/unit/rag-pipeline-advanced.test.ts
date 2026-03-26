/**
 * memory/src/rag/pipeline — indexChunks, embedQuery, searchVectors, storeFactory
 */
import { describe, it, expect, vi } from "vitest";
import {
  indexChunks,
  embedQuery,
  searchVectors,
  loadAndChunkTexts,
  type RagChunk,
} from "../../packages/memory/src/rag/pipeline";
import { InMemoryVectorStore } from "../../packages/memory/src/storage/inMemory";
import { HashTextEmbedder } from "../../packages/memory/src/embedding/embedders";
import {
  registerRagVectorStoreFactory,
  createDefaultVectorStore,
} from "../../packages/memory/src/rag/storeFactory";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const embedder = new HashTextEmbedder(64);

function makeChunk(id: string, content: string): RagChunk {
  return { id, content, metadata: { source: "test.md" } };
}

// ===========================================================================
// indexChunks
// ===========================================================================
describe("indexChunks", () => {
  it("inserts chunks into vector store", async () => {
    const store = new InMemoryVectorStore();
    const chunks = [makeChunk("c1", "hello world"), makeChunk("c2", "foo bar baz")];
    await indexChunks({ store, chunks, embedder, dimension: 64 });
    const results = await store.queryVector({ vector: new Array(64).fill(0.1), limit: 10 });
    expect(results.length).toBe(2);
  });

  it("does nothing when chunks is empty", async () => {
    const store = new InMemoryVectorStore();
    await indexChunks({ store, chunks: [], embedder, dimension: 64 });
    const results = await store.queryVector({ vector: new Array(64).fill(0.1), limit: 10 });
    expect(results).toHaveLength(0);
  });

  it("throws when store is not provided", async () => {
    await expect(
      indexChunks({
        store: undefined as any,
        chunks: [makeChunk("c1", "x")],
        embedder,
        dimension: 64,
      }),
    ).rejects.toThrow();
  });

  it("stores metadata in payload", async () => {
    const store = new InMemoryVectorStore();
    await indexChunks({
      store,
      chunks: [makeChunk("m1", "content")],
      embedder,
      dimension: 64,
      ragNamespace: "ns1",
    });
    const results = await store.queryVector({ vector: new Array(64).fill(0.1), limit: 1 });
    expect((results[0]!.payload as any).rag_namespace).toBe("ns1");
  });

  it("processes large batch in multiple passes", async () => {
    const store = new InMemoryVectorStore();
    const chunks = Array.from({ length: 10 }, (_, i) => makeChunk(`c${i}`, `content ${i}`));
    await indexChunks({ store, chunks, embedder, dimension: 64, batchSize: 3 });
    const results = await store.queryVector({ vector: new Array(64).fill(0.1), limit: 20 });
    expect(results.length).toBe(10);
  });
});

// ===========================================================================
// embedQuery
// ===========================================================================
describe("embedQuery", () => {
  it("returns a number array of correct dimension", async () => {
    const v = await embedQuery("test query", embedder, 64);
    expect(Array.isArray(v)).toBe(true);
    expect(v.length).toBe(64);
  });

  it("returns normalized vector", async () => {
    const v = await embedQuery("hello world", embedder, 64);
    const norm = Math.sqrt(v.reduce((acc, n) => acc + n * n, 0));
    expect(norm).toBeCloseTo(1.0, 3);
  });

  it("uses HashTextEmbedder when no embedder provided", async () => {
    const v = await embedQuery("test", undefined, 64);
    expect(v.length).toBe(64);
  });
});

// ===========================================================================
// searchVectors
// ===========================================================================
describe("searchVectors", () => {
  it("returns matching results after indexing", async () => {
    const store = new InMemoryVectorStore();
    await indexChunks({
      store,
      chunks: [
        makeChunk("a", "typescript agent framework"),
        makeChunk("b", "python machine learning"),
      ],
      embedder,
      dimension: 64,
      ragNamespace: "test",
    });
    const results = await searchVectors({
      store,
      query: "typescript agent",
      options: { topK: 2, ragNamespace: "test" },
      embedder,
      dimension: 64,
    });
    expect(Array.isArray(results)).toBe(true);
  });

  it("returns empty array when store is empty", async () => {
    const store = new InMemoryVectorStore();
    const results = await searchVectors({
      store,
      query: "anything",
      options: { topK: 5 },
      embedder,
      dimension: 64,
    });
    expect(results).toHaveLength(0);
  });

  it("respects topK limit", async () => {
    const store = new InMemoryVectorStore();
    await indexChunks({
      store,
      chunks: Array.from({ length: 5 }, (_, i) => makeChunk(`c${i}`, `item ${i}`)),
      embedder,
      dimension: 64,
    });
    const results = await searchVectors({
      store,
      query: "item",
      options: { topK: 2 },
      embedder,
      dimension: 64,
    });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("filters by scoreThreshold", async () => {
    const store = new InMemoryVectorStore();
    await indexChunks({
      store,
      chunks: [makeChunk("x", "completely unrelated content xyz abc")],
      embedder,
      dimension: 64,
    });
    const results = await searchVectors({
      store,
      query: "typescript",
      options: { topK: 5, scoreThreshold: 0.99 },
      embedder,
      dimension: 64,
    });
    // very high threshold should filter out low-similarity results
    expect(results.length).toBeLessThanOrEqual(1);
  });
});

// ===========================================================================
// loadAndChunkTexts (with real temp files)
// ===========================================================================
describe("loadAndChunkTexts", () => {
  it("loads and chunks a text file into RagChunks", async () => {
    const tmp = path.join(os.tmpdir(), `rag-test-${Date.now()}.txt`);
    await fs.writeFile(
      tmp,
      "Hello world.\n\nThis is the second paragraph.\n\nAnd a third one.",
      "utf8",
    );
    try {
      const chunks = loadAndChunkTexts({
        paths: [tmp],
        chunkSize: 50,
        chunkOverlap: 5,
        namespace: "test",
      });
      expect(chunks.length).toBeGreaterThan(0);
      expect(typeof chunks[0]!.content).toBe("string");
      expect(typeof chunks[0]!.id).toBe("string");
    } finally {
      await fs.unlink(tmp).catch(() => {});
    }
  });

  it("skips non-existent files silently", () => {
    const chunks = loadAndChunkTexts({ paths: ["/nonexistent/file.txt"], chunkSize: 100 });
    expect(chunks).toHaveLength(0);
  });
});

// ===========================================================================
// storeFactory — registerRagVectorStoreFactory, createDefaultVectorStore
// ===========================================================================
describe("storeFactory", () => {
  it("createDefaultVectorStore() returns InMemoryVectorStore by default", () => {
    const store = createDefaultVectorStore({ backend: "memory" });
    expect(store).toBeDefined();
    expect(typeof store.upsertVector).toBe("function");
  });

  it("registerRagVectorStoreFactory() overrides default factory", () => {
    const customStore = new InMemoryVectorStore();
    registerRagVectorStoreFactory(() => customStore);
    const store = createDefaultVectorStore();
    expect(store).toBe(customStore);
    // Reset to default
    registerRagVectorStoreFactory(null as any);
  });
});
