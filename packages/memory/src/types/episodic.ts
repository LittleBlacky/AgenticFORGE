import { BaseMemory, type MemoryConfig, type MemoryItem } from "./base";

export interface Episode {
  id: string;
  content: string;
  timestamp: Date;
  importance: number;
  metadata: Record<string, unknown>;
}

export class EpisodicMemory extends BaseMemory {
  private memories: MemoryItem[] = [];

  constructor(config: Partial<MemoryConfig> = {}) {
    super(config);
  }

  async add(memoryItem: MemoryItem): Promise<string> {
    this.memories.push(memoryItem);
    this.enforceCapacity();
    return memoryItem.id;
  }

  async retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): Promise<MemoryItem[]> {
    if (!this.memories.length) return [];
    const userId = typeof options.userId === "string" ? options.userId : undefined;
    const minImportance = typeof options.minImportance === "number" ? options.minImportance : 0;
    const filtered = this.memories.filter(
      (m) => (!userId || m.userId === userId) && m.importance >= minImportance,
    );
    const q = query.trim().toLowerCase();
    const scored = filtered
      .map((m) => ({
        score: q
          ? this.relevanceScore(q, m.content.toLowerCase()) * (0.5 + m.importance * 0.5)
          : m.importance,
        item: m,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, limit)).map((x) => x.item);
  }

  async update(
    memoryId: string,
    content?: string,
    importance?: number,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;
    const old = this.memories[idx]!;
    this.memories[idx] = {
      ...old,
      content: content ?? old.content,
      importance:
        typeof importance === "number" ? Math.max(0, Math.min(1, importance)) : old.importance,
      metadata: metadata ? { ...old.metadata, ...metadata } : old.metadata,
    };
    return true;
  }

  async remove(memoryId: string): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;
    this.memories.splice(idx, 1);
    return true;
  }

  async hasMemory(memoryId: string): Promise<boolean> {
    return this.memories.some((m) => m.id === memoryId);
  }

  async clear(): Promise<void> {
    this.memories = [];
  }

  async getStats(): Promise<Record<string, unknown>> {
    const avgImportance = this.memories.length
      ? this.memories.reduce((a, m) => a + m.importance, 0) / this.memories.length
      : 0;
    return {
      count: this.memories.length,
      avgImportance,
      maxCapacity: this.config.maxCapacity,
      memoryType: "episodic",
    };
  }

  async forget(strategy = "importance_based", threshold = 0.1, maxAgeDays = 30): Promise<number> {
    const before = this.memories.length;
    if (strategy === "importance_based") {
      this.memories = this.memories.filter((m) => m.importance >= threshold);
    } else if (strategy === "time_based") {
      const cutoff = Date.now() - maxAgeDays * 86400000;
      this.memories = this.memories.filter((m) => m.timestamp.getTime() >= cutoff);
    } else if (strategy === "capacity_based") {
      this.memories.sort((a, b) => b.importance - a.importance);
      this.memories = this.memories.slice(0, this.config.maxCapacity);
    }
    return before - this.memories.length;
  }

  async consolidate(toType: string, importanceThreshold = 0.7): Promise<MemoryItem[]> {
    return this.memories.filter((m) => m.importance >= importanceThreshold);
  }

  private enforceCapacity(): void {
    if (this.memories.length > this.config.maxCapacity) {
      this.memories.sort((a, b) => b.importance - a.importance);
      this.memories = this.memories.slice(0, this.config.maxCapacity);
    }
  }

  private relevanceScore(query: string, content: string): number {
    if (!query) return 0.1;
    if (content.includes(query)) return Math.max(0.2, query.length / Math.max(content.length, 1));
    const qw = new Set(query.split(/\s+/).filter(Boolean));
    const cw = new Set(content.split(/\s+/).filter(Boolean));
    const inter = [...qw].filter((w) => cw.has(w)).length;
    const union = new Set([...qw, ...cw]).size;
    return union > 0 ? (inter / union) * 0.8 : 0;
  }
}
