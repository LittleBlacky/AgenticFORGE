import {randomUUID} from "node:crypto";
import {
  DEFAULT_MEMORY_CONFIG,
  type MemoryConfig,
  type MemoryItem,
  type MemoryType,
} from "./types/base";
import {WorkingMemory} from "./types/working";
import {EpisodicMemory} from "./types/episodic";
import {SemanticMemory} from "./types/semantic";
import {PerceptualMemory} from "./types/perceptual";

export type {MemoryConfig, MemoryItem, MemoryType} from "./types/base";

export interface RetrieveMemoriesOptions {
  query: string;
  memoryTypes?: MemoryType[];
  limit?: number;
  minImportance?: number;
  timeRange?: [Date, Date];
}

export interface AddMemoryOptions {
  content: string;
  memoryType?: MemoryType;
  importance?: number;
  metadata?: Record<string, unknown>;
  autoClassify?: boolean;
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
  userId: string;
  enabledTypes: MemoryType[];
  totalMemories: number;
  memoriesByType: Partial<Record<MemoryType, Record<string, unknown>>>;
  config: {
    maxCapacity: number;
    importanceThreshold: number;
    decayFactor: number;
  };
}

type ManagedMemory =
  | WorkingMemory
  | EpisodicMemory
  | SemanticMemory
  | PerceptualMemory;

const DEFAULT_CONFIG: MemoryConfig = {
  ...DEFAULT_MEMORY_CONFIG,
};

export class MemoryManager {
  readonly config: MemoryConfig;
  readonly userId: string;
  readonly memoryTypes: Partial<Record<MemoryType, ManagedMemory>>;

  constructor(options?: {
    config?: Partial<MemoryConfig>;
    userId?: string;
    enableWorking?: boolean;
    enableEpisodic?: boolean;
    enableSemantic?: boolean;
    enablePerceptual?: boolean;
  }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...(options?.config ?? {}),
    };
    this.userId = options?.userId ?? "default_user";

