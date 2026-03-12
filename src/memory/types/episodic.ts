import {BaseMemory, type MemoryConfig, type MemoryItem} from "./base";
import {HashTextEmbedder} from "../rag/pipeline";
import type {KVStoreAdapter, VectorStoreAdapter} from "../storage";

export interface Episode {
  episodeId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  content: string;
  context: Record<string, unknown>;
  outcome?: string;
  importance: number;
  participants: string[];
  tags: string[];
  eventType?: string;
}

export interface EpisodicStorageAdapters {
  kvStore?: KVStoreAdapter<MemoryItem>;
  vectorStore?: VectorStoreAdapter;
}

export class EpisodicMemory extends BaseMemory {
  private readonly episodes: Episode[] = [];
  private readonly sessions = new Map<string, string[]>();
  private readonly kvStore?: KVStoreAdapter<MemoryItem>;
  private readonly vectorStore?: VectorStoreAdapter;
  private readonly embedder = new HashTextEmbedder(384);

  constructor(
    config: Partial<MemoryConfig> = {},
    adapters: EpisodicStorageAdapters = {},
  ) {
    super(config);
    this.kvStore = adapters.kvStore;
    this.vectorStore = adapters.vectorStore;
  }

  async add(memoryItem: MemoryItem): Promise<string> {
    const sessionId = String(
      memoryItem.metadata.session_id ?? "default_session",
    );
    const context =
      (memoryItem.metadata.context as Record<string, unknown>) ?? {};
    const outcome =
      typeof memoryItem.metadata.outcome === "string"
        ? memoryItem.metadata.outcome
        : undefined;
    const participants = Array.isArray(memoryItem.metadata.participants)
      ? memoryItem.metadata.participants.map((item) => String(item))
      : [];
    const tags = Array.isArray(memoryItem.metadata.tags)
      ? memoryItem.metadata.tags.map((item) => String(item))
      : [];
    const eventType =
      typeof memoryItem.metadata.event_type === "string"
        ? memoryItem.metadata.event_type
        : undefined;

    const ep: Episode = {
      episodeId: memoryItem.id,
      userId: memoryItem.userId,
      sessionId,
      timestamp: memoryItem.timestamp,
      content: memoryItem.content,
      context,
      outcome,
      importance: memoryItem.importance,
      participants,
      tags,
      eventType,
    };
    this.episodes.push(ep);

    const bucket = this.sessions.get(sessionId) ?? [];
    bucket.push(ep.episodeId);
    this.sessions.set(sessionId, bucket);

    if (this.kvStore) {
      await this.kvStore.put(memoryItem.id, memoryItem);
    }

    if (this.vectorStore) {
      const vector = await this.embed(memoryItem.content);
      await this.vectorStore.upsertVector({
        id: memoryItem.id,
        vector,
        payload: {
          content: memoryItem.content,
          memoryType: "episodic",
          userId: memoryItem.userId,
          importance: memoryItem.importance,
          timestamp: memoryItem.timestamp.toISOString(),
          metadata: {
            session_id: sessionId,
            context,
            outcome,
            participants,
            tags,
            event_type: eventType,
          },
        },
      });
    }

    return memoryItem.id;
  }

