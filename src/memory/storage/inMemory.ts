import type {
  KVStoreAdapter,
  VectorStoreAdapter,
  GraphStoreAdapter,
  BlobStoreAdapter,
} from "./types";
import type {Entity, Relation} from "./types";

export class InMemoryKVStore<T> implements KVStoreAdapter<T> {
  private readonly store = new Map<string, T>();

  async put(id: string, item: T): Promise<void> {
    this.store.set(id, item);
  }

  async get(id: string): Promise<T | null> {
    return this.store.get(id) ?? null;
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }

  async list(params?: {limit?: number}): Promise<T[]> {
    const values = Array.from(this.store.values());
    if (!params?.limit) return values;
    return values.slice(0, Math.max(1, Math.floor(params.limit)));
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }
}

export class InMemoryVectorStore implements VectorStoreAdapter {
  private readonly vectors = new Map<
    string,
    {vector: number[]; payload: Record<string, unknown>}
  >();

  async upsertVector(params: {
    id: string;
    vector: number[];
    payload: Record<string, unknown>;
  }): Promise<void> {
    this.vectors.set(params.id, {
      vector: params.vector,
      payload: params.payload,
    });
  }

  async queryVector(params: {
    vector: number[];
    limit: number;
  }): Promise<Array<{id: string; score: number; payload: Record<string, unknown>}>> {
    const scored = Array.from(this.vectors.entries())
      .map(([id, entry]) => ({
        id,
        score: cosine(params.vector, entry.vector),
        payload: entry.payload,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.floor(params.limit)));

    return scored;
  }

  async deleteVector(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  async clear(): Promise<void> {
    this.vectors.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }
}

export class InMemoryGraphStore implements GraphStoreAdapter {
  private readonly entities = new Map<string, Entity>();
  private readonly relations: Relation[] = [];

  async upsertEntities(entities: Entity[]): Promise<void> {
    for (const entity of entities) {
      const prev = this.entities.get(entity.entityId);
      this.entities.set(
        entity.entityId,
        prev ? {...prev, frequency: prev.frequency + 1} : entity,
      );
    }
  }

  async upsertRelations(relations: Relation[]): Promise<void> {
    for (const rel of relations) {
      const idx = this.relations.findIndex(
        (r) =>
          r.fromEntity === rel.fromEntity &&
          r.toEntity === rel.toEntity &&
          r.relationType === rel.relationType,
      );
      if (idx < 0) {
        this.relations.push(rel);
      } else {
        const prev = this.relations[idx];
        this.relations[idx] = {
          ...prev,
          frequency: prev.frequency + 1,
          strength: Math.min(1, prev.strength + 0.1),
        };
      }
    }
  }

  async queryGraph(params: {
    queryText: string;
    limit: number;
  }): Promise<Array<{entityId: string; score: number}>> {
    const tokens = new Set(
      params.queryText.toLowerCase().split(/\s+/g).filter(Boolean),
    );
    const scored = Array.from(this.entities.values())
      .map((entity) => {
        const matched = tokens.has(entity.name.toLowerCase()) ? 1 : 0;
        return {entityId: entity.entityId, score: matched};
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.floor(params.limit)));

    return scored;
  }

  async deleteByMemoryId(memoryId: string): Promise<void> {
    this.entities.delete(memoryId);
    for (let i = this.relations.length - 1; i >= 0; i -= 1) {
      const rel = this.relations[i];
      if (rel.fromEntity === memoryId || rel.toEntity === memoryId) {
        this.relations.splice(i, 1);
      }
    }
  }

  async clear(): Promise<void> {
    this.entities.clear();
    this.relations.length = 0;
  }

  async health(): Promise<boolean> {
    return true;
  }
}

export class InMemoryBlobStore implements BlobStoreAdapter {
  private readonly store = new Map<string, {data: Buffer | string; meta?: Record<string, unknown>}>();

  async putBlob(id: string, data: Buffer | string, meta?: Record<string, unknown>): Promise<void> {
    this.store.set(id, {data, meta});
  }

  async getBlob(id: string): Promise<Buffer | string | null> {
    return this.store.get(id)?.data ?? null;
  }

  async deleteBlob(id: string): Promise<void> {
    this.store.delete(id);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async health(): Promise<boolean> {
    return true;
  }
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let an = 0;
  let bn = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    an += a[i] * a[i];
    bn += b[i] * b[i];
  }
  if (an === 0 || bn === 0) return 0;
  return dot / (Math.sqrt(an) * Math.sqrt(bn));
}
