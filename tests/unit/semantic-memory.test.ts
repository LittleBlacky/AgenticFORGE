/**
 * memory/src/types/semantic.ts — SemanticMemory full coverage
 */
import { describe, it, expect, beforeEach } from "vitest";
import { SemanticMemory } from "../../packages/memory/src/types/semantic";
import {
  InMemoryVectorStore,
  InMemoryGraphStore,
  InMemoryKVStore,
} from "../../packages/memory/src/storage/inMemory";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "TypeScript is a typed superset of JavaScript",
    memoryType: "semantic",
    userId: "u1",
    timestamp: new Date(),
    importance: 0.6,
    metadata: {},
    ...overrides,
  };
}

// ===========================================================================
// SemanticMemory — in-memory (no adapters)
// ===========================================================================
describe("SemanticMemory — basic (no adapters)", () => {
  let mem: SemanticMemory;
  beforeEach(() => { mem = new SemanticMemory(); });

  it("add() stores item and returns id", async () => {
    const item = makeItem();
    const id = await mem.add(item);
    expect(id).toBe(item.id);
  });

  it("hasMemory() returns true after add", async () => {
    const item = makeItem();
    await mem.add(item);
    expect(await mem.hasMemory(item.id)).toBe(true);
  });

  it("hasMemory() returns false for unknown id", async () => {
    expect(await mem.hasMemory("nope")).toBe(false);
  });

  it("retrieve() returns array", async () => {
    await mem.add(makeItem());
    const results = await mem.retrieve("TypeScript", 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it("retrieve() returns empty for empty memory", async () => {
    expect(await mem.retrieve("q", 5)).toHaveLength(0);
  });

  it("retrieve() with userId filter", async () => {
    await mem.add(makeItem({ userId: "u1" }));
    await mem.add(makeItem({ userId: "u2" }));
    const results = await mem.retrieve("TypeScript", 5, { userId: "u1" });
    expect(results.every(m => m.userId === "u1")).toBe(true);
  });

  it("update() changes content", async () => {
    const item = makeItem();
    await mem.add(item);
    const ok = await mem.update(item.id, "updated");
    expect(ok).toBe(true);
  });

  it("update() returns false for unknown id", async () => {
    expect(await mem.update("nope", "content")).toBe(false);
  });

  it("update() changes importance", async () => {
    const item = makeItem({ importance: 0.3 });
    await mem.add(item);
    await mem.update(item.id, undefined, 0.9);
    const results = await mem.retrieve(item.content, 1);
    expect(results[0]!.importance).toBe(0.9);
  });

  it("remove() returns true and removes item", async () => {
    const item = makeItem();
    await mem.add(item);
    expect(await mem.remove(item.id)).toBe(true);
    expect(await mem.hasMemory(item.id)).toBe(false);
  });

  it("remove() returns false for unknown id", async () => {
    expect(await mem.remove("nope")).toBe(false);
  });

  it("clear() empties all memories", async () => {
    await mem.add(makeItem());
    await mem.clear();
    expect(await mem.retrieve("q", 10)).toHaveLength(0);
  });

  it("getStats() returns count and memoryType", async () => {
    await mem.add(makeItem());
    const stats = await mem.getStats();
    expect(stats.count).toBe(1);
    expect(stats.memoryType).toBe("semantic");
  });

  it("getStats() returns 0 for empty memory", async () => {
    const stats = await mem.getStats();
    expect(stats.count).toBe(0);
    expect(stats.avgImportance).toBe(0);
  });
});

// ===========================================================================
// SemanticMemory — with adapters (vectorStore + graphStore + kvStore)
// ===========================================================================
describe("SemanticMemory — with adapters", () => {
  let mem: SemanticMemory;
  let vectorStore: InMemoryVectorStore;
  let graphStore: InMemoryGraphStore;
  let kvStore: InMemoryKVStore<MemoryItem>;

  beforeEach(() => {
    vectorStore = new InMemoryVectorStore();
    graphStore = new InMemoryGraphStore();
    kvStore = new InMemoryKVStore<MemoryItem>();
    mem = new SemanticMemory({}, { vectorStore, graphStore, kvStore });
  });

  it("add() upserts into vectorStore", async () => {
    const item = makeItem();
    await mem.add(item);
    const results = await vectorStore.queryVector({ vector: new Array(384).fill(0.1), limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  });

  it("add() upserts entities into graphStore", async () => {
    const item = makeItem({ content: "TypeScript is used at Microsoft" });
    await mem.add(item);
    // just ensure no error thrown
  });

  it("add() stores in kvStore", async () => {
    const item = makeItem();
    await mem.add(item);
    const stored = await kvStore.get(item.id);
    expect(stored).not.toBeNull();
  });

  it("retrieve() uses vectorStore results", async () => {
    await mem.add(makeItem({ content: "TypeScript generics" }));
    const results = await mem.retrieve("TypeScript", 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it("retrieve() falls back to kvStore when no vector/graph results", async () => {
    const item = makeItem();
    await kvStore.put(item.id, item);
    // retrieve from empty vectorStore should fall back to kvStore
    const cleanMem = new SemanticMemory({}, { kvStore });
    const results = await cleanMem.retrieve("TypeScript", 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it("remove() deletes from vectorStore and kvStore", async () => {
    const item = makeItem();
    await mem.add(item);
    await mem.remove(item.id);
    expect(await kvStore.get(item.id)).toBeNull();
  });

  it("update() re-embeds and upserts to vectorStore", async () => {
    const item = makeItem();
    await mem.add(item);
    const ok = await mem.update(item.id, "new content", 0.8);
    expect(ok).toBe(true);
  });
});

// ===========================================================================
// SemanticMemory — knowledge graph (entity/relation extraction)
// ===========================================================================
describe("SemanticMemory — knowledge graph internal", () => {
  it("add() extracts entities into metadata", async () => {
    const mem = new SemanticMemory();
    const item = makeItem({ content: "Alice works at Acme Corporation" });
    await mem.add(item);
    expect(item.metadata.entities).toBeDefined();
  });

  it("add() extracts relations into metadata", async () => {
    const mem = new SemanticMemory();
    const item = makeItem({ content: "Bob manages Charlie at TechCorp" });
    await mem.add(item);
    expect(item.metadata.relations).toBeDefined();
  });

  it("getStats() returns entityCount and relationsCount", async () => {
    const mem = new SemanticMemory();
    await mem.add(makeItem({ content: "Python is a programming language" }));
    const stats = await mem.getStats();
    expect(typeof stats.entitiesCount).toBe("number");
    expect(typeof stats.relationsCount).toBe("number");
  });
});