  async retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): Promise<MemoryItem[]> {
    const userId =
      typeof options.userId === "string" ? options.userId : undefined;
    const sessionId =
      typeof options.sessionId === "string" ? options.sessionId : undefined;
    const timeRange = Array.isArray(options.timeRange)
      ? (options.timeRange as [Date, Date])
      : undefined;
    const importanceThreshold =
      typeof options.importanceThreshold === "number"
        ? options.importanceThreshold
        : undefined;

    const q = query.trim().toLowerCase();
    if (this.vectorStore) {
      const vector = await this.embed(query);
      const results = await this.vectorStore.queryVector({
        vector,
        limit: Math.max(limit * 5, 20),
        filter: {
          memoryType: "episodic",
          ...(userId ? {userId} : {}),
          ...(sessionId ? {"metadata.session_id": sessionId} : {}),
        },
      });

      const nowMs = Date.now();
      const seen = new Set<string>();
      const scored: Array<{item: MemoryItem; score: number}> = [];

      for (const result of results) {
        const payload = result.payload ?? {};
        const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
        const stored = this.kvStore ? await this.kvStore.get(String(result.id)) : null;
        const resolved = stored ?? (payload as Partial<MemoryItem>);
        const timestamp = resolved?.timestamp
          ? new Date(resolved.timestamp as Date | string)
          : payload.timestamp
            ? new Date(String(payload.timestamp))
            : new Date();
        const importance =
          typeof resolved?.importance === "number"
            ? resolved.importance
            : typeof payload.importance === "number"
              ? payload.importance
              : 0.5;
        if (importanceThreshold !== undefined && importance < importanceThreshold) {
          continue;
        }
        if (timeRange && (timestamp < timeRange[0] || timestamp > timeRange[1])) {
          continue;
        }

        const mergedMetadata = {
          ...metadata,
          ...(resolved?.metadata && typeof resolved.metadata === "object"
            ? (resolved.metadata as Record<string, unknown>)
            : {}),
        };
        const context = mergedMetadata.context as Record<string, unknown> | undefined;
        if (context?.forgotten) continue;

        const vecScore = result.score ?? 0;
        const ageDays = Math.max(0, (nowMs - timestamp.getTime()) / 86400000);
        const recencyScore = 1 / (1 + ageDays);
        const base = vecScore * 0.8 + recencyScore * 0.2;
        const weight = 0.8 + importance * 0.4;
        const combined = base * weight;

        const item: MemoryItem = {
          id: String(result.id),
          content: String(resolved?.content ?? payload.content ?? ""),
          memoryType: "episodic",
          userId: String(resolved?.userId ?? payload.userId ?? ""),
          timestamp,
          importance,
          metadata: {
            ...mergedMetadata,
            combined_score: combined,
            vector_score: vecScore,
            recency_score: recencyScore,
          },
        };

        if (seen.has(item.id)) continue;
        seen.add(item.id);
        scored.push({item, score: combined});
      }

      return scored
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, Math.floor(limit)))
        .map((entry) => entry.item);
    }

    const scored = this.episodes
      .filter((e) => (userId ? e.userId === userId : true))
      .filter((e) => (sessionId ? e.sessionId === sessionId : true))
      .filter((e) => {
        if (importanceThreshold !== undefined && e.importance < importanceThreshold) {
          return false;
        }
        if (timeRange && (e.timestamp < timeRange[0] || e.timestamp > timeRange[1])) {
          return false;
        }
        if (e.context?.forgotten) return false;
        return true;
      })
      .map((e) => {
        const keyword = q ? (e.content.toLowerCase().includes(q) ? 1 : 0) : 0.2;
        const recency =
          1 / (1 + (Date.now() - e.timestamp.getTime()) / 86400000);
        const impWeight = 0.8 + e.importance * 0.4;
        return {score: (keyword * 0.8 + recency * 0.2) * impWeight, ep: e};
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.floor(limit)));

    return scored.map(({ep}) => ({
      id: ep.episodeId,
      content: ep.content,
      memoryType: "episodic",
      userId: ep.userId,
      timestamp: ep.timestamp,
      importance: ep.importance,
      metadata: {
        session_id: ep.sessionId,
        context: ep.context,
        outcome: ep.outcome,
        participants: ep.participants,
        tags: ep.tags,
        event_type: ep.eventType,
      },
    }));
  }

  async update(
    memoryId: string,
    content?: string,
    importance?: number,
    metadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const idx = this.episodes.findIndex((e) => e.episodeId === memoryId);
    if (idx < 0) return false;
    const ep = this.episodes[idx];
    this.episodes[idx] = {
      ...ep,
      content: content ?? ep.content,
      importance:
        typeof importance === "number" ? clamp01(importance) : ep.importance,
      context:
        metadata?.context && typeof metadata.context === "object"
          ? (metadata.context as Record<string, unknown>)
          : ep.context,
      outcome:
        typeof metadata?.outcome === "string" ? metadata.outcome : ep.outcome,
      participants: Array.isArray(metadata?.participants)
        ? metadata?.participants.map((item) => String(item))
        : ep.participants,
      tags: Array.isArray(metadata?.tags)
        ? metadata?.tags.map((item) => String(item))
        : ep.tags,
      eventType:
        typeof metadata?.event_type === "string"
          ? metadata.event_type
          : ep.eventType,
    };

    if (this.kvStore) {
      const updated = this.episodes[idx];
      const item: MemoryItem = {
        id: updated.episodeId,
        content: updated.content,
        memoryType: "episodic",
        userId: updated.userId,
        timestamp: updated.timestamp,
        importance: updated.importance,
        metadata: {
          session_id: updated.sessionId,
          context: updated.context,
          outcome: updated.outcome,
          participants: updated.participants,
          tags: updated.tags,
          event_type: updated.eventType,
        },
      };
      await this.kvStore.put(memoryId, item);
    }

    if (this.vectorStore && content) {
      const vector = await this.embed(content);
      await this.vectorStore.upsertVector({
        id: memoryId,
        vector,
        payload: {
          content,
          memoryType: "episodic",
          userId: ep.userId,
          importance: typeof importance === "number" ? importance : ep.importance,
          timestamp: ep.timestamp.toISOString(),
          metadata: {
            session_id: ep.sessionId,
            context: ep.context,
            outcome: ep.outcome,
            participants: ep.participants,
            tags: ep.tags,
            event_type: ep.eventType,
          },
        },
      });
    }

    return true;
  }

  async remove(memoryId: string): Promise<boolean> {
    const idx = this.episodes.findIndex((e) => e.episodeId === memoryId);
    if (idx < 0) return false;
    const [removed] = this.episodes.splice(idx, 1);
    const ids = this.sessions.get(removed.sessionId) ?? [];
    this.sessions.set(
      removed.sessionId,
      ids.filter((id) => id !== memoryId),
    );

    if (this.kvStore) {
      await this.kvStore.delete(memoryId);
    }

    if (this.vectorStore) {
      await this.vectorStore.deleteVector(memoryId);
    }

    return true;
  }

  async hasMemory(memoryId: string): Promise<boolean> {
    return this.episodes.some((e) => e.episodeId === memoryId);
  }

  async clear(): Promise<void> {
    this.episodes.length = 0;
    this.sessions.clear();
    if (this.vectorStore?.clear) {
      await this.vectorStore.clear();
    }
  }

  async getStats(): Promise<Record<string, unknown>> {
    const avgImportance = this.episodes.length
      ? this.episodes.reduce((acc, e) => acc + e.importance, 0) /
        this.episodes.length
      : 0;
    return {
      count: this.episodes.length,
      sessionsCount: this.sessions.size,
      avgImportance,
      memoryType: "episodic",
    };
  }

  private async embed(text: string): Promise<number[]> {
    const raw = await this.embedder.encode(text);
    if (Array.isArray(raw) && typeof raw[0] === "number") {
      return raw as number[];
    }
    return [];
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}
