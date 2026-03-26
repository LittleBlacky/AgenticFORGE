import { BaseMemory, type MemoryConfig, type MemoryItem } from "./base";
import { HashTextEmbedder } from "../rag/pipeline";
import type {
  Entity,
  GraphStoreAdapter,
  KVStoreAdapter,
  Relation,
  VectorStoreAdapter,
} from "../storage";

export interface SemanticStorageAdapters {
  vectorStore?: VectorStoreAdapter;
  graphStore?: GraphStoreAdapter;
  kvStore?: KVStoreAdapter<MemoryItem>;
}

export class SemanticMemory extends BaseMemory {
  private readonly memories: MemoryItem[] = [];
  private readonly embeddings = new Map<string, number[]>();
  private readonly entities = new Map<string, Entity>();
  private readonly relations: Relation[] = [];
  private readonly embedder = new HashTextEmbedder(384);
  private readonly vectorStore?: VectorStoreAdapter;
  private readonly graphStore?: GraphStoreAdapter;
  private readonly kvStore?: KVStoreAdapter<MemoryItem>;

  constructor(config: Partial<MemoryConfig> = {}, adapters: SemanticStorageAdapters = {}) {
    super(config);
    this.vectorStore = adapters.vectorStore;
    this.graphStore = adapters.graphStore;
    this.kvStore = adapters.kvStore;
  }

  async add(memoryItem: MemoryItem): Promise<string> {
    const vec = await this.embed(memoryItem.content);
    this.embeddings.set(memoryItem.id, vec);

    const entities = this.extractEntities(memoryItem.content);
    const relations = this.extractRelations(memoryItem.content, entities);

    for (const e of entities) this.addOrUpdateEntity(e);
    for (const r of relations) this.addOrUpdateRelation(r);

    memoryItem.metadata.entities = entities.map((e) => e.entityId);
    memoryItem.metadata.relations = relations.map(
      (r) => `${r.fromEntity}-${r.relationType}-${r.toEntity}`,
    );

    if (this.vectorStore) {
      await this.vectorStore.upsertVector({
        id: memoryItem.id,
        vector: vec,
        payload: {
          content: memoryItem.content,
          memoryType: memoryItem.memoryType,
          userId: memoryItem.userId,
          importance: memoryItem.importance,
          timestamp: memoryItem.timestamp.toISOString(),
          metadata: memoryItem.metadata,
        },
      });
    }

    if (this.graphStore) {
      await this.graphStore.upsertEntities(entities);
      await this.graphStore.upsertRelations(relations);
    }

    if (this.kvStore) {
      await this.kvStore.put(memoryItem.id, memoryItem);
    }

    this.memories.push(memoryItem);
    return memoryItem.id;
  }

