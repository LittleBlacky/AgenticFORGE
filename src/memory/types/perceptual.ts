import {BaseMemory, type MemoryConfig, type MemoryItem} from "./base";
import {HashTextEmbedder} from "../rag/pipeline";

export type PerceptualModality =
  | "text"
  | "image"
  | "audio"
  | "video"
  | "structured";

export interface Perception {
  perceptionId: string;
  data: unknown;
  modality: PerceptualModality;
  encoding: number[];
  metadata: Record<string, unknown>;
  timestamp: Date;
  dataHash: string;
}

export class PerceptualMemory extends BaseMemory {
  private readonly perceptions = new Map<string, Perception>();
  private readonly perceptualMemories: MemoryItem[] = [];
  private readonly modalityIndex = new Map<PerceptualModality, string[]>();
  private readonly supportedModalities: Set<string>;
  private readonly embedder = new HashTextEmbedder(384);

  constructor(config: Partial<MemoryConfig> = {}) {
    super(config);
    this.supportedModalities = new Set(this.config.perceptualMemoryModalities);
  }

  add(memoryItem: MemoryItem): string {
    const modality =
      (memoryItem.metadata.modality as PerceptualModality) ?? "text";
    if (!this.supportedModalities.has(modality)) {
      throw new Error(`不支持的模态类型: ${modality}`);
    }

    const rawData = memoryItem.metadata.raw_data ?? memoryItem.content;
    const perception = this.encodePerception(rawData, modality, memoryItem.id);

    this.perceptions.set(perception.perceptionId, perception);
    const ids = this.modalityIndex.get(modality) ?? [];
    ids.push(perception.perceptionId);
    this.modalityIndex.set(modality, ids);

    memoryItem.metadata.perception_id = perception.perceptionId;
    memoryItem.metadata.modality = modality;
    this.perceptualMemories.push(memoryItem);

    return memoryItem.id;
  }

  retrieve(
    query: string,
    limit = 5,
    options: Record<string, unknown> = {},
  ): MemoryItem[] {
    const targetModality =
      (options.targetModality as PerceptualModality | undefined) ?? undefined;
    const queryModality =
      (options.queryModality as PerceptualModality | undefined) ??
      targetModality ??
      "text";

    const queryEncoding = this.encodeData(query, queryModality);

    const scored = this.perceptualMemories
      .filter((m) =>
        targetModality ? m.metadata.modality === targetModality : true,
      )
      .map((m) => {
        const perceptionId = String(m.metadata.perception_id ?? "");
        const p = this.perceptions.get(perceptionId);
        const sim = p ? cosine(queryEncoding, p.encoding) : 0;
        const recency =
          1 / (1 + (Date.now() - m.timestamp.getTime()) / 86400000);
        const base = sim * 0.8 + recency * 0.2;
        const weight = 0.8 + m.importance * 0.4;
        return {score: base * weight, item: m};
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.floor(limit)));

    return scored.map((x) => ({
      ...x.item,
      metadata: {...x.item.metadata, relevance_score: x.score},
    }));
  }

  update(
    memoryId: string,
    content?: string,
    importance?: number,
    metadata?: Record<string, unknown>,
  ): boolean {
    const idx = this.perceptualMemories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;

    const old = this.perceptualMemories[idx];
    const next: MemoryItem = {
      ...old,
      content: content ?? old.content,
      importance:
        typeof importance === "number" ? clamp01(importance) : old.importance,
      metadata: metadata ? {...old.metadata, ...metadata} : old.metadata,
    };

    if (content !== undefined || (metadata && "raw_data" in metadata)) {
      const modality = (next.metadata.modality as PerceptualModality) ?? "text";
      const raw = next.metadata.raw_data ?? next.content;
      const perception = this.encodePerception(raw, modality, memoryId);
      this.perceptions.set(perception.perceptionId, perception);
      next.metadata.perception_id = perception.perceptionId;
    }

    this.perceptualMemories[idx] = next;
    return true;
  }