    this.memoryTypes = {};
    if (options?.enableWorking ?? true)
      this.memoryTypes.working = new WorkingMemory(this.config);
    if (options?.enableEpisodic ?? true)
      this.memoryTypes.episodic = new EpisodicMemory(this.config);
    if (options?.enableSemantic ?? true)
      this.memoryTypes.semantic = new SemanticMemory(this.config);
    if (options?.enablePerceptual ?? false)
      this.memoryTypes.perceptual = new PerceptualMemory(this.config);
  }

  addMemory(options: AddMemoryOptions): string {
    const {
      content,
      memoryType = "working",
      importance,
      metadata,
      autoClassify = true,
    } = options;

    const finalType = autoClassify
      ? this.classifyMemoryType(content, metadata)
      : memoryType;

    const memory = this.memoryTypes[finalType];
    if (!memory) {
      throw new Error(`不支持的记忆类型: ${finalType}`);
    }

    const finalImportance = clamp01(
      importance ?? this.calculateImportance(content, metadata),
    );

    const item: MemoryItem = {
      id: generateId(),
      content,
      memoryType: finalType,
      userId: this.userId,
      timestamp: new Date(),
      importance: finalImportance,
      metadata: metadata ?? {},
    };

    return memory.add(item);
  }

  retrieveMemories(options: RetrieveMemoriesOptions): MemoryItem[] {
    const {
      query,
      memoryTypes,
      limit = 10,
      minImportance = 0,
      timeRange,
    } = options;

    const selectedTypes =
      memoryTypes ?? (Object.keys(this.memoryTypes) as MemoryType[]);
    const perTypeLimit = Math.max(
      1,
      Math.floor(limit / Math.max(1, selectedTypes.length)),
    );

    const allResults: MemoryItem[] = [];

    for (const type of selectedTypes) {
      const memory = this.memoryTypes[type];
      if (!memory) continue;

      try {
        const typeResults = memory
          .retrieve(query, perTypeLimit, {userId: this.userId})
          .filter((item) => item.importance >= minImportance)
          .filter((item) => {
            if (!timeRange) return true;
            return (
              item.timestamp >= timeRange[0] && item.timestamp <= timeRange[1]
            );
          });

        allResults.push(...typeResults);
      } catch (e) {
        console.warn(`检索 ${type} 记忆时出错: ${e}`);
      }
    }

    return allResults
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  updateMemory(options: UpdateMemoryOptions): boolean {
    const {memoryId, content, importance, metadata} = options;

    for (const memory of Object.values(this.memoryTypes)) {
      if (!memory || !memory.hasMemory(memoryId)) continue;
      return memory.update(memoryId, content, importance, metadata);
    }

    return false;
  }

  removeMemory(memoryId: string): boolean {
    for (const memory of Object.values(this.memoryTypes)) {
      if (!memory || !memory.hasMemory(memoryId)) continue;
      return memory.remove(memoryId);
    }
    return false;
  }

  forgetMemories(options: ForgetMemoriesOptions = {}): number {
    const {
      strategy = "importance_based",
      threshold = 0.1,
      maxAgeDays = 30,
    } = options;

    let totalForgotten = 0;

    for (const memory of Object.values(this.memoryTypes)) {
      if (
        !memory ||
        !("forget" in memory) ||
        typeof memory.forget !== "function"
      )
        continue;
      totalForgotten += memory.forget(strategy, threshold, maxAgeDays);
    }

    return totalForgotten;
  }

  consolidateMemories(options: ConsolidateMemoriesOptions = {}): number {
    const {
      fromType = "working",
      toType = "episodic",
      importanceThreshold = 0.7,
    } = options;

    const sourceMemory = this.memoryTypes[fromType];
    const targetMemory = this.memoryTypes[toType];
    if (!sourceMemory || !targetMemory) return 0;
    if (
      !("getAll" in sourceMemory) ||
      typeof sourceMemory.getAll !== "function"
    )
      return 0;

    const candidates = sourceMemory
      .getAll()
      .filter((m: MemoryItem) => m.importance >= importanceThreshold);

    let consolidatedCount = 0;

    for (const memory of candidates) {
      if (!sourceMemory.remove(memory.id)) continue;

      const movedMemory: MemoryItem = {
        ...memory,
        memoryType: toType,
        importance: clamp01(memory.importance * 1.1),
      };

      targetMemory.add(movedMemory);
      consolidatedCount += 1;
    }

    return consolidatedCount;
  }

  getMemoryStats(): MemoryStats {
    const enabledTypes = Object.keys(this.memoryTypes) as MemoryType[];
    const memoriesByType: Partial<Record<MemoryType, Record<string, unknown>>> =
      {};

    let totalMemories = 0;
    for (const type of enabledTypes) {
      const memory = this.memoryTypes[type];
      if (!memory) continue;
      const typeStats = memory.getStats();
      memoriesByType[type] = typeStats;
      totalMemories += Number(typeStats.count ?? 0);
    }

    return {
      userId: this.userId,
      enabledTypes,
      totalMemories,
      memoriesByType,
      config: {
        maxCapacity: this.config.maxCapacity,
        importanceThreshold: this.config.importanceThreshold,
        decayFactor: this.config.decayFactor,
      },
    };
  }

  clearAllMemories(): void {
    for (const memory of Object.values(this.memoryTypes)) {
      memory?.clear();
    }
  }

  toString(): string {
    const stats = this.getMemoryStats();
    return `MemoryManager(user=${this.userId}, total=${stats.totalMemories})`;
  }

  private classifyMemoryType(
    content: string,
    metadata?: Record<string, unknown>,
  ): MemoryType {
    const explicit = metadata?.type;
    if (
      explicit === "working" ||
      explicit === "episodic" ||
      explicit === "semantic" ||
      explicit === "perceptual"
    ) {
      return explicit;
    }

    if (this.isEpisodicContent(content)) return "episodic";
    if (this.isSemanticContent(content)) return "semantic";
    return "working";
  }

  private isEpisodicContent(content: string): boolean {
    const keywords = ["昨天", "今天", "明天", "上次", "记得", "发生", "经历"];
    return keywords.some((k) => content.includes(k));
  }

  private isSemanticContent(content: string): boolean {
    const keywords = ["定义", "概念", "规则", "知识", "原理", "方法"];
    return keywords.some((k) => content.includes(k));
  }

  private calculateImportance(
    content: string,
    metadata?: Record<string, unknown>,
  ): number {
    let importance = 0.5;

    if (content.length > 100) importance += 0.1;
    if (
      ["重要", "关键", "必须", "注意", "警告", "错误"].some((k) =>
        content.includes(k),
      )
    ) {
      importance += 0.2;
    }

    if (metadata?.priority === "high") importance += 0.3;
    if (metadata?.priority === "low") importance -= 0.2;

    return clamp01(importance);
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function generateId(): string {
  try {
    return randomUUID();
  } catch {
    return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
