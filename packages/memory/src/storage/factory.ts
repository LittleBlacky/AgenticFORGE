import type {MemoryStorageAdapters} from "./types";
import {
  InMemoryKVStore,
  InMemoryVectorStore,
  InMemoryGraphStore,
  InMemoryBlobStore,
} from "./inMemory";
import type {MemoryItem} from "../types/base";

export class AdapterFactory {
  static createInMemory(): MemoryStorageAdapters {
    return {
      kvStore: new InMemoryKVStore<MemoryItem>(),
      vectorStore: new InMemoryVectorStore(),
      graphStore: new InMemoryGraphStore(),
      blobStore: new InMemoryBlobStore(),
    };
  }

  static create(options?: Record<string, unknown>): MemoryStorageAdapters {
    return AdapterFactory.createInMemory();
  }
}
