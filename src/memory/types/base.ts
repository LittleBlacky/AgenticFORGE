import {randomUUID} from "node:crypto";

export type MemoryType = "working" | "episodic" | "semantic" | "perceptual";

export interface MemoryItem {
  id: string;
  content: string;
  memoryType: MemoryType;
  userId: string;
  timestamp: Date;
  importance: number;
  metadata: Record<string, unknown>;
}

export interface MemoryConfig {
  storagePath: string;
  maxCapacity: number;
  importanceThreshold: number;
  decayFactor: number;
  workingMemoryCapacity: number;
  workingMemoryTokens: number;
  workingMemoryTtlMinutes: number;
  perceptualMemoryModalities: string[];
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  storagePath: "./memory_data",
  maxCapacity: 100,
  importanceThreshold: 0.1,
  decayFactor: 0.95,
  workingMemoryCapacity: 10,
  workingMemoryTokens: 2000,
  workingMemoryTtlMinutes: 120,
  perceptualMemoryModalities: ["text", "image", "audio", "video"],
};

export abstract class BaseMemory {
  protected readonly config: MemoryConfig;

  protected constructor(config: Partial<MemoryConfig> = {}) {
    this.config = {...DEFAULT_MEMORY_CONFIG, ...config};
  }

  abstract add(memoryItem: MemoryItem): Promise<string>;
  abstract retrieve(
    query: string,
    limit?: number,
    options?: Record<string, unknown>,
  ): Promise<MemoryItem[]>;
  abstract update(
    memoryId: string,
    content?: string,
    importance?: number,
    metadata?: Record<string, unknown>,
  ): Promise<boolean>;
  abstract remove(memoryId: string): Promise<boolean>;
  abstract hasMemory(memoryId: string): Promise<boolean>;
  abstract clear(): Promise<void>;
  abstract getStats(): Promise<Record<string, unknown>>;

  protected generateId(): string {
    return randomUUID();
  }

  protected calculateImportance(content: string, baseImportance = 0.5): number {
    let importance = baseImportance;
    if (content.length > 100) importance += 0.1;
    if (
      ["重要", "关键", "必须", "注意", "警告", "错误"].some((k) =>
        content.includes(k),
      )
    ) {
      importance += 0.2;
    }
    return Math.max(0, Math.min(1, importance));
  }
}
