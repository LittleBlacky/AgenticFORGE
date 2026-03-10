import {BaseMemory, type MemoryConfig, type MemoryItem} from "./base";

export interface Episode {
  episodeId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  content: string;
  context: Record<string, unknown>;
  outcome?: string;
  importance: number;
}

export class EpisodicMemory extends BaseMemory {
  private readonly episodes: Episode[] = [];
  private readonly sessions = new Map<string, string[]>();

  constructor(config: Partial<MemoryConfig> = {}) {
    super(config);
  }

  add(memoryItem: MemoryItem): string {
    const sessionId = String(
      memoryItem.metadata.session_id ?? "default_session",
    );
    const context =
      (memoryItem.metadata.context as Record<string, unknown>) ?? {};
    const outcome =
      typeof memoryItem.metadata.outcome === "string"
        ? memoryItem.metadata.outcome
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
    };
    this.episodes.push(ep);

    const bucket = this.sessions.get(sessionId) ?? [];
    bucket.push(ep.episodeId);
    this.sessions.set(sessionId, bucket);

    return memoryItem.id;
  }

  retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): MemoryItem[] {
    const userId =
      typeof options.userId === "string" ? options.userId : undefined;
    const sessionId =
      typeof options.sessionId === "string" ? options.sessionId : undefined;

    const q = query.trim().toLowerCase();
    const scored = this.episodes
      .filter((e) => (userId ? e.userId === userId : true))
      .filter((e) => (sessionId ? e.sessionId === sessionId : true))
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
      },
    }));
  }

  update(
    memoryId: string,
    content?: string,
    importance?: number,
    metadata?: Record<string, unknown>,
  ): boolean {
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
    };
    return true;
  }

  remove(memoryId: string): boolean {
    const idx = this.episodes.findIndex((e) => e.episodeId === memoryId);
    if (idx < 0) return false;
    const [removed] = this.episodes.splice(idx, 1);
    const ids = this.sessions.get(removed.sessionId) ?? [];
    this.sessions.set(
      removed.sessionId,
      ids.filter((id) => id !== memoryId),
    );
    return true;
  }

  hasMemory(memoryId: string): boolean {
    return this.episodes.some((e) => e.episodeId === memoryId);
  }

  clear(): void {
    this.episodes.length = 0;
    this.sessions.clear();
  }

  getStats(): Record<string, unknown> {
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
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.5));
}

