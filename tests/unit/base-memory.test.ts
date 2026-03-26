/**
 * @agenticforge/memory — BaseMemory 工具方法测试
 * 覆盖：generateId, calculateImportance, DEFAULT_MEMORY_CONFIG
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_MEMORY_CONFIG, BaseMemory } from "../../packages/memory/src/types/base";
import type { MemoryItem } from "../../packages/memory/src/types/base";

// Concrete subclass to test abstract BaseMemory
class TestMemory extends BaseMemory {
  private items: MemoryItem[] = [];

  constructor(config = {}) {
    super(config);
  }

  async add(item: MemoryItem): Promise<string> {
    this.items.push(item);
    return item.id;
  }
  async retrieve(): Promise<MemoryItem[]> {
    return this.items;
  }
  async update(id: string, content?: string): Promise<boolean> {
    const i = this.items.findIndex((m) => m.id === id);
    if (i < 0) return false;
    if (content) this.items[i]!.content = content;
    return true;
  }
  async remove(id: string): Promise<boolean> {
    const i = this.items.findIndex((m) => m.id === id);
    if (i < 0) return false;
    this.items.splice(i, 1);
    return true;
  }
  async hasMemory(id: string): Promise<boolean> {
    return this.items.some((m) => m.id === id);
  }
  async clear(): Promise<void> {
    this.items = [];
  }
  async getStats(): Promise<Record<string, unknown>> {
    return { count: this.items.length };
  }

  // Expose protected methods for testing
  testGenerateId() {
    return this.generateId();
  }
  testCalculateImportance(content: string, base?: number) {
    return this.calculateImportance(content, base);
  }
}

describe("DEFAULT_MEMORY_CONFIG", () => {
  it("has expected default values", () => {
    expect(DEFAULT_MEMORY_CONFIG.maxCapacity).toBe(100);
    expect(DEFAULT_MEMORY_CONFIG.workingMemoryCapacity).toBe(10);
    expect(DEFAULT_MEMORY_CONFIG.decayFactor).toBe(0.95);
    expect(DEFAULT_MEMORY_CONFIG.importanceThreshold).toBe(0.1);
  });
});

describe("BaseMemory — generateId()", () => {
  it("returns a UUID string", () => {
    const m = new TestMemory();
    const id = m.testGenerateId();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(10);
  });

  it("returns unique IDs on each call", () => {
    const m = new TestMemory();
    expect(m.testGenerateId()).not.toBe(m.testGenerateId());
  });
});

describe("BaseMemory — calculateImportance()", () => {
  it("returns base importance for short neutral content", () => {
    const m = new TestMemory();
    expect(m.testCalculateImportance("hello", 0.5)).toBe(0.5);
  });

  it("adds 0.1 for content longer than 100 chars", () => {
    const m = new TestMemory();
    const long = "x".repeat(101);
    expect(m.testCalculateImportance(long, 0.5)).toBeCloseTo(0.6);
  });

  it("adds 0.2 for content with keyword '重要'", () => {
    const m = new TestMemory();
    expect(m.testCalculateImportance("这是重要信息", 0.5)).toBeCloseTo(0.7);
  });

  it("adds 0.2 for content with keyword '错误'", () => {
    const m = new TestMemory();
    expect(m.testCalculateImportance("发生了错误", 0.5)).toBeCloseTo(0.7);
  });

  it("clamps result to max 1.0", () => {
    const m = new TestMemory();
    const result = m.testCalculateImportance("重要".repeat(5) + "x".repeat(200), 0.9);
    expect(result).toBeLessThanOrEqual(1.0);
  });

  it("clamps result to min 0.0", () => {
    const m = new TestMemory();
    const result = m.testCalculateImportance("ok", -1.0);
    expect(result).toBeGreaterThanOrEqual(0.0);
  });

  it("uses 0.5 as default base importance", () => {
    const m = new TestMemory();
    expect(m.testCalculateImportance("short")).toBe(0.5);
  });

  it("merges both long-content and keyword bonus", () => {
    const m = new TestMemory();
    const content = "关键" + "x".repeat(101);
    expect(m.testCalculateImportance(content, 0.5)).toBeCloseTo(0.8);
  });
});

describe("BaseMemory — config merging", () => {
  it("merges partial config with defaults", () => {
    const m = new TestMemory({ maxCapacity: 50 });
    expect((m as any).config.maxCapacity).toBe(50);
    expect((m as any).config.decayFactor).toBe(0.95); // default preserved
  });
});
