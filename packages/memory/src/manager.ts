import { randomUUID } from "node:crypto";
import type { MemoryType, MemoryItem, MemoryConfig } from "./types/base";
import { WorkingMemory } from "./types/working";
import { EpisodicMemory } from "./types/episodic";
import { SemanticMemory } from "./types/semantic";
import { PerceptualMemory } from "./types/perceptual";
import type { MemoryStorageAdapters } from "./storage/types";

export interface MemoryManagerOptions {
  userId?: string;
  config?: Partial<MemoryConfig>;
  enableWorking?: boolean;
  enableEpisodic?: boolean;
  enableSemantic?: boolean;
  enablePerceptual?: boolean;
  adapters?: MemoryStorageAdapters;
}

export interface AddMemoryOptions {
  content: string;
  memoryType?: MemoryType;
  importance?: number;
  metadata?: Record<string, unknown>;
  autoClassify?: boolean;
}

export interface RetrieveMemoriesOptions {
  query: string;
  limit?: number;
  memoryTypes?: MemoryType[];
  minImportance?: number;
  userId?: string;
}

export interface UpdateMemoryOptions {
  memoryId: string;
  content?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export interface ForgetMemoriesOptions {
  strategy?: "importance_based" | "time_based" | "capacity_based";
  threshold?: number;
  maxAgeDays?: number;
}

export interface ConsolidateMemoriesOptions {
  fromType?: MemoryType;
  toType?: MemoryType;
  importanceThreshold?: number;
}

export interface MemoryTypeStats {
  count: number;
  avgImportance: number;
}

export interface MemoryStats {
  totalMemories: number;
  enabledTypes: MemoryType[];
  memoriesByType: Partial<Record<MemoryType, MemoryTypeStats>>;
}

/**
 * High-level facade over all memory subsystems.
 * Manages working, episodic, semantic, and perceptual memories.
 */
export class MemoryManager {
  private readonly userId: string;
  private readonly enabledTypes: Set<MemoryType>;

  private readonly working?: WorkingMemory;
  private readonly episodic?: EpisodicMemory;
  private readonly semantic?: SemanticMemory;
  private readonly perceptual?: PerceptualMemory;

  constructor(options: MemoryManagerOptions = {}) {
    this.userId = options.userId ?? "default_user";

    const cfg = options.config ?? {};
    const adapters = options.adapters ?? {};

    this.enabledTypes = new Set<MemoryType>();

    if (options.enableWorking !== false) {
      this.working = new WorkingMemory(cfg);
      this.enabledTypes.add("working");
    }
    if (options.enableEpisodic !== false) {
      this.episodic = new EpisodicMemory(cfg);
      this.enabledTypes.add("episodic");
    }
    if (options.enableSemantic !== false) {
      this.semantic = new SemanticMemory(cfg, {
        vectorStore: adapters.vectorStore,
        graphStore: adapters.graphStore,
        kvStore: adapters.kvStore,
      });
      this.enabledTypes.add("semantic");
    }
    if (options.enablePerceptual) {
      this.perceptual = new PerceptualMemory(cfg, {
        vectorStore: adapters.vectorStore,
        blobStore: adapters.blobStore,
        kvStore: adapters.kvStore,
      });
      this.enabledTypes.add("perceptual");
    }
  }

  // ---------------------------------------------------------------------------
  // Add
  // ---------------------------------------------------------------------------

  async addMemory(options: AddMemoryOptions): Promise<string> {
    const { content, importance = 0.5, metadata = {}, autoClassify = false } = options;

    let memoryType: MemoryType = options.memoryType ?? "working";

    if (autoClassify) {
      memoryType = this.classifyMemory(content, importance);
    }

    if (!this.enabledTypes.has(memoryType)) {
      // fall back to first enabled type
      const fallback = [...this.enabledTypes][0];
      if (!fallback) throw new Error("No memory types enabled");
      memoryType = fallback;
    }

    const item: MemoryItem = {
      id: randomUUID(),
      content,
      memoryType,
      userId: this.userId,
      timestamp: new Date(),
      importance: clamp01(importance),
      metadata,
    };

    return this.getStore(memoryType).add(item);
  }

  // ---------------------------------------------------------------------------
  // Retrieve
  // ---------------------------------------------------------------------------

