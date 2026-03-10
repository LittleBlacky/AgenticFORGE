import {Tool, type ToolParameter, toolAction} from "../Tool";
import {
  MemoryManager,
  type MemoryConfig,
  type MemoryType,
} from "../../memory/manager";

export interface MemoryToolOptions {
  userId?: string;
  memoryConfig?: Partial<MemoryConfig>;
  memoryTypes?: MemoryType[];
  expandable?: boolean;
}

type MemoryAction =
  | "add"
  | "search"
  | "summary"
  | "stats"
  | "update"
  | "remove"
  | "forget"
  | "consolidate"
  | "clear_all";

export class MemoryTool extends Tool {
  private readonly memoryTypes: MemoryType[];
  private readonly memoryManager: MemoryManager;

  private currentSessionId: string | null = null;
  private conversationCount = 0;

  constructor(options: MemoryToolOptions = {}) {
    super(
      "memory",
      "记忆工具 - 可以存储和检索对话历史、知识和经验",
      options.expandable ?? false,
    );

    this.memoryTypes = options.memoryTypes ?? [
      "working",
      "episodic",
      "semantic",
    ];
    this.memoryManager = new MemoryManager({
      config: options.memoryConfig,
      userId: options.userId ?? "default_user",
      enableWorking: this.memoryTypes.includes("working"),
      enableEpisodic: this.memoryTypes.includes("episodic"),
      enableSemantic: this.memoryTypes.includes("semantic"),
      enablePerceptual: this.memoryTypes.includes("perceptual"),
    });
  }