  async retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): Promise<MemoryItem[]> {
    const userId = typeof options.userId === "string" ? options.userId : undefined;
    const qv = await this.embed(query);

    const vectorResults = this.vectorStore
      ? await this.vectorStore.queryVector({
          vector: qv,
          limit,
          filter: {
            memoryType: "semantic",
            userId: userId ?? undefined,
          },
        })
      : [];

    const graphResults = this.graphStore
      ? await this.graphStore.queryGraph({ queryText: query, limit })
      : [];

    if (vectorResults.length || graphResults.length) {
      const merged = await this.mergeAdapterResults(vectorResults, graphResults, limit, userId);
      return merged.filter((item) => {
        if (item.memoryType !== "semantic") return false;
        const score = item.metadata.combined_score;
        return typeof score === "number" ? score >= 0.1 : false;
      });
    }

    const scored = this.memories
      .filter((m) => (userId ? m.userId === userId : true))
      .map((m) => {
        const mv = this.embeddings.get(m.id) ?? [];
        const vectorScore = cosine(qv, mv);
        const graphScore = this.graphScore(m.metadata.entities as string[] | undefined, query);
        const base = vectorScore * 0.7 + graphScore * 0.3;
        const weight = 0.8 + m.importance * 0.4;
        return { score: base * weight, item: m, vectorScore, graphScore };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.floor(limit)));

    return scored.map((x) => ({
      ...x.item,
      metadata: {
        ...x.item.metadata,
        combined_score: x.score,
        vector_score: x.vectorScore,
        graph_score: x.graphScore,
      },
    }));
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
    const next: MemoryItem = {
      ...old,
      content: content ?? old.content,
      importance: typeof importance === "number" ? clamp01(importance) : old.importance,
      metadata: metadata ? { ...old.metadata, ...metadata } : old.metadata,
    };

    if (content !== undefined) {
      const vec = await this.embed(content);
      this.embeddings.set(memoryId, vec);

      const entities = this.extractEntities(content);
      const relations = this.extractRelations(content, entities);
      next.metadata.entities = entities.map((e) => e.entityId);
      next.metadata.relations = relations.map(
        (r) => `${r.fromEntity}-${r.relationType}-${r.toEntity}`,
      );
      for (const e of entities) this.addOrUpdateEntity(e);
      for (const r of relations) this.addOrUpdateRelation(r);

      if (this.vectorStore) {
        await this.vectorStore.upsertVector({
          id: memoryId,
          vector: vec,
          payload: {
            content: next.content,
            memoryType: next.memoryType,
            userId: next.userId,
            importance: next.importance,
            timestamp: next.timestamp.toISOString(),
            metadata: next.metadata,
          },
        });
      }

      if (this.graphStore) {
        await this.graphStore.upsertEntities(entities);
        await this.graphStore.upsertRelations(relations);
      }

      if (this.kvStore) {
        await this.kvStore.put(memoryId, next);
      }
    }

    this.memories[idx] = next;
    return true;
  }

  async remove(memoryId: string): Promise<boolean> {
    const idx = this.memories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;
    this.memories.splice(idx, 1);
    this.embeddings.delete(memoryId);

    if (this.vectorStore) {
      await this.vectorStore.deleteVector(memoryId);
    }
    if (this.graphStore) {
      await this.graphStore.deleteByMemoryId(memoryId);
    }
    if (this.kvStore) {
      await this.kvStore.delete(memoryId);
    }
    return true;
  }

  async hasMemory(memoryId: string): Promise<boolean> {
    return this.memories.some((m) => m.id === memoryId);
  }

  async clear(): Promise<void> {
    this.memories.length = 0;
    this.embeddings.clear();
    this.entities.clear();
    this.relations.length = 0;
  }

  async getStats(): Promise<Record<string, unknown>> {
    const avgImportance = this.memories.length
      ? this.memories.reduce((acc, m) => acc + m.importance, 0) / this.memories.length
      : 0;

    return {
      count: this.memories.length,
      entitiesCount: this.entities.size,
      relationsCount: this.relations.length,
      avgImportance,
      memoryType: "semantic",
    };
  }

  private async embed(text: string): Promise<number[]> {
    const raw = await this.embedder.encode(text);
    if (Array.isArray(raw) && typeof raw[0] === "number") {
      return raw as number[];
    }
    return [];
  }

  private extractEntities(text: string): Entity[] {
    const tokens = text
      .split(/\s+/g)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
      .slice(0, 12);

    const uniq = [...new Set(tokens)];
    return uniq.map((name) => ({
      entityId: `entity_${simpleHash(name)}`,
      name,
      entityType: "CONCEPT",
      description: `Extracted from semantic memory text`,
      properties: {},
      frequency: 1,
    }));
  }

  private extractRelations(text: string, entities: Entity[]): Relation[] {
    const rels: Relation[] = [];
    for (let i = 0; i < entities.length; i += 1) {
      for (let j = i + 1; j < entities.length; j += 1) {
        rels.push({
          fromEntity: entities[i].entityId,
          toEntity: entities[j].entityId,
          relationType: "CO_OCCURS",
          strength: 0.5,
          evidence: text.slice(0, 120),
          properties: {},
          frequency: 1,
        });
      }
    }
    return rels;
  }

  private addOrUpdateEntity(entity: Entity): void {
    const existing = this.entities.get(entity.entityId);
    if (!existing) {
      this.entities.set(entity.entityId, entity);
      return;
    }
    this.entities.set(entity.entityId, {
      ...existing,
      frequency: existing.frequency + 1,
    });
  }

  private addOrUpdateRelation(relation: Relation): void {
    const idx = this.relations.findIndex(
      (r) =>
        r.fromEntity === relation.fromEntity &&
        r.toEntity === relation.toEntity &&
        r.relationType === relation.relationType,
    );
    if (idx < 0) {
      this.relations.push(relation);
      return;
    }
    const prev = this.relations[idx];
    this.relations[idx] = {
      ...prev,
      frequency: prev.frequency + 1,
      strength: Math.min(1, prev.strength + 0.1),
    };
  }

  private graphScore(entityIds: string[] | undefined, query: string): number {
    if (!entityIds || entityIds.length === 0) return 0;
    const lower = query.toLowerCase();
    let matched = 0;
    for (const id of entityIds) {
      const e = this.entities.get(id);
      if (e && lower.includes(e.name.toLowerCase())) matched += 1;
    }
    return matched / entityIds.length;
  }

  private async mergeAdapterResults(
    vectorResults: Array<{ id: string; score: number; payload: Record<string, unknown> }>,
    graphResults: Array<{ entityId: string; score: number }>,
    limit: number,
    userId?: string,
  ): Promise<MemoryItem[]> {
    const graphScoreMap = new Map<string, number>();
    for (const result of graphResults) {
      graphScoreMap.set(result.entityId, result.score);
    }

    const entries = vectorResults
      .map((result) => {
        const payload = result.payload;
        const importance = typeof payload.importance === "number" ? payload.importance : 0.5;
        const item: MemoryItem = {
          id: String(result.id),
          content: String(payload.content ?? ""),
          memoryType: (payload.memoryType as MemoryItem["memoryType"]) ?? "semantic",
          userId: String(payload.userId ?? ""),
          timestamp: payload.timestamp ? new Date(String(payload.timestamp)) : new Date(),
          importance,
          metadata: {
            ...(payload.metadata as Record<string, unknown>),
          },
        };

        const graphScore = graphScoreMap.get(result.id) ?? 0;
        const base = result.score * 0.7 + graphScore * 0.3;
        const weight = 0.8 + importance * 0.4;
        const score = base * weight;

        return {
          score,
          item: {
            ...item,
            metadata: {
              ...item.metadata,
              combined_score: score,
              vector_score: result.score,
              graph_score: graphScore,
            },
          },
        };
      })
      .filter((entry) => (userId ? entry.item.userId === userId : true));

    const deduped = new Map<string, { score: number; item: MemoryItem }>();
    for (const entry of entries) {
      const prev = deduped.get(entry.item.id);
      if (!prev || entry.score > prev.score) {
        deduped.set(entry.item.id, entry);
      }
    }

    const merged = [...deduped.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.floor(limit)))
      .map((entry) => entry.item);

    if (merged.length > 0) {
      return merged;
    }

    if (this.kvStore) {
      const items = (await this.kvStore.list({ limit }))
        .filter((item) => (userId ? (item as MemoryItem).userId === userId : true))
        .map((item) => item as MemoryItem);
      return items.slice(0, Math.max(1, Math.floor(limit)));
    }

    return [];
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

function simpleHash(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}
