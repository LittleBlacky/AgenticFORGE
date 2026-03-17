import {BaseMemory, type MemoryConfig, type MemoryItem} from "./base";

export interface Episode {
  episodeId: string;
  title: string;
  memoryIds: string[];
  startTime: Date;
  endTime: Date;
  summary: string;
  importance: number;
}

export class EpisodicMemory extends BaseMemory {
  private readonly memories: MemoryItem[] = [];
  private readonly episodes: Episode[] = [];

  constructor(config: Partial<MemoryConfig> = {}) {
    super(config);
  }

  async add(memoryItem: MemoryItem): Promise<string> {
    this.memories.push(memoryItem);
    return memoryItem.id;
  }

  async retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): Promise<MemoryItem[]> {
    const userId = typeof options.userId === "string" ? options.userId : undefined;
    const q = query.trim().toLowerCase();

    const filtered = userId
      ? this.memories.filter((m) => m.userId === userId)
      : this.memories;

    if (!q) {
      return filtered
        .slice()
        .sort((a, b) => b.importance - a.importance)
        .slice(0, Math.max(1, Math.floor(limit)));
    }

    const scored = filtered
      .map((m) => {
        const text = m.content.toLowerCase();
        const relevance = text.includes(q)
          ? q.length / Math.max(text.length, 1)
          : jaccard(q.split(/\s+/g), text.split(/\s+/g));
        const timeDecay = timeDecayFactor(m.timestamp);
        return {score: relevance * timeDecay * (0.8 + m.importance * 0.4), item: m};
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored
      .slice(0, Math.max(1, Math.floor(limit)))
      .map((x) => x.item);
  }

  async update(
    memoryId: string,
    content?: string,
    importance?: number,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;
    const old = this.memories[idx];
    this.memories[idx] = {
      ...old,
      content: content ?? old.content,
      importance: typeof importance === "number" ? clamp01(importance) : old.importance,
      metadata: metadata ? {...old.metadata, ...metadata} : old.metadata,
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
    this.memories.length = 0;
    this.episodes.length = 0;
  }

  async getStats(): Promise<Record<string, unknown>> {
    const avgImportance = this.memories.length
      ? this.memories.reduce((acc, m) => acc + m.importance, 0) / this.memories.length
      : 0;
    return {
      count: this.memories.length,
      episodesCount: this.episodes.length,
      avgImportance,
      memoryType: "episodic",
    };
  }

  async forget(
    strategy = "importance_based",
    threshold = 0.1,
    maxAgeDays = 30,
  ): Promise<number> {
    const before = this.memories.length;
    if (strategy === "importance_based") {
      const kept = this.memories.filter((m) => m.importance >= threshold);
      this.memories.length = 0;
      this.memories.push(...kept);
    } else if (strategy === "time_based") {
      const cutoff = Date.now() - maxAgeDays * 86400000;
      const kept = this.memories.filter((m) => m.timestamp.getTime() >= cutoff);
      this.memories.length = 0;
      this.memories.push(...kept);
    }
    return before - this.memories.length;
  }
}

function timeDecayFactor(timestamp: Date): number {
  const hoursPassed = (Date.now() - timestamp.getTime()) / 3600000;
  return Math.max(0.1, 0.95 ** (hoursPassed / 24));
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a.filter(Boolean));
  const sb = new Set(b.filter(Boolean));
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union > 0 ? (inter / union) * 0.6 : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}
