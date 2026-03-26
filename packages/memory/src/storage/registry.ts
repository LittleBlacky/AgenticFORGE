import type {
  KVStoreAdapter,
  VectorStoreAdapter,
  GraphStoreAdapter,
  BlobStoreAdapter,
  MemoryStorageAdapters,
  AdapterHealthStatus,
  AdapterWithHealth,
} from "./types";
import type { MemoryItem } from "../types/base";

export interface AdapterRegistryOptions {
  enableFallback?: boolean;
  healthCheckInterval?: number;
}

export class AdapterRegistry {
  private adapters: MemoryStorageAdapters = {};
  private readonly options: Required<AdapterRegistryOptions>;
  private healthCheckTimer?: NodeJS.Timeout;
  private lastHealthStatus: AdapterHealthStatus = {
    kvStore: true,
    vectorStore: true,
    graphStore: true,
    blobStore: true,
  };

  constructor(options: AdapterRegistryOptions = {}) {
    this.options = {
      enableFallback: options.enableFallback ?? true,
      healthCheckInterval: options.healthCheckInterval ?? 30000,
    };
  }

  register(adapters: MemoryStorageAdapters): void {
    this.adapters = adapters;
  }

  getAdapters(): MemoryStorageAdapters {
    return this.adapters;
  }

  getKVStore(): KVStoreAdapter<MemoryItem> | undefined {
    return this.adapters.kvStore;
  }

  getVectorStore(): VectorStoreAdapter | undefined {
    return this.adapters.vectorStore;
  }

  getGraphStore(): GraphStoreAdapter | undefined {
    return this.adapters.graphStore;
  }

  getBlobStore(): BlobStoreAdapter | undefined {
    return this.adapters.blobStore;
  }

  async initialize(): Promise<void> {
    await this.checkHealth();
    if (this.options.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(
        () => this.checkHealth().catch(console.error),
        this.options.healthCheckInterval,
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    const adapters = this.adapters;
    if (adapters.kvStore?.clear) await adapters.kvStore.clear();
    if (adapters.vectorStore?.clear) await adapters.vectorStore.clear();
    if (adapters.graphStore?.clear) await adapters.graphStore.clear();
    if (adapters.blobStore?.clear) await adapters.blobStore.clear();
  }

  async checkHealth(): Promise<AdapterHealthStatus> {
    const status: AdapterHealthStatus = {
      kvStore: await this.checkAdapterHealth(this.adapters.kvStore),
      vectorStore: await this.checkAdapterHealth(this.adapters.vectorStore),
      graphStore: await this.checkAdapterHealth(this.adapters.graphStore),
      blobStore: await this.checkAdapterHealth(this.adapters.blobStore),
    };

    this.lastHealthStatus = status;
    return status;
  }

  getLastHealthStatus(): AdapterHealthStatus {
    return this.lastHealthStatus;
  }

  isHealthy(): boolean {
    return Object.values(this.lastHealthStatus).every((v) => v);
  }

  private async checkAdapterHealth(adapter: AdapterWithHealth | undefined): Promise<boolean> {
    if (!adapter) return true;
    if (typeof adapter === "object" && "health" in adapter) {
      try {
        return (await adapter.health?.()) ?? true;
      } catch (error) {
        console.warn(error);
        return false;
      }
    }
    return true;
  }
}
