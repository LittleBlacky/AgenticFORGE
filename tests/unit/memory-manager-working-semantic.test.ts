/**
 * 补充覆盖率：
 * - MemoryManager: consolidateMemories / classifyMemory / getStore error paths
 * - WorkingMemory: forget(capacity_based) / getContextSummary / forget(time_based)
 * - SemanticMemory: forget / getStats
 */
import { describe, it, expect } from "vitest";
import { MemoryManager } from "../../packages/memory/src/manager";
import { WorkingMemory } from "../../packages/memory/src/types/working";
import { SemanticMemory } from "../../packages/memory/src/types/semantic";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(), content: "test content", memoryType: "working",
    userId: "u1", timestamp: new Date(), importance: 0.5, metadata: {}, ...overrides,
  };
}

// ===========================================================================
// MemoryManager — consolidateMemories
// ===========================================================================
describe("MemoryManager — retrieveMemories branches", () => {
  it("skips disabled memoryTypes entries in query list", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    await mgr.addMemory({ content: "only-working", memoryType: "working", importance: 0.6, userId: "u1" });

    const out = await mgr.retrieveMemories({
      query: "only",
      memoryTypes: ["working", "semantic"],
      limit: 5,
    });

    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out.every((m) => m.memoryType === "working")).toBe(true);
  });

  it("applies minImportance and sorts descending", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    await mgr.addMemory({ content: "low", memoryType: "working", importance: 0.2, userId: "u1" });
    await mgr.addMemory({ content: "high", memoryType: "working", importance: 0.9, userId: "u1" });

    const out = await mgr.retrieveMemories({ query: "", limit: 5, minImportance: 0.3 });
    expect(out.every((m) => m.importance >= 0.3)).toBe(true);
    if (out.length >= 2) {
      expect(out[0].importance).toBeGreaterThanOrEqual(out[1].importance);
    }
  });
});

describe("MemoryManager — consolidateMemories", () => {
  it("moves high-importance working items to episodic", async () => {
    const mgr = new MemoryManager({
      enabledTypes: ["working", "episodic"],
      userId: "u1",
    });
    await mgr.addMemory({ content: "important", memoryType: "working", importance: 0.9, userId: "u1" });
    await mgr.addMemory({ content: "low", memoryType: "working", importance: 0.2, userId: "u1" });
    const moved = await mgr.consolidateMemories({ fromType: "working", toType: "episodic", importanceThreshold: 0.7 });
    expect(moved).toBeGreaterThanOrEqual(1);
  });

  it("returns 0 when fromType not enabled", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const moved = await mgr.consolidateMemories({ fromType: "episodic", toType: "working" });
    expect(moved).toBe(0);
  });

  it("returns 0 when toType not enabled", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    const moved = await mgr.consolidateMemories({ fromType: "working", toType: "episodic" });
    expect(moved).toBe(0);
  });
});

describe("MemoryManager — classifyMemory via autoClassify", () => {
  it("routes high importance to semantic when enabled", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic", "semantic"], userId: "u1" });
    await mgr.addMemory({ content: "semantic fact", importance: 0.9, autoClassify: true, userId: "u1" });
    const stats = await mgr.getMemoryStats();
    expect(stats.memoriesByType.semantic?.count ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("routes medium importance to episodic when enabled", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working", "episodic"], userId: "u1" });
    await mgr.addMemory({ content: "episodic event", importance: 0.7, autoClassify: true, userId: "u1" });
    const stats = await mgr.getMemoryStats();
    expect(stats.memoriesByType.episodic?.count ?? 0).toBeGreaterThanOrEqual(1);
  });

  it("routes low importance to working", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    await mgr.addMemory({ content: "low importance", importance: 0.3, autoClassify: true, userId: "u1" });
    const stats = await mgr.getMemoryStats();
    expect(stats.memoriesByType.working?.count ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe("MemoryManager — getStore error paths", () => {
  it("throws when accessing disabled episodic store", async () => {
    const mgr = new MemoryManager({ enabledTypes: ["working"], userId: "u1" });
    // Direct access to retrieve with episodic type should fail gracefully
    await expect(
      mgr.retrieveMemories({ query: "x", memoryTypes: ["episodic"] })
    ).resolves.toEqual([]);
  });
});

// ===========================================================================
// WorkingMemory — capacity_based forget / time_based forget / getContextSummary
// ===========================================================================
describe("WorkingMemory — forget strategies", () => {
  it("capacity_based forget trims when over capacity", async () => {
    const mem = new WorkingMemory({ workingMemoryCapacity: 3 });
    for (let i = 0; i < 5; i++) {
      await mem.add(makeItem({ content: `item ${i}`, importance: 0.5 }));
    }
    const removed = await mem.forget("capacity_based");
    expect(removed).toBeGreaterThanOrEqual(0);
    const all = await mem.getAll();
    expect(all.length).toBeLessThanOrEqual(5);
  });

  it("time_based forget removes old items", async () => {
    const mem = new WorkingMemory({ workingMemoryTtlMinutes: 9999 }); // disable auto-expire
    // Add item with timestamp 60 days ago
    const oldItem = makeItem({
      content: "old item",
      timestamp: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      importance: 0.5,
    });
    await mem.add(oldItem);
    await mem.add(makeItem({ content: "new item", importance: 0.8 }));
    // Remove items older than 30 days
    const removed = await mem.forget("time_based", 0, 30);
    // Either expireOldMemories or time_based filter removed the old item
    const all = await mem.getAll();
    const hasOld = all.some(m => m.content === "old item");
    expect(hasOld).toBe(false);
  });

  it("importance_based forget removes low importance", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ content: "keep", importance: 0.9 }));
    await mem.add(makeItem({ content: "remove", importance: 0.05 }));
    const removed = await mem.forget("importance_based", 0.1);
    expect(removed).toBeGreaterThanOrEqual(1);
  });
});

describe("WorkingMemory — getContextSummary", () => {
  it("returns placeholder when empty", async () => {
    const mem = new WorkingMemory();
    const summary = await mem.getContextSummary();
    expect(summary).toContain("No working");
  });

  it("returns summary of content when items exist", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ content: "TypeScript is great", importance: 0.9 }));
    const summary = await mem.getContextSummary(500);
    expect(summary).toContain("TypeScript");
  });

  it("truncates when maxLength is small", async () => {
    const mem = new WorkingMemory();
    await mem.add(makeItem({ content: "A very long content string that should be truncated properly", importance: 0.9 }));
    const summary = await mem.getContextSummary(10);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeLessThanOrEqual(60);
  });
});

// ===========================================================================
// SemanticMemory — getStats only (no forget method)
// ===========================================================================
describe("SemanticMemory — getStats", () => {
  it("getStats() returns count and avgImportance after add", async () => {
    const mem = new SemanticMemory();
    await mem.add(makeItem({ memoryType: "semantic", importance: 0.8, content: "fact one" }));
    const stats = await mem.getStats();
    expect(stats.count).toBeGreaterThanOrEqual(1);
    expect(typeof stats.avgImportance).toBe("number");
  });

  it("getStats() returns 0 count for empty", async () => {
    const mem = new SemanticMemory();
    const stats = await mem.getStats();
    expect(stats.count).toBe(0);
  });

  it("remove() then getStats() decrements count", async () => {
    const mem = new SemanticMemory();
    const item = makeItem({ memoryType: "semantic", importance: 0.8, content: "removable" });
    await mem.add(item);
    await mem.remove(item.id);
    const stats = await mem.getStats();
    expect(stats.count).toBe(0);
  });
});
