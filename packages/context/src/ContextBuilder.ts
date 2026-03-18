import type {TokenCounter} from "./tokenizer";
import {estimateTokens} from "./tokenizer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ContextPacket {
  content: string;
  metadata: Record<string, unknown>;
  tokens?: number;
  relevanceScore?: number;
  /** Unix timestamp in ms (Date.now()). Used for recency scoring. */
  timestamp?: number;
}

/**
 * Optional async text embedder for semantic vector similarity.
 * When provided, MMR uses cosine similarity on dense vectors.
 * When absent, falls back to TF-IDF weighted bag-of-words cosine.
 *
 * @example
 *   const embedder: TextEmbedder = async (texts) => {
 *     const res = await openai.embeddings.create({ model: "text-embedding-3-small", input: texts });
 *     return res.data.map(d => d.embedding);
 *   };
 */
export type TextEmbedder = (texts: string[]) => Promise<number[][]>;

/**
 * Describes the shape of embedders from `@agenticforge/memory`.
 * Compatible with `HashTextEmbedder` and `OpenAITextEmbedder`.
 */
export interface MemoryEmbedderLike {
  encode(text: string | string[]): Promise<number[] | number[][]>;
}

/**
 * Adapts a `@agenticforge/memory` embedder to the `TextEmbedder` function type
 * expected by `ContextBuilder`.
 *
 * @example
 *   import { createDefaultTextEmbedder } from '@agenticforge/memory';
 *   const builder = new ContextBuilder({
 *     config: { enableMmr: true, memoryEmbedder: createDefaultTextEmbedder() },
 *   });
 */
export function fromMemoryEmbedder(embedder: MemoryEmbedderLike): TextEmbedder {
  return async (texts: string[]): Promise<number[][]> => {
    const result = await embedder.encode(texts);
    // encode(string[]) always returns number[][], but the type says number[]|number[][].
    // We normalise: if it's a flat number[] (single-text case), wrap it.
    if (result.length === 0) return [];
    if (typeof result[0] === "number") {
      // flat vector returned — wrap as single-element matrix
      return [result as number[]];
    }
    return result as number[][];
  };
}

export interface ContextBuilderConfig {
  maxTokens?: number;
  minRelevance?: number;
  enableMmr?: boolean;
  mmrLambda?: number;
  mmrVectorCacheSize?: number;
  enableMmrVectorCache?: boolean;
  tokenCounter?: TokenCounter;
  systemTokenBudget?: number;
  historyTokenBudget?: number;
  /** Weight for recency score in composite score (0-1). Default 0.3. */
  recencyWeight?: number;
  /** Time scale in milliseconds for recency decay. Default 3600000 (1 hour). */
  recencyTau?: number;
  /**
   * Optional async text embedder for semantic MMR similarity.
   * When set, MMR uses dense vector cosine similarity instead of TF-IDF.
   */
  embedder?: TextEmbedder;
  /**
   * Convenience field: pass a `@agenticforge/memory` embedder directly.
   * Automatically adapted via `fromMemoryEmbedder()`.
   * If both `embedder` and `memoryEmbedder` are set, `embedder` takes precedence.
   */
  memoryEmbedder?: MemoryEmbedderLike;
}

export interface BuildContextInput {
  userQuery: string;
  conversationHistory?: Message[];
  systemInstructions?: string;
  additionalPackets?: ContextPacket[];
}

export interface BuiltContext {
  system: string;
  messages: Message[];
  totalTokens: number;
  includedPackets: ContextPacket[];
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// ContextPacketBuilder
// ---------------------------------------------------------------------------

export class ContextPacketBuilder {
  static create(
    content: string,
    metadata: Record<string, unknown> = {},
  ): ContextPacket {
    return {content, metadata};
  }

  static withRelevance(packet: ContextPacket, score: number): ContextPacket {
    return {...packet, relevanceScore: score};
  }
}

// ---------------------------------------------------------------------------
// ContextBuilder
// ---------------------------------------------------------------------------

export class ContextBuilder {
  private readonly config: Required<Omit<ContextBuilderConfig, "tokenCounter" | "embedder" | "memoryEmbedder">> & {
    tokenCounter?: TokenCounter;
    embedder?: TextEmbedder;
  };

