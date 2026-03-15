/**
 * ContextBuilder - GSSC 流水线实现
 *
 * 实现 Gather-Select-Structure-Compress 上下文构建流程：
 * 1. Gather: 从多源收集候选信息（历史、记忆、RAG、工具结果）
 * 2. Select: 基于优先级、相关性、多样性筛选
 * 3. Structure: 组织成结构化上下文模板
 * 4. Compress: 在预算内压缩与规范化
 */

import {Message} from "../core/message";
import type {TextEmbedder} from "../memory/rag/pipeline";
import {createDefaultTextEmbedder} from "../memory/embedding";
import {MemoryTool} from "../tools/builtin/memory";
import {RagTool} from "../tools/builtin/rag";
import {roughCountTokens} from "./tokenizer";

export interface ContextPacket {
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  tokenCount: number;
  relevanceScore: number;
}

export class ContextPacketBuilder {
  static create(
    content: string,
    metadata: Record<string, unknown> = {},
    tokenCounter: TokenCounter = roughCountTokens,
  ): ContextPacket {
    return {
      content,
      metadata,
      timestamp: new Date(),
      tokenCount: tokenCounter(content),
      relevanceScore: 0,
    };
  }
}

export type TokenCounter = (text: string) => number;

export interface ContextConfig {
  maxTokens?: number; // 总预算
  reserveRatio?: number; // 生成余量（10-20%）
  minRelevance?: number; // 最小相关性阈值
  enableMmr?: boolean; // 启用最大边际相关性（多样性）
  mmrLambda?: number; // MMR平衡参数（0=纯多样性, 1=纯相关性）
  systemPromptTemplate?: string; // 系统提示模板
  enableCompression?: boolean; // 启用压缩
  tokenCounter?: TokenCounter; // 自定义 token 计数器
  mmrEmbedder?: TextEmbedder; // MMR 向量相似度 embedder
  mmrEmbeddingDimension?: number; // Hash embedder 向量维度
  mmrVectorCacheSize?: number; // 向量缓存容量（LRU）
}

export interface ContextBuilderOptions {
  memoryTool?: MemoryTool | null;
  ragTool?: RagTool | null;
  config?: ContextConfig;
}

export class ContextBuilder {
  private readonly memoryTool?: MemoryTool | null;
  private readonly ragTool?: RagTool | null;
  private readonly config: Required<ContextConfig>;
  private mmrVectorCache: LruCache<string, number[]> | null = null;

  constructor(options: ContextBuilderOptions = {}) {
    this.memoryTool = options.memoryTool ?? null;
    this.ragTool = options.ragTool ?? null;
    this.config = {
      maxTokens: 8000,
      reserveRatio: 0.15,
      minRelevance: 0.3,
      enableMmr: true,
      mmrLambda: 0.7,
      systemPromptTemplate: "",
      enableCompression: true,
      tokenCounter: roughCountTokens,
      mmrEmbedder: createDefaultTextEmbedder(options.config?.mmrEmbeddingDimension),
      mmrEmbeddingDimension: 384,
      mmrVectorCacheSize: 256,
      ...options.config,
    };
  }

  getAvailableTokens(): number {
    return Math.floor(this.config.maxTokens * (1 - this.config.reserveRatio));
  }

  async build(params: {
    userQuery: string;
    conversationHistory?: Message[];
    systemInstructions?: string | null;
    additionalPackets?: ContextPacket[];
  }): Promise<string> {
    const tokenCache = new Map<string, number>();
    const cachedCounter: TokenCounter = (text) => {
      const cached = tokenCache.get(text);
      if (cached !== undefined) return cached;
      const count = this.config.tokenCounter(text);
      tokenCache.set(text, count);
      return count;
    };

    const packets = await this.gather({
      userQuery: params.userQuery,
      conversationHistory: params.conversationHistory ?? [],
      systemInstructions: params.systemInstructions ?? null,
      additionalPackets: params.additionalPackets ?? [],
      tokenCounter: cachedCounter,
    });

    const selected = await this.select(packets, params.userQuery);
    const structured = this.structure({
      selectedPackets: selected,
      userQuery: params.userQuery,
      systemInstructions: params.systemInstructions ?? null,
    });

    return this.compress(structured, cachedCounter);
  }

