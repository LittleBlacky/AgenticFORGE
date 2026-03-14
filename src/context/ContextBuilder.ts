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
import {MemoryTool} from "../tools/builtin/memory";
import {RagTool} from "../tools/builtin/rag";

export interface ContextPacket {
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
  tokenCount: number;
  relevanceScore: number;
}

export class ContextPacketBuilder {
  static create(content: string, metadata: Record<string, unknown> = {}): ContextPacket {
    return {
      content,
      metadata,
      timestamp: new Date(),
      tokenCount: countTokens(content),
      relevanceScore: 0,
    };
  }
}

export interface ContextConfig {
  maxTokens?: number; // 总预算
  reserveRatio?: number; // 生成余量（10-20%）
  minRelevance?: number; // 最小相关性阈值
  enableMmr?: boolean; // 启用最大边际相关性（多样性）
  mmrLambda?: number; // MMR平衡参数（0=纯多样性, 1=纯相关性）
  systemPromptTemplate?: string; // 系统提示模板
  enableCompression?: boolean; // 启用压缩
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
    const packets = await this.gather({
      userQuery: params.userQuery,
      conversationHistory: params.conversationHistory ?? [],
      systemInstructions: params.systemInstructions ?? null,
      additionalPackets: params.additionalPackets ?? [],
    });

    const selected = this.select(packets, params.userQuery);
    const structured = this.structure({
      selectedPackets: selected,
      userQuery: params.userQuery,
      systemInstructions: params.systemInstructions ?? null,
    });

    return this.compress(structured);
  }

  private async gather(params: {
    userQuery: string;
    conversationHistory: Message[];
    systemInstructions: string | null;
    additionalPackets: ContextPacket[];
  }): Promise<ContextPacket[]> {
    const packets: ContextPacket[] = [];

    // P0: 系统指令（强约束）
    if (params.systemInstructions) {
      packets.push(
        ContextPacketBuilder.create(params.systemInstructions, {type: "instructions"}),
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
            ContextPacketBuilder.create(stateResults, {
              type: "task_state",
              importance: "high",
            }),
          );
        }

        const relatedResults = await this.memoryTool.run({
          action: "search",
          query: params.userQuery,
          limit: 5,
        });
        if (relatedResults && !relatedResults.includes("未找到")) {
          packets.push(
            ContextPacketBuilder.create(relatedResults, {type: "related_memory"}),
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
            ContextPacketBuilder.create(ragResults, {type: "knowledge_base"}),
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
        ContextPacketBuilder.create(historyText, {
          type: "history",
          count: recentHistory.length,
        }),
      );
    }

    packets.push(...params.additionalPackets);
    return packets;
  }

  private select(packets: ContextPacket[], userQuery: string): ContextPacket[] {
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

    for (const packet of filtered) {
      if (usedTokens + packet.tokenCount > availableTokens) continue;
      selected.push(packet);
      usedTokens += packet.tokenCount;
    }

    return selected;
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

  private compress(context: string): string {
    if (!this.config.enableCompression) return context;

    const currentTokens = countTokens(context);
    const availableTokens = this.getAvailableTokens();
    if (currentTokens <= availableTokens) return context;

    console.warn(
      `⚠️ 上下文超预算 (${currentTokens} > ${availableTokens})，执行截断`,
    );

    const lines = context.split("\n");
    const compressed: string[] = [];
    let usedTokens = 0;

    for (const line of lines) {
      const lineTokens = countTokens(line);
      if (usedTokens + lineTokens > availableTokens) break;
      compressed.push(line);
      usedTokens += lineTokens;
    }

    return compressed.join("\n");
  }
}

export function countTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}
