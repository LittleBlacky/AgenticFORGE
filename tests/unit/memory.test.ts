/**
 * @agenticforge/memory ? ????
 * ???WorkingMemory, EpisodicMemory, SemanticMemory, MemoryManager
 */
import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemory } from "../../packages/memory/src/types/working";
import { EpisodicMemory } from "../../packages/memory/src/types/episodic";
import { SemanticMemory } from "../../packages/memory/src/types/semantic";
import { MemoryManager } from "../../packages/memory/src/manager";
import {
  InMemoryKVStore,
  InMemoryVectorStore,
  InMemoryGraphStore,
} from "../../packages/memory/src/storage/inMemory";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: Math.random().toString(36).slice(2),
    content: "default content",
    memoryType: "working",
    userId: "user1",
    timestamp: new Date(),
    importance: 0.5,
    metadata: {},
    ...overrides,
  };
}

// ===========================================================================
// WorkingMemory
// ===========================================================================
describe("WorkingMemory", () => {
  let mem: WorkingMemory;
  beforeEach(() => {
    mem = new WorkingMemory({
      workingMemoryCapacity: 20,
      workingMemoryTokens: 10000,
      workingMemoryTtlMinutes: 60,
    });
  });

  it("add() returns item id", async () => {
    const item = makeItem();
    expect(await mem.add(item)).toBe(item.id);
  });

  it("hasMemory() true after add", async () => {
    const item = makeItem();
    await mem.add(item);
    expect(await mem.hasMemory(item.id)).toBe(true);
  });

  it("hasMemory() false for unknown id", async () => {
    expect(await mem.hasMemory("nope")).toBe(false);
  });

  it("retrieve() returns relevant items", async () => {
    await mem.add(makeItem({ content: "TypeScript is great", importance: 0.8 }));
    await mem.add(makeItem({ content: "Python is cool", importance: 0.7 }));
    const results = await mem.retrieve("TypeScript", 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.content).toContain("TypeScript");
  });

  it("retrieve() returns empty when no memories", async () => {
    expect(await mem.retrieve("anything")).toHaveLength(0);
  });

  it("retrieve() respects limit", async () => {
    for (let i = 0; i < 10; i++) {
      await mem.add(makeItem({ id: `id${i}`, content: `item ${i}` }));
    }
    const results = await mem.retrieve("item", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("update() changes content", async () => {
    const item = makeItem({ content: "old" });
    await mem.add(item);
    expect(await mem.update(item.id, "new content")).toBe(true);
    const r = await mem.retrieve("new content", 5);
    expect(r.some(x => x.content === "new content")).toBe(true);
  });

  it("update() returns false for unknown id", async () => {
    expect(await mem.update("nope", "content")).toBe(false);
  });

  it("remove() deletes item", async () => {
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
    await mem.add(makeItem());
    await mem.clear();
    expect(await mem.retrieve("", 100)).toHaveLength(0);
  });

  it("getStats() returns stats with count", async () => {
    await mem.add(makeItem({ importance: 0.8 }));
    const stats = await mem.getStats();
    expect(stats.count).toBe(1);
    expect(stats.memoryType).toBe("working");
  });

  it("getRecent() returns items sorted by recency", async () => {
    await mem.add(makeItem({ id: "old", timestamp: new Date(Date.now() - 10000) }));
    await mem.add(makeItem({ id: "new", timestamp: new Date() }));
    const recent = await mem.getRecent(2);
    expect(recent[0]!.id).toBe("new");
  });

  it("getImportant() returns items sorted by importance", async () => {
    await mem.add(makeItem({ id: "low", importance: 0.2 }));
    await mem.add(makeItem({ id: "high", importance: 0.9 }));
    const important = await mem.getImportant(2);
    expect(important[0]!.id).toBe("high");
  });

  it("getAll() returns all items", async () => {
    await mem.add(makeItem());
    await mem.add(makeItem());
    expect(await mem.getAll()).toHaveLength(2);
  });

  it("getContextSummary() returns non-empty string containing the item content", async () => {
    await mem.add(makeItem({ content: "important thing happened" }));
    const summary = await mem.getContextSummary();
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("important thing happened");
  });

  it("getContextSummary() returns fallback string when empty", async () => {
    const summary = await mem.getContextSummary();
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    // Should signal no available memories
    expect(summary.toLowerCase()).toMatch(/no|empty|available|nothing/);
  });

  it("forget() removes low-importance items", async () => {
    await mem.add(makeItem({ importance: 0.05 }));
    await mem.add(makeItem({ importance: 0.9 }));
    const removed = await mem.forget("importance_based", 0.5);
    expect(removed).toBe(1);
  });

  it("enforces capacity: oldest/lowest-priority item evicted", async () => {
    const smallMem = new WorkingMemory({ workingMemoryCapacity: 2 });
    await smallMem.add(makeItem({ id: "a", importance: 0.1 }));
    await smallMem.add(makeItem({ id: "b", importance: 0.9 }));
    await smallMem.add(makeItem({ id: "c", importance: 0.8 }));
    const all = await smallMem.getAll();
    expect(all.length).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// EpisodicMemory
// ===========================================================================
describe("EpisodicMemory", () => {
  let mem: EpisodicMemory;
  beforeEach(() => {
    mem = new EpisodicMemory({ maxCapacity: 50 });
  });

  it("add() returns item id", async () => {
    const item = makeItem({ memoryType: "episodic" });
    expect(await mem.add(item)).toBe(item.id);
  });

  it("hasMemory() true after add", async () => {
    const item = makeItem();
    await mem.add(item);
    expect(await mem.hasMemory(item.id)).toBe(true);
  });

  it("retrieve() finds matching content", async () => {
    await mem.add(makeItem({ content: "visited Paris last summer" }));
    await mem.add(makeItem({ content: "ate sushi yesterday" }));
    const r = await mem.retrieve("Paris", 5);
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.content).toContain("Paris");
  });

  it("retrieve() returns empty for empty memory", async () => {
    expect(await mem.retrieve("anything")).toHaveLength(0);
  });

  it("update() modifies content", async () => {
    const item = makeItem();
    await mem.add(item);
    expect(await mem.update(item.id, "updated content")).toBe(true);
  });

  it("update() returns false for unknown id", async () => {
    expect(await mem.update("nope", "content")).toBe(false);
  });

  it("remove() deletes item", async () => {
    const item = makeItem();
    await mem.add(item);
    expect(await mem.remove(item.id)).toBe(true);
    expect(await mem.hasMemory(item.id)).toBe(false);
  });

  it("clear() empties memory", async () => {
    await mem.add(makeItem());
    await mem.clear();
    expect(await mem.retrieve("", 100)).toHaveLength(0);
  });

  it("getStats() returns count and memoryType", async () => {
    await mem.add(makeItem({ importance: 0.7 }));
    const s = await mem.getStats();
    expect(s.count).toBe(1);
    expect(s.memoryType).toBe("episodic");
  });

  it("forget() removes low-importance items", async () => {
    await mem.add(makeItem({ importance: 0.05 }));
    await mem.add(makeItem({ importance: 0.9 }));
    const removed = await mem.forget("importance_based", 0.5);
    expect(removed).toBe(1);
  });

  it("forget() time_based removes old items", async () => {
    const old = makeItem({ timestamp: new Date(Date.now() - 40 * 86400000) });
    const recent = makeItem({ timestamp: new Date() });
    await mem.add(old);
    await mem.add(recent);
    const removed = await mem.forget("time_based", 0.1, 30);
    expect(removed).toBe(1);
  });

  it("enforces capacity by keeping high-importance items", async () => {
    const small = new EpisodicMemory({ maxCapacity: 2 });
    await small.add(makeItem({ id: "a", importance: 0.1 }));
    await small.add(makeItem({ id: "b", importance: 0.9 }));
    await small.add(makeItem({ id: "c", importance: 0.8 }));
    const s = await small.getStats();
    expect(Number(s.count)).toBeLessThanOrEqual(2);
  });
});

// ===========================================================================
// SemanticMemory
// ===========================================================================
describe("SemanticMemory", () => {
  let mem: SemanticMemory;
  beforeEach(() => {
    mem = new SemanticMemory({ maxCapacity: 50 });
  });

  it("add() returns item id", async () => {
    const item = makeItem({ memoryType: "semantic" });
    expect(await mem.add(item)).toBe(item.id);
  });

  it("hasMemory() true after add", async () => {
    const item = makeItem({ memoryType: "semantic" });
    await mem.add(item);
    expect(await mem.hasMemory(item.id)).toBe(true);
  });

  it("retrieve() returns items for matching query", async () => {
    await mem.add(makeItem({ content: "neural network architecture", memoryType: "semantic" }));
    const r = await mem.retrieve("neural network", 5);
    expect(r.length).toBeGreaterThan(0);
  });

  it("retrieve() returns empty for empty memory", async () => {
    expect(await mem.retrieve("query")).toHaveLength(0);
  });

  it("update() modifies item", async () => {
    const item = makeItem({ memoryType: "semantic" });
    await mem.add(item);
    expect(await mem.update(item.id, "updated semantic content")).toBe(true);
  });

  it("update() returns false for unknown id", async () => {
    expect(await mem.update("nope", "content")).toBe(false);
  });

  it("remove() deletes item", async () => {
    const item = makeItem({ memoryType: "semantic" });
    await mem.add(item);
    expect(await mem.remove(item.id)).toBe(true);
    expect(await mem.hasMemory(item.id)).toBe(false);
  });

  it("clear() empties memory", async () => {
    await mem.add(makeItem({ memoryType: "semantic" }));
    await mem.clear();
    expect(await mem.hasMemory("anything")).toBe(false);
  });

  it("getStats() returns correct memoryType", async () => {
    const s = await mem.getStats();
    expect(s.memoryType).toBe("semantic");
  });

  it("getStats() reports entitiesCount after add", async () => {
    await mem.add(makeItem({ content: "TypeScript React Node", memoryType: "semantic" }));
    const s = await mem.getStats();
    expect(Number(s.entitiesCount)).toBeGreaterThan(0);
  });

  it("works with external InMemoryVectorStore", async () => {
    const vectorStore = new InMemoryVectorStore();
    const sm = new SemanticMemory({}, { vectorStore });
    const item = makeItem({ memoryType: "semantic" });
    await sm.add(item);
    expect(await sm.hasMemory(item.id)).toBe(true);
  });

  it("works with external InMemoryGraphStore", async () => {
    const graphStore = new InMemoryGraphStore();
    const sm = new SemanticMemory({}, { graphStore });
    const item = makeItem({ content: "machine learning", memoryType: "semantic" });
    await sm.add(item);
    expect(await sm.hasMemory(item.id)).toBe(true);
  });
});

// ===========================================================================
// InMemoryStorage adapters
// ===========================================================================
describe("InMemoryKVStore", () => {
  it("put / get roundtrip", async () => {
    const store = new InMemoryKVStore<string>();
    await store.put("k", "v");
    expect(await store.get("k")).toBe("v");
  });

  it("get() returns null for unknown key", async () => {
    const store = new InMemoryKVStore<string>();
    expect(await store.get("nope")).toBeNull();
  });

  it("delete() removes key", async () => {
    const store = new InMemoryKVStore<string>();
    await store.put("k", "v");
    await store.delete("k");
    expect(await store.get("k")).toBeNull();
  });

  it("list() returns all values", async () => {
    const store = new InMemoryKVStore<number>();
    await store.put("a", 1);
    await store.put("b", 2);
    const vals = await store.list();
    expect(vals).toHaveLength(2);
  });

  it("list() respects limit", async () => {
    const store = new InMemoryKVStore<number>();
    for (let i = 0; i < 5; i++) await store.put(`k${i}`, i);
    expect(await store.list({ limit: 2 })).toHaveLength(2);
  });

  it("clear() empties store", async () => {
    const store = new InMemoryKVStore<string>();
    await store.put("k", "v");
    await store.clear();
    expect(await store.list()).toHaveLength(0);
  });

  it("health() returns true", async () => {
    expect(await new InMemoryKVStore().health()).toBe(true);
  });
});

describe("InMemoryVectorStore", () => {
  it("upsert and query by vector", async () => {
    const store = new InMemoryVectorStore();
    await store.upsertVector({ id: "a", vector: [1, 0, 0], payload: { label: "x" } });
    await store.upsertVector({ id: "b", vector: [0, 1, 0], payload: { label: "y" } });
    const results = await store.queryVector({ vector: [1, 0, 0], limit: 2 });
    expect(results[0]!.id).toBe("a");
  });

  it("deleteVector removes entry", async () => {
    const store = new InMemoryVectorStore();
    await store.upsertVector({ id: "a", vector: [1, 0], payload: {} });
    await store.deleteVector("a");
    const r = await store.queryVector({ vector: [1, 0], limit: 5 });
    expect(r.find(x => x.id === "a")).toBeUndefined();
  });

  it("health() returns true", async () => {
    expect(await new InMemoryVectorStore().health()).toBe(true);
  });
});

describe("InMemoryGraphStore", () => {
  it("upsertEntities and queryGraph finds by name", async () => {
    const store = new InMemoryGraphStore();
    await store.upsertEntities([{
      entityId: "e1", name: "python", entityType: "LANG",
      description: "", properties: {}, frequency: 1,
    }]);
    const r = await store.queryGraph({ queryText: "python", limit: 5 });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0]!.entityId).toBe("e1");
  });

  it("deleteByMemoryId removes entity", async () => {
    const store = new InMemoryGraphStore();
    await store.upsertEntities([{
      entityId: "m1", name: "test", entityType: "MEM",
      description: "", properties: {}, frequency: 1,
    }]);
    await store.deleteByMemoryId("m1");
    const r = await store.queryGraph({ queryText: "test", limit: 5 });
    expect(r.find(x => x.entityId === "m1")).toBeUndefined();
  });

  it("health() returns true", async () => {
    expect(await new InMemoryGraphStore().health()).toBe(true);
  });
});

// ===========================================================================
// MemoryManager
// ===========================================================================
describe("MemoryManager", () => {
  let manager: MemoryManager;
  beforeEach(() => {
    manager = new MemoryManager({
      userId: "tester",
      enableWorking: true,
      enableEpisodic: true,
      enableSemantic: true,
    });
  });

  it("addMemory() to working memory", async () => {
    const id = await manager.addMemory({ content: "hello world", memoryType: "working" });
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("addMemory() to episodic memory", async () => {
    const id = await manager.addMemory({ content: "episode 1", memoryType: "episodic" });
    expect(typeof id).toBe("string");
  });

  it("addMemory() to semantic memory", async () => {
    const id = await manager.addMemory({ content: "knowledge fact", memoryType: "semantic" });
    expect(typeof id).toBe("string");
  });

  it("retrieveMemories() finds added content", async () => {
    await manager.addMemory({ content: "TypeScript generics", memoryType: "working", importance: 0.8 });
    const results = await manager.retrieveMemories({ query: "TypeScript", limit: 5 });
    expect(results.length).toBeGreaterThan(0);
  });

  it("retrieveMemories() respects memoryTypes filter", async () => {
    await manager.addMemory({ content: "working item", memoryType: "working" });
    await manager.addMemory({ content: "episodic item", memoryType: "episodic" });
    const r = await manager.retrieveMemories({ query: "", memoryTypes: ["working"] });
    expect(r.every(m => m.memoryType === "working")).toBe(true);
  });

  it("updateMemory() modifies existing memory", async () => {
    const id = await manager.addMemory({ content: "old", memoryType: "working" });
    expect(await manager.updateMemory({ memoryId: id, content: "new" })).toBe(true);
  });

  it("updateMemory() returns false for unknown id", async () => {
    expect(await manager.updateMemory({ memoryId: "nope", content: "x" })).toBe(false);
  });

  it("removeMemory() deletes item", async () => {
    const id = await manager.addMemory({ content: "to remove", memoryType: "working" });
    expect(await manager.removeMemory(id)).toBe(true);
  });

  it("removeMemory() returns false for unknown id", async () => {
    expect(await manager.removeMemory("nope")).toBe(false);
  });

  it("clearAllMemories() empties all stores", async () => {
    await manager.addMemory({ content: "a", memoryType: "working" });
    await manager.addMemory({ content: "b", memoryType: "episodic" });
    await manager.clearAllMemories();
    const stats = await manager.getMemoryStats();
    expect(stats.totalMemories).toBe(0);
  });

  it("getMemoryStats() returns correct totals", async () => {
    await manager.addMemory({ content: "a", memoryType: "working" });
    await manager.addMemory({ content: "b", memoryType: "episodic" });
    const stats = await manager.getMemoryStats();
    expect(stats.totalMemories).toBe(2);
    expect(stats.enabledTypes).toContain("working");
    expect(stats.enabledTypes).toContain("episodic");
  });

  it("forgetMemories() removes low-importance items", async () => {
    await manager.addMemory({ content: "low", importance: 0.05, memoryType: "working" });
    await manager.addMemory({ content: "high", importance: 0.9, memoryType: "working" });
    const removed = await manager.forgetMemories({ strategy: "importance_based", threshold: 0.5 });
    expect(removed).toBeGreaterThan(0);
  });

  it("consolidateMemories() moves high-importance working items to episodic", async () => {
    await manager.addMemory({ content: "very important", importance: 0.9, memoryType: "working" });
    const moved = await manager.consolidateMemories({ fromType: "working", toType: "episodic", importanceThreshold: 0.8 });
    expect(moved).toBeGreaterThan(0);
  });

  it("addMemory() autoClassify high importance ?? semantic", async () => {
    const id = await manager.addMemory({ content: "critical fact", importance: 0.9, autoClassify: true });
    expect(typeof id).toBe("string");
  });

  it("addMemory() autoClassify medium importance ?? episodic", async () => {
    const id = await manager.addMemory({ content: "an event", importance: 0.65, autoClassify: true });
    expect(typeof id).toBe("string");
  });

  it("addMemory() autoClassify low importance ?? working", async () => {
    const id = await manager.addMemory({ content: "temp note", importance: 0.3, autoClassify: true });
    expect(typeof id).toBe("string");
  });

  it("throws when no memory types enabled", async () => {
    const empty = new MemoryManager({ enableWorking: false, enableEpisodic: false, enableSemantic: false });
    await expect(empty.addMemory({ content: "x" })).rejects.toThrow();
  });
});