  private async gather(params: {
    userQuery: string;
    conversationHistory: Message[];
    systemInstructions: string | null;
    additionalPackets: ContextPacket[];
    tokenCounter: TokenCounter;
  }): Promise<ContextPacket[]> {
    const packets: ContextPacket[] = [];

    const tokenCounter = params.tokenCounter;

    // P0: 系统指令（强约束）
    if (params.systemInstructions) {
      packets.push(
        ContextPacketBuilder.create(
          params.systemInstructions,
          {type: "instructions"},
          tokenCounter,
        ),
      );
    }

    // P1: 从记忆中获取任务状态与关键结论
    if (this.memoryTool) {
      try {
        const stateResults = await this.memoryTool.run({
          action: "search",
          query: "(任务状态 OR 子目标 OR 结论 OR 阻塞)",
          min_importance: 0.7,
          limit: 5,
        });
        if (stateResults && !stateResults.includes("未找到")) {
          packets.push(
            ContextPacketBuilder.create(
              stateResults,
              {
                type: "task_state",
                importance: "high",
              },
              tokenCounter,
            ),
          );
        }

        const relatedResults = await this.memoryTool.run({
          action: "search",
          query: params.userQuery,
          limit: 5,
        });
        if (relatedResults && !relatedResults.includes("未找到")) {
          packets.push(
            ContextPacketBuilder.create(
              relatedResults,
              {type: "related_memory"},
              tokenCounter,
            ),
          );
        }
      } catch (error) {
        console.warn("⚠️ 记忆检索失败:", error);
      }
    }

    // P2: 从RAG中获取事实证据
    if (this.ragTool) {
      try {
        const ragResults = await this.ragTool.run({
          action: "search",
          query: params.userQuery,
          limit: 5,
        });
        if (ragResults && !ragResults.includes("未找到") && !ragResults.includes("错误")) {
          packets.push(
            ContextPacketBuilder.create(
              ragResults,
              {type: "knowledge_base"},
              tokenCounter,
            ),
          );
        }
      } catch (error) {
        console.warn("⚠️ RAG检索失败:", error);
      }
    }

    // P3: 对话历史（辅助材料）
    if (params.conversationHistory.length > 0) {
      const recentHistory = params.conversationHistory.slice(-10);
      const historyText = recentHistory
        .map((msg) => `[${msg.role}] ${msg.content}`)
        .join("\n");
      packets.push(
        ContextPacketBuilder.create(
          historyText,
          {
            type: "history",
            count: recentHistory.length,
          },
          tokenCounter,
        ),
      );
    }

    packets.push(...params.additionalPackets);
    return packets;
  }

  private async select(packets: ContextPacket[], userQuery: string): Promise<ContextPacket[]> {
    const queryTokens = new Set(userQuery.toLowerCase().split(/\s+/).filter(Boolean));

    for (const packet of packets) {
      const contentTokens = new Set(
        packet.content.toLowerCase().split(/\s+/).filter(Boolean),
      );
      if (queryTokens.size > 0) {
        let overlap = 0;
        for (const token of queryTokens) {
          if (contentTokens.has(token)) overlap += 1;
        }
        packet.relevanceScore = overlap / queryTokens.size;
      } else {
        packet.relevanceScore = 0;
      }
    }

    const recencyScore = (timestamp: Date): number => {
      const deltaSeconds = Math.max((Date.now() - timestamp.getTime()) / 1000, 0);
      const tau = 3600;
      return Math.exp(-deltaSeconds / tau);
    };

    const scored = packets.map((packet) => {
      const recency = recencyScore(packet.timestamp);
      const score = 0.7 * packet.relevanceScore + 0.3 * recency;
      return {score, packet};
    });

    const systemPackets = scored
      .filter(({packet}) => packet.metadata.type === "instructions")
      .map(({packet}) => packet);
    const remaining = scored
      .filter(({packet}) => packet.metadata.type !== "instructions")
      .sort((a, b) => b.score - a.score)
      .map(({packet}) => packet);

    const filtered = remaining.filter(
      (packet) => packet.relevanceScore >= this.config.minRelevance,
    );

    const availableTokens = this.getAvailableTokens();
    const selected: ContextPacket[] = [];
    let usedTokens = 0;

    for (const packet of systemPackets) {
      if (usedTokens + packet.tokenCount <= availableTokens) {
        selected.push(packet);
        usedTokens += packet.tokenCount;
      }
    }

    if (this.config.enableMmr) {
      const mmrSelected = await this.selectWithMmr({
        candidates: filtered,
        tokenBudget: availableTokens - usedTokens,
        lambda: this.config.mmrLambda,
        embedder: this.config.mmrEmbedder,
      });
      for (const packet of mmrSelected) {
        selected.push(packet);
        usedTokens += packet.tokenCount;
      }
    } else {
      for (const packet of filtered) {
        if (usedTokens + packet.tokenCount > availableTokens) continue;
        selected.push(packet);
        usedTokens += packet.tokenCount;
      }
    }

    return selected;
  }

