/**
 * @agenticforge/memory — PerceptualMemory 单元测试
 */
import { describe, it, expect, beforeEach } from "vitest";
import { PerceptualMemory } from "../../packages/memory/src/types/perceptual";
import { randomUUID } from "node:crypto";
import type { MemoryItem } from "../../packages/memory/src/types/base";

function makeItem(overrides: Partial<MemoryItem> = {}): MemoryItem {
  return {
    id: randomUUID(),
    content: "test perception content",
    memoryType: "perceptual",
    userId: "user1",
    timestamp: new Date(),
    importance: 0.6,
    metadata: { modality: "text" },
    ...overrides,
  };
}

describe("PerceptualMemory", () => {
  let memory: PerceptualMemory;

  beforeEach(() => {
    memory = new PerceptualMemory(
      { perceptualMemoryModalities: ["text", "image", "audio"] },
    );
  });

  // -------------------------------------------------------------------------
  // add()
  // -------------------------------------------------------------------------
  it("add() stores item and returns id", async () => {
    const item = makeItem();
    const id = await memory.add(item);
    expect(id).toBe(item.id);
  });

  it("add() throws for unsupported modality", async () => {
    const item = makeItem({ metadata: { modality: "video" } });
    await expect(memory.add(item)).rejects.toThrow("不支持的模态类型");
  });

  it("add() stores image modality item", async () => {
    const item = makeItem({ metadata: { modality: "image", raw_data: "base64data" } });
    const id = await memory.add(item);
    expect(id).toBe(item.id);
  });

  // -------------------------------------------------------------------------
  // hasMemory()
  // -------------------------------------------------------------------------
  it("hasMemory() returns true after add", async () => {
    const item = makeItem();
    await memory.add(item);
    expect(await memory.hasMemory(item.id)).toBe(true);
  });

  it("hasMemory() returns false for unknown id", async () => {
    expect(await memory.hasMemory("nonexistent")).toBe(false);
  });

  // -------------------------------------------------------------------------
  // retrieve()
  // -------------------------------------------------------------------------
  it("retrieve() returns array", async () => {
    const item = makeItem();
    await memory.add(item);
    const results = await memory.retrieve("test", 5);
    expect(Array.isArray(results)).toBe(true);
  });

  it("retrieve() returns empty array when nothing stored", async () => {
    const results = await memory.retrieve("anything", 5);
    expect(results).toHaveLength(0);
  });

  it("retrieve() filters by targetModality", async () => {
    await memory.add(makeItem({ id: "t1", metadata: { modality: "text" } }));
    await memory.add(makeItem({ id: "i1", metadata: { modality: "image", raw_data: "img" } }));
    const results = await memory.retrieve("test", 5, { targetModality: "image" });
    expect(results.every(r => r.metadata.modality === "image")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // update()
  // -------------------------------------------------------------------------
  it("update() returns true for existing item", async () => {
    const item = makeItem();
    await memory.add(item);
    const ok = await memory.update(item.id, "updated content");
    expect(ok).toBe(true);
  });

  it("update() returns false for unknown id", async () => {
    expect(await memory.update("nope", "content")).toBe(false);
  });

  it("update() changes importance", async () => {
    const item = makeItem({ importance: 0.3 });
    await memory.add(item);
    await memory.update(item.id, undefined, 0.9);
    const results = await memory.retrieve(item.content, 1);
    expect(results[0]!.importance).toBe(0.9);
  });

  // -------------------------------------------------------------------------
  // remove()
  // -------------------------------------------------------------------------
  it("remove() returns true for existing item", async () => {
    const item = makeItem();
    await memory.add(item);
    expect(await memory.remove(item.id)).toBe(true);
  });

  it("remove() returns false for unknown id", async () => {
    expect(await memory.remove("nope")).toBe(false);
  });

  it("remove() makes hasMemory() return false", async () => {
    const item = makeItem();
    await memory.add(item);
    await memory.remove(item.id);
    expect(await memory.hasMemory(item.id)).toBe(false);
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------
  it("clear() empties all stored perceptions", async () => {
    await memory.add(makeItem());
    await memory.add(makeItem());
    await memory.clear();
    expect(await memory.retrieve("anything", 10)).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // getStats()
  // -------------------------------------------------------------------------
  it("getStats() returns count and memoryType", async () => {
    await memory.add(makeItem());
    const stats = await memory.getStats();
    expect(stats.count).toBe(1);
    expect(stats.memoryType).toBe("perceptual");
  });

  it("getStats() returns 0 for empty memory", async () => {
    const stats = await memory.getStats();
    expect(stats.count).toBe(0);
    expect(stats.avgImportance).toBe(0);
  });

  // -------------------------------------------------------------------------
  // getByModality()
  // -------------------------------------------------------------------------
  it("getByModality() returns items of specified modality", async () => {
    await memory.add(makeItem({ id: "t1", metadata: { modality: "text" } }));
    await memory.add(makeItem({ id: "t2", metadata: { modality: "text" } }));
    await memory.add(makeItem({ id: "i1", metadata: { modality: "image", raw_data: "img" } }));
    const textItems = await memory.getByModality("text", 10);
    expect(textItems.every(m => m.metadata.modality === "text")).toBe(true);
    expect(textItems).toHaveLength(2);
  });

  it("getByModality() returns empty for unused modality", async () => {
    await memory.add(makeItem({ metadata: { modality: "text" } }));
    const audioItems = await memory.getByModality("audio", 10);
    expect(audioItems).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // generateContent()
  // -------------------------------------------------------------------------
  it("generateContent() returns null for unsupported modality", async () => {
    const result = await memory.generateContent("prompt", "video" as any);
    expect(result).toBeNull();
  });

  it("generateContent() returns null when no relevant memories", async () => {
    const result = await memory.generateContent("prompt", "text");
    expect(result).toBeNull();
  });

  it("generateContent() returns string for text modality with memories", async () => {
    await memory.add(makeItem({ content: "relevant content" }));
    const result = await memory.generateContent("relevant", "text");
    expect(typeof result).toBe("string");
  });

  it("generateContent() returns non-text modality description", async () => {
    await memory.add(makeItem({ id: "i1", metadata: { modality: "image", raw_data: "img" } }));
    const result = await memory.generateContent("image", "image");
    expect(result).toContain("image");
  });

  // -------------------------------------------------------------------------
  // crossModalSearch()
  // -------------------------------------------------------------------------
  it("crossModalSearch() returns array", async () => {
    await memory.add(makeItem());
    const results = await memory.crossModalSearch("query", "text", "text", 3);
    expect(Array.isArray(results)).toBe(true);
  });
});
