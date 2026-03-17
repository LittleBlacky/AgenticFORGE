import {
  InMemoryKVStore,
  InMemoryVectorStore,
  InMemoryGraphStore,
  InMemoryBlobStore,
} from "./inMemory";
import type {
  KVStoreAdapter,
  VectorStoreAdapter,
  GraphStoreAdapter,
  BlobStoreAdapter,
} from "./types";
import type {MemoryItem} from "../types/base";

export type VectorStoreBackendOptions =
  | {backend: "memory"}
  | {
      backend: "qdrant";
      qdrantUrl: string;
      qdrantApiKey?: string;
      qdrantCollection?: string;
      qdrantVectorSize?: number;
    };

export type GraphStoreBackendOptions =
  | {backend: "memory"}
  | {
      backend: "neo4j";
      neo4jUrl: string;
      neo4jUser?: string;
      neo4jPassword?: string;
    };

/**
 * Factory that creates the appropriate VectorStoreAdapter based on backend options.
 * Falls back to in-memory store if the requested backend is not available.
 */
export function createDefaultVectorStore(
  options: VectorStoreBackendOptions = {backend: "memory"},
): VectorStoreAdapter {
  if (options.backend === "qdrant") {
    try {
      // Dynamically require so that missing peer dep doesn't hard-fail
      const {QdrantVectorStore} = require("./qdrant") as {
        QdrantVectorStore: new (opts: Record<string, unknown>) => VectorStoreAdapter;
      };
      return new QdrantVectorStore({
        url: options.qdrantUrl,
        apiKey: options.qdrantApiKey,
        collectionName: options.qdrantCollection ?? "rag_knowledge_base",
        vectorSize: options.qdrantVectorSize ?? 384,
      });
    } catch {
      console.warn("[AdapterFactory] Qdrant unavailable, falling back to in-memory store");
    }
  }
  return new InMemoryVectorStore();
}

/**
 * Factory that creates the appropriate GraphStoreAdapter.
 */
export function createDefaultGraphStore(
  options: GraphStoreBackendOptions = {backend: "memory"},
): GraphStoreAdapter {
  if (options.backend === "neo4j") {
    try {
      const {Neo4jGraphStore} = require("./neo4j") as {
        Neo4jGraphStore: new (opts: Record<string, unknown>) => GraphStoreAdapter;
      };
      return new Neo4jGraphStore({
        url: options.neo4jUrl,
        user: options.neo4jUser,
        password: options.neo4jPassword,
      });
    } catch {
      console.warn("[AdapterFactory] Neo4j unavailable, falling back to in-memory store");
    }
  }
  return new InMemoryGraphStore();
}

export function createDefaultKVStore(): KVStoreAdapter<MemoryItem> {
  return new InMemoryKVStore<MemoryItem>();
}

export function createDefaultBlobStore(): BlobStoreAdapter {
  return new InMemoryBlobStore();
}

/**
 * Convenience class that wraps the factory functions.
 */
export class AdapterFactory {
  static createVectorStore(options?: VectorStoreBackendOptions): VectorStoreAdapter {
    return createDefaultVectorStore(options);
  }
  static createGraphStore(options?: GraphStoreBackendOptions): GraphStoreAdapter {
    return createDefaultGraphStore(options);
  }
  static createKVStore(): KVStoreAdapter<MemoryItem> {
    return createDefaultKVStore();
  }
  static createBlobStore(): BlobStoreAdapter {
    return createDefaultBlobStore();
  }
}