  remove(memoryId: string): boolean {
    const idx = this.perceptualMemories.findIndex((m) => m.id === memoryId);
    if (idx < 0) return false;

    const [removed] = this.perceptualMemories.splice(idx, 1);
    const pid = String(removed.metadata.perception_id ?? "");
    const modality =
      (removed.metadata.modality as PerceptualModality) ?? "text";

    this.perceptions.delete(pid);
    const arr = this.modalityIndex.get(modality) ?? [];
    this.modalityIndex.set(
      modality,
      arr.filter((x) => x !== pid),
    );
    return true;
  }

  hasMemory(memoryId: string): boolean {
    return this.perceptualMemories.some((m) => m.id === memoryId);
  }

  clear(): void {
    this.perceptualMemories.length = 0;
    this.perceptions.clear();
    this.modalityIndex.clear();
  }

  getStats(): Record<string, unknown> {
    const modalityCounts: Record<string, number> = {};
    for (const [mod, ids] of this.modalityIndex.entries()) {
      modalityCounts[mod] = ids.length;
    }

    const avgImportance = this.perceptualMemories.length
      ? this.perceptualMemories.reduce((acc, m) => acc + m.importance, 0) /
        this.perceptualMemories.length
      : 0;

    return {
      count: this.perceptualMemories.length,
      perceptionsCount: this.perceptions.size,
      modalityCounts,
      supportedModalities: [...this.supportedModalities],
      avgImportance,
      memoryType: "perceptual",
    };
  }

  crossModalSearch(
    query: unknown,
    queryModality: PerceptualModality,
    targetModality?: PerceptualModality,
    limit = 5,
  ): MemoryItem[] {
    return this.retrieve(String(query ?? ""), limit, {
      queryModality,
      targetModality,
    });
  }

  getByModality(modality: PerceptualModality, limit = 10): MemoryItem[] {
    return this.perceptualMemories
      .filter((m) => m.metadata.modality === modality)
      .slice(0, Math.max(1, Math.floor(limit)));
  }

  generateContent(
    prompt: string,
    targetModality: PerceptualModality,
  ): string | null {
    if (!this.supportedModalities.has(targetModality)) return null;

    const relevant = this.retrieve(prompt, 3, {targetModality});
    if (!relevant.length) return null;

    if (targetModality === "text") {
      return [
        "基于感知记忆生成的内容：",
        ...relevant.map((m) => m.content),
      ].join("\n");
    }

    return `生成的${targetModality}内容（基于${relevant.length}个相关记忆）`;
  }

  private encodePerception(
    data: unknown,
    modality: PerceptualModality,
    memoryId: string,
  ): Perception {
    const encoding = this.encodeData(data, modality);
    return {
      perceptionId: `perception_${memoryId}`,
      data,
      modality,
      encoding,
      metadata: {source: "memory_system"},
      timestamp: new Date(),
      dataHash: simpleHash(JSON.stringify(data) || String(data)),
    };
  }

  private encodeData(data: unknown, modality: PerceptualModality): number[] {
    if (modality === "text") {
      const v = this.embedder.encode(String(data ?? ""));
      return Array.isArray(v) && typeof v[0] === "number"
        ? (v as number[])
        : [];
    }
    // lightweight deterministic hash embedding for non-text modalities
    return hashToVector(String(data ?? ""), 384);
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

function hashToVector(data: string, dim: number): number[] {
  let seed = 0;
  for (let i = 0; i < data.length; i += 1) {
    seed = (seed << 5) - seed + data.charCodeAt(i);
    seed |= 0;
  }
  const out = new Array<number>(dim).fill(0);
  let cur = Math.abs(seed) + 1;
  for (let i = 0; i < dim; i += 1) {
    cur = (cur * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (cur % 10000) / 10000;
  }
  return out;
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