  run(parameters: Record<string, unknown>): string {
    const validation = this.validateAndNormalizeParameters(parameters);
    if (!validation.success) {
      return `❌ 参数验证失败: ${validation.error}`;
    }

    const p = validation.data;
    const action = String(p.action ?? "") as MemoryAction;

    switch (action) {
      case "add":
        return this.addMemory(
          String(p.content ?? ""),
          this.toMemoryType(p.memory_type),
          this.toNumber(p.importance, 0.5),
          this.toOptionalString(p.file_path),
          this.toOptionalString(p.modality),
        );
      case "search":
        return this.searchMemory(
          String(p.query ?? ""),
          this.toNumber(p.limit, 5),
          this.toOptionalString(p.memory_type),
          this.toNumber(p.min_importance, 0.1),
        );
      case "summary":
        return this.getSummary(this.toNumber(p.limit, 10));
      case "stats":
        return this.getStats();
      case "update":
        return this.updateMemory(
          this.toOptionalString(p.memory_id),
          this.toOptionalString(p.content),
          this.toOptionalNumber(p.importance),
        );
      case "remove":
        return this.removeMemory(this.toOptionalString(p.memory_id));
      case "forget":
        return this.forget(
          this.toOptionalString(p.strategy) ?? "importance_based",
          this.toNumber(p.threshold, 0.1),
          this.toNumber(p.max_age_days, 30),
        );
      case "consolidate":
        return this.consolidate(
          this.toOptionalString(p.from_type) ?? "working",
          this.toOptionalString(p.to_type) ?? "episodic",
          this.toNumber(p.importance_threshold, 0.7),
        );
      case "clear_all":
        return this.clearAll();
      default:
        return `❌ 不支持的操作: ${action}`;
    }
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: "action",
        type: "string",
        description:
          "操作: add/search/summary/stats/update/remove/forget/consolidate/clear_all",
        required: true,
        default: null,
      },
      {
        name: "content",
        type: "string",
        description: "记忆内容",
        required: false,
        default: "",
      },
      {
        name: "query",
        type: "string",
        description: "搜索词",
        required: false,
        default: "",
      },
      {
        name: "memory_type",
        type: "string",
        description: "记忆类型",
        required: false,
        default: "working",
      },
      {
        name: "importance",
        type: "number",
        description: "重要性 0~1",
        required: false,
        default: 0.5,
      },
      {
        name: "limit",
        type: "number",
        description: "数量限制",
        required: false,
        default: 5,
      },
      {
        name: "min_importance",
        type: "number",
        description: "最小重要性",
        required: false,
        default: 0.1,
      },
      {
        name: "memory_id",
        type: "string",
        description: "记忆ID",
        required: false,
        default: null,
      },
      {
        name: "file_path",
        type: "string",
        description: "感知记忆文件路径",
        required: false,
        default: null,
      },
      {
        name: "modality",
        type: "string",
        description: "感知模态",
        required: false,
        default: null,
      },
      {
        name: "strategy",
        type: "string",
        description: "遗忘策略",
        required: false,
        default: "importance_based",
      },
      {
        name: "threshold",
        type: "number",
        description: "遗忘阈值",
        required: false,
        default: 0.1,
      },
      {
        name: "max_age_days",
        type: "number",
        description: "最大保留天数",
        required: false,
        default: 30,
      },
      {
        name: "from_type",
        type: "string",
        description: "整合来源类型",
        required: false,
        default: "working",
      },
      {
        name: "to_type",
        type: "string",
        description: "整合目标类型",
        required: false,
        default: "episodic",
      },
      {
        name: "importance_threshold",
        type: "number",
        description: "整合阈值",
        required: false,
        default: 0.7,
      },
    ];
  }

  @toolAction("memory_add", "添加新记忆")
  addMemory(
    content = "",
    memoryType: MemoryType = "working",
    importance = 0.5,
    filePath?: string,
    modality?: string,
  ): string {
    try {
      if (!this.currentSessionId) {
        this.currentSessionId = `session_${new Date()
          .toISOString()
          .replace(/[-:.TZ]/g, "")
          .slice(0, 14)}`;
      }

      const metadata: Record<string, unknown> = {
        session_id: this.currentSessionId,
        timestamp: new Date().toISOString(),
      };

      if (memoryType === "perceptual" && filePath) {
        metadata.raw_data = filePath;
        metadata.modality = modality ?? inferModality(filePath);
      }

      const memoryId = this.memoryManager.addMemory({
        content,
        memoryType,
        importance,
        metadata,
        autoClassify: false,
      });
      return `✅ 记忆已添加 (ID: ${memoryId.slice(0, 8)}...)`;
    } catch (error) {
      return `❌ 添加记忆失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_search", "搜索相关记忆")
  searchMemory(
    query: string,
    limit = 5,
    memoryType?: string,
    minImportance = 0.1,
  ): string {
    try {
      const mt = asMemoryType(memoryType);
      const results = this.memoryManager.retrieveMemories({
        query,
        limit,
        memoryTypes: mt ? [mt] : undefined,
        minImportance,
      });

      if (!results.length) {
        return `🔍 未找到与 '${query}' 相关的记忆`;
      }

      const lines = [`🔍 找到 ${results.length} 条相关记忆:`];
      results.forEach((m, i) => {
        const preview =
          m.content.length > 80 ? `${m.content.slice(0, 80)}...` : m.content;
        lines.push(
          `${i + 1}. [${memoryTypeLabel(m.memoryType)}] ${preview} (重要性: ${m.importance.toFixed(2)})`,
        );
      });
      return lines.join("\n");
    } catch (error) {
      return `❌ 搜索记忆失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_summary", "获取记忆摘要")
  getSummary(limit = 10): string {
    try {
      const stats = this.memoryManager.getMemoryStats();
      const lines = [
        "📊 记忆系统摘要",
        `总记忆数: ${stats.totalMemories}`,
        `当前会话: ${this.currentSessionId ?? "未开始"}`,
        `对话轮次: ${this.conversationCount}`,
        "",
        "📋 记忆类型分布:",
      ];

      for (const [type, typeStats] of Object.entries(stats.memoriesByType)) {
        if (!typeStats) continue;
        lines.push(
          `  • ${memoryTypeLabel(type as MemoryType)}: ${typeStats.count} 条 (平均重要性: ${typeStats.avgImportance.toFixed(2)})`,
        );
      }

      const important = this.memoryManager.retrieveMemories({
        query: "",
        limit: Math.max(1, limit),
        minImportance: 0.5,
      });
      if (important.length) {
        lines.push("", `⭐ 重要记忆 (前${important.length}条):`);
        important.forEach((m, i) => {
          const preview =
            m.content.length > 60 ? `${m.content.slice(0, 60)}...` : m.content;
          lines.push(
            `  ${i + 1}. ${preview} (重要性: ${m.importance.toFixed(2)})`,
          );
        });
      }

      return lines.join("\n");
    } catch (error) {
      return `❌ 获取摘要失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_stats", "获取记忆统计")
  getStats(): string {
    try {
      const stats = this.memoryManager.getMemoryStats();
      return [
        "📈 记忆系统统计",
        `总记忆数: ${stats.totalMemories}`,
        `启用的记忆类型: ${stats.enabledTypes.join(", ")}`,
        `会话ID: ${this.currentSessionId ?? "未开始"}`,
        `对话轮次: ${this.conversationCount}`,
      ].join("\n");
    } catch (error) {
      return `❌ 获取统计信息失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_update", "更新记忆")
  updateMemory(
    memoryId?: string,
    content?: string,
    importance?: number,
  ): string {
    if (!memoryId) return "❌ 更新记忆失败: 缺少 memory_id";
    const ok = this.memoryManager.updateMemory({memoryId, content, importance});
    return ok ? "✅ 记忆已更新" : "⚠️ 未找到要更新的记忆";
  }

  @toolAction("memory_remove", "删除记忆")
  removeMemory(memoryId?: string): string {
    if (!memoryId) return "❌ 删除记忆失败: 缺少 memory_id";
    return this.memoryManager.removeMemory(memoryId)
      ? "✅ 记忆已删除"
      : "⚠️ 未找到要删除的记忆";
  }

  @toolAction("memory_forget", "批量遗忘")
  forget(
    strategy = "importance_based",
    threshold = 0.1,
    maxAgeDays = 30,
  ): string {
    try {
      const count = this.memoryManager.forgetMemories({
        strategy: strategy as
          | "importance_based"
          | "time_based"
          | "capacity_based",
        threshold,
        maxAgeDays,
      });
      return `🧹 已遗忘 ${count} 条记忆（策略: ${strategy}）`;
    } catch (error) {
      return `❌ 遗忘记忆失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_consolidate", "整合记忆")
  consolidate(
    fromType = "working",
    toType = "episodic",
    importanceThreshold = 0.7,
  ): string {
    try {
      const count = this.memoryManager.consolidateMemories({
        fromType: asMemoryType(fromType) ?? "working",
        toType: asMemoryType(toType) ?? "episodic",
        importanceThreshold,
      });
      return `🔄 已整合 ${count} 条记忆为长期记忆（${fromType} → ${toType}，阈值=${importanceThreshold}）`;
    } catch (error) {
      return `❌ 整合记忆失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_clear", "清空所有记忆")
  clearAll(): string {
    this.memoryManager.clearAllMemories();
    return "🧽 已清空所有记忆";
  }

  autoRecordConversation(userInput: string, agentResponse: string): void {
    this.conversationCount += 1;
    this.addMemory(`用户: ${userInput}`, "working", 0.6);
    this.addMemory(`助手: ${agentResponse}`, "working", 0.7);
    if (
      agentResponse.length > 100 ||
      userInput.includes("重要") ||
      userInput.includes("记住")
    ) {
      this.addMemory(
        `对话 - 用户: ${userInput}\n助手: ${agentResponse}`,
        "episodic",
        0.8,
      );
    }
  }

  addKnowledge(content: string, importance = 0.9): string {
    return this.addMemory(content, "semantic", importance);
  }

  getContextForQuery(query: string, limit = 3): string {
    const results = this.memoryManager.retrieveMemories({
      query,
      limit,
      minImportance: 0.3,
    });
    if (!results.length) return "";
    return ["相关记忆:", ...results.map((m) => `- ${m.content}`)].join("\n");
  }

  clearSession(): void {
    this.currentSessionId = null;
    this.conversationCount = 0;
    this.memoryManager.clearAllMemories();
  }

  forgetOldMemories(maxAgeDays = 30): string {
    return this.forget("time_based", 0.1, maxAgeDays);
  }

  private toMemoryType(value: unknown): MemoryType {
    return asMemoryType(value) ?? "working";
  }

  private toOptionalString(value: unknown): string | undefined {
    if (typeof value === "string" && value.length > 0) return value;
    return undefined;
  }

  private toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  }

  private toNumber(value: unknown, fallback: number): number {
    return this.toOptionalNumber(value) ?? fallback;
  }
}

function asMemoryType(value: unknown): MemoryType | null {
  if (
    value === "working" ||
    value === "episodic" ||
    value === "semantic" ||
    value === "perceptual"
  ) {
    return value;
  }
  return null;
}

function memoryTypeLabel(type: MemoryType): string {
  if (type === "working") return "工作记忆";
  if (type === "episodic") return "情景记忆";
  if (type === "semantic") return "语义记忆";
  return "感知记忆";
}

function inferModality(filePath: string): "text" | "image" | "audio" {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "bmp", "gif", "webp"].includes(ext))
    return "image";
  if (["mp3", "wav", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  return "text";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