  private async selectWithMmr(params: {
    candidates: ContextPacket[];
    tokenBudget: number;
    lambda: number;
    embedder: TextEmbedder;
  }): Promise<ContextPacket[]> {
    const selected: ContextPacket[] = [];
    const remaining = [...params.candidates];
    let usedTokens = 0;
    const lambda = Math.max(0, Math.min(1, params.lambda));

    const vectors = await this.embedPackets(
      params.candidates,
      params.embedder,
      this.getVectorCache(),
    );

    const lexicalSimilarity = (a: ContextPacket, b: ContextPacket): number => {
      const tokensA = new Set(a.content.toLowerCase().split(/\s+/).filter(Boolean));
      const tokensB = new Set(b.content.toLowerCase().split(/\s+/).filter(Boolean));
      if (tokensA.size === 0 || tokensB.size === 0) return 0;

      let overlap = 0;
      for (const token of tokensA) {
        if (tokensB.has(token)) overlap += 1;
      }
      const union = tokensA.size + tokensB.size - overlap;
      return union === 0 ? 0 : overlap / union;
    };

    const cosine = (a: number[] | null, b: number[] | null): number => {
      if (!a || !b || a.length === 0 || b.length === 0) return 0;
      let dot = 0;
      let normA = 0;
      let normB = 0;
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const va = a[i]!;
        const vb = b[i]!;
        dot += va * vb;
        normA += va * va;
        normB += vb * vb;
      }
      if (normA === 0 || normB === 0) return 0;
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    while (remaining.length > 0 && usedTokens < params.tokenBudget) {
      let bestIndex = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        if (usedTokens + candidate.tokenCount > params.tokenBudget) {
          continue;
        }

        let diversityPenalty = 0;
        if (selected.length > 0) {
          let maxSimilarity = 0;
          for (const chosen of selected) {
            const vectorSim = cosine(
              vectors.get(candidate) ?? null,
              vectors.get(chosen) ?? null,
            );
            const sim = vectorSim > 0 ? vectorSim : lexicalSimilarity(candidate, chosen);
            if (sim > maxSimilarity) maxSimilarity = sim;
          }
          diversityPenalty = maxSimilarity;
        }

        const mmrScore = lambda * candidate.relevanceScore - (1 - lambda) * diversityPenalty;
        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIndex = i;
        }
      }

      if (bestIndex < 0) break;

