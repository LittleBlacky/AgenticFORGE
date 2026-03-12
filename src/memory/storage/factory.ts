import type {MemoryItem} from "../types/base";
import type {
  KVStoreAdapter,
  VectorStoreAdapter,
  GraphStoreAdapter,
  BlobStoreAdapter,
  AdapterConfig,
  MemoryStorageAdapters,
  KVStoreFactory,
  VectorStoreFactory,
  GraphStoreFactory,
  BlobStoreFactory,
} from "./types";
import {
  InMemoryKVStore,
  InMemoryVectorStore,
  InMemoryGraphStore,
  InMemoryBlobStore,
} from "./inMemory";

/**
 * AdapterFactory — 适配器工厂
 *
 * ## 内置后端
 * - `"memory"` — 所有 4 种适配器均有内置内存实现
 *
 * ## 注册自定义后端（用户扩展入口）
 *
 * ```typescript
 * import { AdapterFactory } from "@blacky/agents-sdk/memory/storage";
 * import { MyQdrantVectorStore } from "./my-qdrant";
 *
 * // 注册一次，全局生效
 * AdapterFactory.registerVectorStore("qdrant", (options) => new MyQdrantVectorStore(options));
 *
 * // 之后在任意 MemoryManager 中直接使用
 * const manager = new MemoryManager({
 *   adapterConfigs: [
 *     { type: "vectorStore", backend: "qdrant", options: { url: "http://localhost:6333" } },
 *   ],
 * });
 * ```
 */
export class AdapterFactory {
  // ---- 自定义后端注册表 ----
  private static kvStoreRegistry = new Map<string, KVStoreFactory>();
  private static vectorStoreRegistry = new Map<string, VectorStoreFactory>();
  private static graphStoreRegistry = new Map<string, GraphStoreFactory>();
  private static blobStoreRegistry = new Map<string, BlobStoreFactory>();

  // ----------------------------------------------------------------
  // 注册方法（用户调用）
  // ----------------------------------------------------------------

  /**
   * 注册自定义 KVStore 后端
   * @param backend 后端名称，与 AdapterConfig.backend 对应
   * @param factory 工厂函数，接收 options 并返回适配器实例
   */
  static registerKVStore(backend: string, factory: KVStoreFactory): void {
    this.kvStoreRegistry.set(backend, factory);
  }

  /**
   * 注册自定义 VectorStore 后端
   */
  static registerVectorStore(backend: string, factory: VectorStoreFactory): void {
    this.vectorStoreRegistry.set(backend, factory);
  }

  /**
   * 注册自定义 GraphStore 后端
   */
  static registerGraphStore(backend: string, factory: GraphStoreFactory): void {
    this.graphStoreRegistry.set(backend, factory);
  }

  /**
   * 注册自定义 BlobStore 后端
   */
  static registerBlobStore(backend: string, factory: BlobStoreFactory): void {
    this.blobStoreRegistry.set(backend, factory);
  }

  // ----------------------------------------------------------------
  // 创建方法（内部 + 用户均可调用）
  // ----------------------------------------------------------------

  static createKVStore<T>(config: AdapterConfig): KVStoreAdapter<T> {
    if (config.backend === "memory") {
      return new InMemoryKVStore<T>();
    }
    const factory = this.kvStoreRegistry.get(config.backend);
    if (factory) {
      return factory(config.options) as KVStoreAdapter<T>;
    }
    throw new Error(
      `不支持的 KVStore 后端: "${config.backend}"。` +
      `请先调用 AdapterFactory.registerKVStore("${config.backend}", factory) 注册自定义实现。`,
    );
  }

  static createVectorStore(config: AdapterConfig): VectorStoreAdapter {
    if (config.backend === "memory") {
      return new InMemoryVectorStore();
    }
    const factory = this.vectorStoreRegistry.get(config.backend);
    if (factory) {
      return factory(config.options);
    }
    throw new Error(
      `不支持的 VectorStore 后端: "${config.backend}"。` +
      `请先调用 AdapterFactory.registerVectorStore("${config.backend}", factory) 注册自定义实现。`,
    );
  }

  static createGraphStore(config: AdapterConfig): GraphStoreAdapter {
    if (config.backend === "memory") {
      return new InMemoryGraphStore();
    }
    const factory = this.graphStoreRegistry.get(config.backend);
    if (factory) {
      return factory(config.options);
    }
    throw new Error(
      `不支持的 GraphStore 后端: "${config.backend}"。` +
      `请先调用 AdapterFactory.registerGraphStore("${config.backend}", factory) 注册自定义实现。`,
    );
  }

  static createBlobStore(config: AdapterConfig): BlobStoreAdapter {
    if (config.backend === "memory") {
      return new InMemoryBlobStore();
    }
    const factory = this.blobStoreRegistry.get(config.backend);
    if (factory) {
      return factory(config.options);
    }
    throw new Error(
      `不支持的 BlobStore 后端: "${config.backend}"。` +
      `请先调用 AdapterFactory.registerBlobStore("${config.backend}", factory) 注册自定义实现。`,
    );
  }

  static createAdapters(configs: AdapterConfig[]): MemoryStorageAdapters {
    const adapters: MemoryStorageAdapters = {};

    for (const config of configs) {
      switch (config.type) {
        case "kvStore":
          adapters.kvStore = this.createKVStore<MemoryItem>(config);
          break;
        case "vectorStore":
          adapters.vectorStore = this.createVectorStore(config);
          break;
        case "graphStore":
          adapters.graphStore = this.createGraphStore(config);
          break;
        case "blobStore":
          adapters.blobStore = this.createBlobStore(config);
          break;
      }
    }

    return adapters;
  }

  // ----------------------------------------------------------------
  // 工具方法
  // ----------------------------------------------------------------

  /** 查询已注册的自定义后端名称列表 */
  static listRegistered(): Record<string, string[]> {
    return {
      kvStore: Array.from(this.kvStoreRegistry.keys()),
      vectorStore: Array.from(this.vectorStoreRegistry.keys()),
      graphStore: Array.from(this.graphStoreRegistry.keys()),
      blobStore: Array.from(this.blobStoreRegistry.keys()),
    };
  }

  /** 清空所有自定义注册（主要用于测试） */
  static clearRegistry(): void {
    this.kvStoreRegistry.clear();
    this.vectorStoreRegistry.clear();
    this.graphStoreRegistry.clear();
    this.blobStoreRegistry.clear();
  }
}
