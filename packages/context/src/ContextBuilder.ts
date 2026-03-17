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
  private readonly config: Required<Omit<ContextBuilderConfig, "tokenCounter">> & {
    tokenCounter?: TokenCounter;
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
      ? this.selectMmr(scoredPackets, input.userQuery, budget)
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

  private selectGreedy(
    packets: Array<ContextPacket & {tokens: number}>,
    budget: number,
  ): Array<ContextPacket & {tokens: number}> {
    const sorted = [...packets].sort(
      (a, b) => (b.relevanceScore ?? 0.5) - (a.relevanceScore ?? 0.5),
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

  private selectMmr(
    packets: Array<ContextPacket & {tokens: number}>,
    query: string,
    budget: number,
  ): Array<ContextPacket & {tokens: number}> {
    if (packets.length === 0) return [];
    const lambda = this.config.mmrLambda;
    const queryVec = simpleVec(query);
    const remaining = [...packets];
    const selected: Array<ContextPacket & {tokens: number}> = [];
    let used = 0;

    while (remaining.length > 0 && used < budget) {
      let bestScore = -Infinity;
      let bestIdx = 0;

      for (let i = 0; i < remaining.length; i++) {
        const p = remaining[i]!;
        if (used + p.tokens > budget) continue;
        const rel = cosine(queryVec, simpleVec(p.content));
        const maxSim =
          selected.length > 0
            ? Math.max(
                ...selected.map((s) =>
                  cosine(simpleVec(s.content), simpleVec(p.content)),
                ),
              )
            : 0;
        const score = lambda * rel - (1 - lambda) * maxSim;
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
// Internal helpers
// ---------------------------------------------------------------------------

function simpleVec(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const tok of text.toLowerCase().split(/\s+/g).filter(Boolean)) {
    freq.set(tok, (freq.get(tok) ?? 0) + 1);
  }
  return freq;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    na += v * v;
  }
  for (const v of b.values()) nb += v * v;
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