  async retrieveMemories(options: RetrieveMemoriesOptions): Promise<MemoryItem[]> {
    const { query, limit = 5, minImportance = 0 } = options;
    const types = options.memoryTypes ?? [...this.enabledTypes];
    const allResults: MemoryItem[] = [];

    for (const type of types) {
      if (!this.enabledTypes.has(type)) continue;
      const results = await this.getStore(type).retrieve(query, limit, {
        userId: options.userId ?? this.userId,
      });
      allResults.push(...results);
    }

    return allResults
      .filter((m: MemoryItem) => m.importance >= minImportance)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Update / Remove
  // ---------------------------------------------------------------------------

  async updateMemory(options: UpdateMemoryOptions): Promise<boolean> {
    for (const type of this.enabledTypes) {
      const store = this.getStore(type);
      if (await store.hasMemory(options.memoryId)) {
        return store.update(
          options.memoryId,
          options.content,
          options.importance,
          options.metadata,
        );
      }
    }
    return false;
  }

  async removeMemory(memoryId: string): Promise<boolean> {
    for (const type of this.enabledTypes) {
      const store = this.getStore(type);
      if (await store.hasMemory(memoryId)) {
        return store.remove(memoryId);
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Forget / Consolidate / Clear
  // ---------------------------------------------------------------------------

  async forgetMemories(options: ForgetMemoriesOptions): Promise<number> {
    const strategy = options.strategy ?? "importance_based";
    const threshold = options.threshold ?? 0.1;
    const maxAgeDays = options.maxAgeDays ?? 30;
    let total = 0;

    for (const type of this.enabledTypes) {
      const store = this.getStore(type);
      if (typeof (store as WorkingMemory)["forget"] === "function") {
        total += await (store as WorkingMemory).forget(strategy, threshold, maxAgeDays);
      }
    }
    return total;
  }

  async consolidateMemories(options: ConsolidateMemoriesOptions): Promise<number> {
    const fromType = options.fromType ?? "working";
    const toType = options.toType ?? "episodic";
    const threshold = options.importanceThreshold ?? 0.7;

    if (!this.enabledTypes.has(fromType) || !this.enabledTypes.has(toType)) {
      return 0;
    }

    const fromStore = this.getStore(fromType);
    const toStore = this.getStore(toType);

    // Retrieve high-importance items from source
    const items = await fromStore.retrieve("", 100, { userId: this.userId });
    const eligible = items.filter((m: MemoryItem) => m.importance >= threshold);

    let count = 0;
    for (const item of eligible) {
      const newItem: MemoryItem = {
        ...item,
        id: randomUUID(),
        memoryType: toType,
      };
      await toStore.add(newItem);
      await fromStore.remove(item.id);
      count++;
    }
    return count;
  }

  async clearAllMemories(): Promise<void> {
    for (const type of this.enabledTypes) {
      await this.getStore(type).clear();
    }
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  async getMemoryStats(): Promise<MemoryStats> {
    let total = 0;
    const memoriesByType: Partial<Record<MemoryType, MemoryTypeStats>> = {};

    for (const type of this.enabledTypes) {
      const stats = await this.getStore(type).getStats();
      const count = typeof stats.count === "number" ? stats.count : 0;
      const avgImportance = typeof stats.avgImportance === "number" ? stats.avgImportance : 0;
      memoriesByType[type] = { count, avgImportance };
      total += count;
    }

    return {
      totalMemories: total,
      enabledTypes: [...this.enabledTypes],
      memoriesByType,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private getStore(
    type: MemoryType,
  ): WorkingMemory | EpisodicMemory | SemanticMemory | PerceptualMemory {
    switch (type) {
      case "working":
        if (!this.working) throw new Error("Working memory not enabled");
        return this.working;
      case "episodic":
        if (!this.episodic) throw new Error("Episodic memory not enabled");
        return this.episodic;
      case "semantic":
        if (!this.semantic) throw new Error("Semantic memory not enabled");
        return this.semantic;
      case "perceptual":
        if (!this.perceptual) throw new Error("Perceptual memory not enabled");
        return this.perceptual;
    }
  }

  private classifyMemory(content: string, importance: number): MemoryType {
    if (importance >= 0.8 && this.enabledTypes.has("semantic")) return "semantic";
    if (importance >= 0.6 && this.enabledTypes.has("episodic")) return "episodic";
    return this.enabledTypes.has("working") ? "working" : ([...this.enabledTypes][0] ?? "working");
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}
