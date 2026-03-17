import {BaseMemory, type MemoryConfig, type MemoryItem} from "./base";

export class WorkingMemory extends BaseMemory {
  private readonly maxCapacity: number;
  private readonly maxTokens: number;
  private readonly maxAgeMinutes: number;
  private currentTokens = 0;
  private readonly sessionStart = new Date();
  private memories: MemoryItem[] = [];

  constructor(config: Partial<MemoryConfig> = {}) {
    super(config);
    this.maxCapacity = this.config.workingMemoryCapacity;
    this.maxTokens = this.config.workingMemoryTokens;
    this.maxAgeMinutes = this.config.workingMemoryTtlMinutes;
  }

  async add(memoryItem: MemoryItem): Promise<string> {
    this.expireOldMemories();
    this.memories.push(memoryItem);
    this.currentTokens += tokenLen(memoryItem.content);
    this.enforceCapacityLimits();
    return memoryItem.id;
  }

  async retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): Promise<MemoryItem[]> {
    this.expireOldMemories();
    if (this.memories.length === 0) return [];

    const userId =
      typeof options.userId === "string" ? options.userId : undefined;
    const filtered = userId
      ? this.memories.filter((m) => m.userId === userId)
      : this.memories;
    const q = query.trim().toLowerCase();

    const scored = filtered
      .map((m) => {
        const relevance = this.keywordScore(q, m.content.toLowerCase());
        const timeDecay = this.calculateTimeDecay(m.timestamp);
        const importanceWeight = 0.8 + m.importance * 0.4;
        return {score: relevance * timeDecay * importanceWeight, item: m};
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, Math.max(1, Math.floor(limit))).map((x) => x.item);
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
    const oldTokens = tokenLen(old.content);
    const next: MemoryItem = {
      ...old,
      content: content ?? old.content,
      importance:
        typeof importance === "number" ? clamp01(importance) : old.importance,
      metadata: metadata ? {...old.metadata, ...metadata} : old.metadata,
    };

    this.memories[idx] = next;
    this.currentTokens = Math.max(
      0,
      this.currentTokens - oldTokens + tokenLen(next.content),
    );
    this.enforceCapacityLimits();
    return true;
  }

  async remove(memoryId: string): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;
    const [removed] = this.memories.splice(idx, 1);
    this.currentTokens = Math.max(
      0,
      this.currentTokens - tokenLen(removed.content),
    );
    return true;
  }

  async hasMemory(memoryId: string): Promise<boolean> {
    return this.memories.some((m) => m.id === memoryId);
  }

  async clear(): Promise<void> {
    this.memories = [];
    this.currentTokens = 0;
  }

  async getStats(): Promise<Record<string, unknown>> {
    this.expireOldMemories();
    const avgImportance = this.memories.length
      ? this.memories.reduce((acc, cur) => acc + cur.importance, 0) /
        this.memories.length
      : 0;

    return {
      count: this.memories.length,
      forgottenCount: 0,
      totalCount: this.memories.length,
      currentTokens: this.currentTokens,
      maxCapacity: this.maxCapacity,
      maxTokens: this.maxTokens,
      maxAgeMinutes: this.maxAgeMinutes,
      sessionDurationMinutes:
        (Date.now() - this.sessionStart.getTime()) / 60000,
      avgImportance,
      capacityUsage:
        this.maxCapacity > 0 ? this.memories.length / this.maxCapacity : 0,
      tokenUsage: this.maxTokens > 0 ? this.currentTokens / this.maxTokens : 0,
      memoryType: "working",
    };
  }

  async forget(
    strategy = "importance_based",
    threshold = 0.1,
    maxAgeDays = 1,
  ): Promise<number> {
    this.expireOldMemories();
    const before = this.memories.length;

    if (strategy === "importance_based") {
      this.memories = this.memories.filter((m) => m.importance >= threshold);
    } else if (strategy === "time_based") {
      const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
      this.memories = this.memories.filter(
        (m) => m.timestamp.getTime() >= cutoff,
      );
    } else if (
      strategy === "capacity_based" &&
      this.memories.length > this.maxCapacity
    ) {
      this.memories.sort(
        (a, b) => this.calculatePriority(b) - this.calculatePriority(a),
      );
      this.memories = this.memories.slice(0, this.maxCapacity);
    }

    this.currentTokens = this.memories.reduce(
      (acc, m) => acc + tokenLen(m.content),
      0,
    );
    return before - this.memories.length;
  }

  async getRecent(limit = 10): Promise<MemoryItem[]> {
    return this.memories
      .slice()
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, Math.max(1, Math.floor(limit)));
  }

  async getImportant(limit = 10): Promise<MemoryItem[]> {
    return this.memories
      .slice()
      .sort((a, b) => b.importance - a.importance)
      .slice(0, Math.max(1, Math.floor(limit)));
  }

  async getAll(): Promise<MemoryItem[]> {
    return this.memories.slice();
  }

  async getContextSummary(maxLength = 500): Promise<string> {
    if (!this.memories.length) return "No working memories available.";

    const sorted = this.memories
      .slice()
      .sort((a, b) => this.calculatePriority(b) - this.calculatePriority(a));

    const chunks: string[] = [];
    let current = 0;
    for (const m of sorted) {
      const content = m.content;
      if (current + content.length <= maxLength) {
        chunks.push(content);
        current += content.length;
      } else {
        const remain = maxLength - current;
        if (remain > 50) chunks.push(`${content.slice(0, remain)}...`);
        break;
      }
    }

    return `Working Memory Context:\n${chunks.join("\n")}`;
  }

  private keywordScore(query: string, content: string): number {
    if (!query) return 0.1;
    if (content.includes(query))
      return Math.max(0.2, query.length / Math.max(content.length, 1));

    const qWords = new Set(query.split(/\s+/g).filter(Boolean));
    const cWords = new Set(content.split(/\s+/g).filter(Boolean));
    const inter = [...qWords].filter((w) => cWords.has(w)).length;
    const union = new Set([...qWords, ...cWords]).size;
    return union > 0 ? (inter / union) * 0.8 : 0;
  }

  private calculatePriority(memory: MemoryItem): number {
    return memory.importance * this.calculateTimeDecay(memory.timestamp);
  }

  private calculateTimeDecay(timestamp: Date): number {
    const hoursPassed = (Date.now() - timestamp.getTime()) / 3600000;
    const decay = this.config.decayFactor ** (hoursPassed / 6);
    return Math.max(0.1, decay);
  }

  private enforceCapacityLimits(): void {
    while (
      this.memories.length > this.maxCapacity ||
      this.currentTokens > this.maxTokens
    ) {
      this.removeLowestPriorityMemory();
      if (this.memories.length === 0) break;
    }
  }

  private expireOldMemories(): void {
    if (!this.memories.length) return;
    const cutoff = Date.now() - this.maxAgeMinutes * 60 * 1000;
    const kept = this.memories.filter((m) => m.timestamp.getTime() >= cutoff);
    if (kept.length === this.memories.length) return;
    this.memories = kept;
    this.currentTokens = kept.reduce((acc, m) => acc + tokenLen(m.content), 0);
  }

  private removeLowestPriorityMemory(): void {
    if (!this.memories.length) return;
    let lowestIdx = 0;
    let lowest = Number.POSITIVE_INFINITY;

    for (let i = 0; i < this.memories.length; i += 1) {
      const p = this.calculatePriority(this.memories[i]);
      if (p < lowest) {
        lowest = p;
        lowestIdx = i;
      }
    }

    const [removed] = this.memories.splice(lowestIdx, 1);
    this.currentTokens = Math.max(
      0,
      this.currentTokens - tokenLen(removed.content),
    );
  }
}

function tokenLen(text: string): number {
  return text.split(/\s+/g).filter(Boolean).length;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}