  constructor(options: {config?: ContextBuilderConfig} = {}) {
    const cfg = options.config ?? {};
    this.config = {
      maxTokens: cfg.maxTokens ?? 4096,
      minRelevance: cfg.minRelevance ?? 0,
      enableMmr: cfg.enableMmr ?? false,
      mmrLambda: cfg.mmrLambda ?? 0.5,
      mmrVectorCacheSize: cfg.mmrVectorCacheSize ?? 128,
      enableMmrVectorCache: cfg.enableMmrVectorCache ?? false,
      tokenCounter: cfg.tokenCounter,
      systemTokenBudget: cfg.systemTokenBudget ?? 512,
      historyTokenBudget: cfg.historyTokenBudget ?? 1024,
      recencyWeight: cfg.recencyWeight ?? 0.3,
      recencyTau: cfg.recencyTau ?? 3_600_000,
      // memoryEmbedder takes lower precedence than explicit embedder
      embedder: cfg.embedder ?? (cfg.memoryEmbedder ? fromMemoryEmbedder(cfg.memoryEmbedder) : undefined),
    };
  }

  async build(input: BuildContextInput): Promise<BuiltContext> {
    const counter = this.config.tokenCounter;
    const maxTokens = this.config.maxTokens;
    let budget = maxTokens;
    let totalTokens = 0;
    const truncated = false;

    const systemText = input.systemInstructions ?? "";
    const systemTokens = estimateTokens(systemText, counter);
    budget -= systemTokens;
    totalTokens += systemTokens;

    const history = input.conversationHistory ?? [];
    const historyBudget = Math.min(
      this.config.historyTokenBudget,
      Math.floor(budget * 0.6),
    );
    const includedHistory: Message[] = [];
    let historyTokensUsed = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      const msg = history[i]!;
      const t = estimateTokens(msg.content, counter);
      if (historyTokensUsed + t > historyBudget) break;
      includedHistory.unshift(msg);
      historyTokensUsed += t;
    }
    budget -= historyTokensUsed;
    totalTokens += historyTokensUsed;

    const packets = input.additionalPackets ?? [];
    const scoredPackets = packets
      .filter((p) => (p.relevanceScore ?? 1) >= this.config.minRelevance)
      .map((p) => ({
        ...p,
        tokens: estimateTokens(p.content, counter),
      }));

    const selectedPackets = this.config.enableMmr
      ? await this.selectMmr(scoredPackets, input.userQuery, budget)
      : this.selectGreedy(scoredPackets, budget);

    const packetTokens = selectedPackets.reduce(
      (acc, p) => acc + (p.tokens ?? 0),
      0,
    );
    totalTokens += packetTokens;

    const messages: Message[] = [
      ...includedHistory,
      {role: "user" as const, content: input.userQuery},
    ];

    return {
      system: systemText,
      messages,
      totalTokens,
      includedPackets: selectedPackets,
      truncated,
    };
  }

  private compositeScore(packet: ContextPacket, relevance: number): number {
    const rw = this.config.recencyWeight;
    const tau = this.config.recencyTau;
    const now = Date.now();
    const ts = packet.timestamp ?? now;
    const delta = Math.max(now - ts, 0);
    const recency = Math.exp(-delta / tau);
    return (1 - rw) * relevance + rw * recency;
  }

  private selectGreedy(
    packets: Array<ContextPacket & {tokens: number}>,
    budget: number,
  ): Array<ContextPacket & {tokens: number}> {
    const sorted = [...packets].sort(
      (a, b) =>
        this.compositeScore(b, b.relevanceScore ?? 0.5) -
        this.compositeScore(a, a.relevanceScore ?? 0.5),
    );
    const selected: Array<ContextPacket & {tokens: number}> = [];
    let used = 0;
    for (const p of sorted) {
      if (used + p.tokens <= budget) {
        selected.push(p);
        used += p.tokens;
      }
    }
    return selected;
  }

