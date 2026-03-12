import type {MemoryItem} from "../types/base";

export type PrimitiveValue = string | number | boolean | null;
export type PrimitiveArray = PrimitiveValue[];
export type PropertiesMap = Record<string, PrimitiveValue | PrimitiveArray>;

export interface Entity {
  entityId: string;
  name: string;
  entityType: string;
  description: string;
  properties: PropertiesMap;
  frequency: number;
}

export interface Relation {
  fromEntity: string;
  toEntity: string;
  relationType: string;
  strength: number;
  evidence: string;
  properties: PropertiesMap;
  frequency: number;
}

export interface KVStoreAdapter<T> {
  put(id: string, item: T): Promise<void>;
  get(id: string): Promise<T | null>;
  delete(id: string): Promise<void>;
  list(params?: {limit?: number; filter?: Record<string, unknown>}): Promise<T[]>;
  clear?(): Promise<void>;
  health?(): Promise<boolean>;
}

export interface VectorStoreAdapter {
  upsertVector(params: {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void>;
  queryVector(params: {
    vector: number[];
    limit: number;
    filter?: Record<string, unknown>;
  }): Promise<Array<{id: string; score: number; payload: Record<string, unknown>}>>;
  deleteVector(id: string): Promise<void>;
  clear?(): Promise<void>;
  health?(): Promise<boolean>;
}

export interface GraphStoreAdapter {
  upsertEntities(entities: Entity[]): Promise<void>;
  upsertRelations(relations: Relation[]): Promise<void>;
  queryGraph(params: {
    queryText: string;
    limit: number;
  }): Promise<Array<{entityId: string; score: number}>>;
  deleteByMemoryId(memoryId: string): Promise<void>;
  clear?(): Promise<void>;
  health?(): Promise<boolean>;
}

export interface BlobStoreAdapter {
  putBlob(id: string, data: Buffer | string, meta?: Record<string, unknown>): Promise<void>;
  getBlob(id: string): Promise<Buffer | string | null>;
  deleteBlob(id: string): Promise<void>;
  clear?(): Promise<void>;
  health?(): Promise<boolean>;
}

export interface MemoryStorageAdapters {
  kvStore?: KVStoreAdapter<MemoryItem>;
  vectorStore?: VectorStoreAdapter;
  graphStore?: GraphStoreAdapter;
  blobStore?: BlobStoreAdapter;
}

export type AdapterWithHealth =
  | KVStoreAdapter<MemoryItem>
  | VectorStoreAdapter
  | GraphStoreAdapter
  | BlobStoreAdapter;

export interface AdapterHealthStatus {
  kvStore: boolean;
  vectorStore: boolean;
  graphStore: boolean;
  blobStore: boolean;
}

export type AdapterType = "kvStore" | "vectorStore" | "graphStore" | "blobStore";

export interface AdapterConfig {
  type: AdapterType;
  backend: string; // 内置: "memory" | "qdrant" | "neo4j" | "s3" | "file"；也可传入任意自定义字符串
  options?: Record<string, unknown>;
}

// ---- 自定义适配器工厂函数类型 ----
export type KVStoreFactory<T = unknown> = (options?: Record<string, unknown>) => KVStoreAdapter<T>;
export type VectorStoreFactory = (options?: Record<string, unknown>) => VectorStoreAdapter;
export type GraphStoreFactory = (options?: Record<string, unknown>) => GraphStoreAdapter;
export type BlobStoreFactory = (options?: Record<string, unknown>) => BlobStoreAdapter;