      const bestPacket = remaining.splice(bestIndex, 1)[0]!;
      selected.push(bestPacket);
      usedTokens += bestPacket.tokenCount;
    }

    return selected;
  }

  private async embedPackets(
    packets: ContextPacket[],
    embedder: TextEmbedder,
    cache: LruCache<string, number[]>,
  ): Promise<Map<ContextPacket, number[]>> {
    const vectors = new Map<ContextPacket, number[]>();
    if (packets.length === 0) return vectors;

    const pending: {packet: ContextPacket; content: string}[] = [];
    for (const packet of packets) {
      const cached = cache.get(packet.content);
      if (cached) {
        vectors.set(packet, cached);
      } else {
        pending.push({packet, content: packet.content});
      }
    }

    if (pending.length === 0) return vectors;

    try {
      const contents = pending.map((item) => item.content);
      const encoded = await embedder.encode(contents);
      if (Array.isArray(encoded)) {
        if (Array.isArray(encoded[0])) {
          const list = encoded as number[][];
          list.forEach((vec, idx) => {
            const item = pending[idx];
            if (!item) return;
            vectors.set(item.packet, vec);
            cache.set(item.content, vec);
          });
        } else {
          const vec = encoded as number[];
          const item = pending[0];
          if (item) {
            vectors.set(item.packet, vec);
            cache.set(item.content, vec);
          }
        }
      }
    } catch (error) {
      console.warn("⚠️ MMR 向量编码失败，回退到词集合相似度:", error);
    }

    return vectors;
  }

  private getVectorCache(): LruCache<string, number[]> {
    const size = Math.max(1, this.config.mmrVectorCacheSize);
    if (!this.mmrVectorCache || this.mmrVectorCache.size() !== size) {
      this.mmrVectorCache = new LruCache<string, number[]>(size);
    }
    return this.mmrVectorCache;
  }

  private structure(params: {
    selectedPackets: ContextPacket[];
    userQuery: string;
    systemInstructions: string | null;
  }): string {
    const sections: string[] = [];

    const p0Packets = params.selectedPackets.filter(
      (packet) => packet.metadata.type === "instructions",
    );
    if (p0Packets.length > 0) {
      const roleSection = ["[Role & Policies]", ...p0Packets.map((p) => p.content)].join(
        "\n",
      );
      sections.push(roleSection);
    }

    sections.push(`[Task]\n用户问题：${params.userQuery}`);

    const p1Packets = params.selectedPackets.filter(
      (packet) => packet.metadata.type === "task_state",
    );
    if (p1Packets.length > 0) {
      const stateSection =
        "[State]\n关键进展与未决问题：\n" +
        p1Packets.map((p) => p.content).join("\n");
      sections.push(stateSection);
    }

    const p2Packets = params.selectedPackets.filter((packet) =>
      ["related_memory", "knowledge_base", "retrieval", "tool_result"].includes(
        String(packet.metadata.type ?? ""),
      ),
    );
    if (p2Packets.length > 0) {
      const evidenceLines = ["[Evidence]\n事实与引用："];
      for (const packet of p2Packets) {
        evidenceLines.push("", packet.content, "");
      }
      sections.push(evidenceLines.join("\n"));
    }

    const p3Packets = params.selectedPackets.filter(
      (packet) => packet.metadata.type === "history",
    );
    if (p3Packets.length > 0) {
      const contextSection =
        "[Context]\n对话历史与背景：\n" +
        p3Packets.map((p) => p.content).join("\n");
      sections.push(contextSection);
    }

    const outputSection =
      "[Output]\n" +
      "请按以下格式回答：\n" +
      "1. 结论（简洁明确）\n" +
      "2. 依据（列出支撑证据及来源）\n" +
      "3. 风险与假设（如有）\n" +
      "4. 下一步行动建议（如适用）";
    sections.push(outputSection);

    return sections.join("\n\n");
  }

  private compress(context: string, tokenCounter: TokenCounter): string {
    if (!this.config.enableCompression) return context;

    const currentTokens = tokenCounter(context);
    const availableTokens = this.getAvailableTokens();
    if (currentTokens <= availableTokens) return context;

    console.warn(
      `⚠️ 上下文超预算 (${currentTokens} > ${availableTokens})，执行截断`,
    );

    const lines = context.split("\n");
    const compressed: string[] = [];
    let usedTokens = 0;

    for (const line of lines) {
      const lineTokens = tokenCounter(line);
      if (usedTokens + lineTokens > availableTokens) break;
      compressed.push(line);
      usedTokens += lineTokens;
    }

    return compressed.join("\n");
  }
}

class LruCache<K, V> {
  private readonly limit: number;
  private readonly map = new Map<K, V>();

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
  }

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key) as V;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as K | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  size(): number {
    return this.limit;
  }
}

export {roughCountTokens as countTokens} from "./tokenizer";