  private async selectMmr(
    packets: Array<ContextPacket & {tokens: number}>,
    query: string,
    budget: number,
  ): Promise<Array<ContextPacket & {tokens: number}>> {
    if (packets.length === 0) return [];
    const lambda = this.config.mmrLambda;

    // ------------------------------------------------------------------
    // Build vector representations
    // Priority: external embedder (dense) → TF-IDF weighted bag-of-words
    // ------------------------------------------------------------------
    type PacketWithTokens = ContextPacket & {tokens: number};
    let vecMap: Map<PacketWithTokens, number[]>;
    let queryVec: number[];

    if (this.config.embedder) {
      try {
        const texts = [query, ...packets.map((p) => p.content)];
        const vecs = await this.config.embedder(texts);
        queryVec = vecs[0] ?? [];
        vecMap = new Map(packets.map((p, i) => [p, vecs[i + 1] ?? []]));
      } catch {
        // embedder failed — fall back to TF-IDF
        const {qv, pm} = buildTfIdfVecs(query, packets);
        queryVec = qv;
        vecMap = pm;
      }
    } else {
      const {qv, pm} = buildTfIdfVecs(query, packets);
      queryVec = qv;
      vecMap = pm;
    }

    const remaining = [...packets];
    const selected: Array<PacketWithTokens> = [];
    let used = 0;

    while (remaining.length > 0 && used < budget) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i]!;
        if (used + p.tokens > budget) continue;

        // Relevance: cosine(query, p) → composite with recency
        const pVec = vecMap.get(p) ?? [];
        const relCos = denseCosine(queryVec, pVec);
        const composite = this.compositeScore(p, relCos);

        // Diversity penalty: max cosine to already-selected
        const maxSim =
          selected.length > 0
            ? Math.max(
                ...selected.map((s) => denseCosine(pVec, vecMap.get(s) ?? [])),
              )
            : 0;

        const score = lambda * composite - (1 - lambda) * maxSim;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      const chosen = remaining[bestIdx]!;
      if (used + chosen.tokens > budget) break;
      selected.push(chosen);
      used += chosen.tokens;
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }
}

// ---------------------------------------------------------------------------
// TF-IDF helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s\W]+/g).filter(Boolean);
}

function buildIdf(docs: string[]): Map<string, number> {
  const df = new Map<string, number>();
  const N = docs.length;
  for (const doc of docs) {
    const terms = new Set(tokenize(doc));
    for (const term of terms) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    // Smooth IDF: log((N+1)/(count+1)) + 1
    idf.set(term, Math.log((N + 1) / (count + 1)) + 1);
  }
  return idf;
}

function tfidfArray(text: string, idf: Map<string, number>, termIndex: Map<string, number>): number[] {
  const terms = tokenize(text);
  const tf = new Map<string, number>();
  for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
  const arr = new Array<number>(termIndex.size).fill(0);
  for (const [term, freq] of tf) {
    const idx = termIndex.get(term);
    if (idx === undefined) continue;
    const idfVal = idf.get(term) ?? Math.log(2);
    arr[idx] = (freq / Math.max(terms.length, 1)) * idfVal;
  }
  return arr;
}

function buildTfIdfVecs<T extends {content: string}>(
  query: string,
  packets: T[],
): {qv: number[]; pm: Map<T, number[]>} {
  const corpus = [query, ...packets.map((p) => p.content)];
  const idf = buildIdf(corpus);
  const termIndex = new Map<string, number>();
  for (const [term] of idf) {
    if (!termIndex.has(term)) termIndex.set(term, termIndex.size);
  }
  const qv = tfidfArray(query, idf, termIndex);
  const pm = new Map<T, number[]>();
  for (const p of packets) pm.set(p, tfidfArray(p.content, idf, termIndex));
  return {qv, pm};
}

// ---------------------------------------------------------------------------
// Dense cosine similarity
// ---------------------------------------------------------------------------

function denseCosine(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i]! * b[i]!;
    na  += a[i]! * a[i]!;
    nb  += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
