import { z } from "zod";
import { Tool, type ToolParameter, toolAction } from "@agenticforge/tools";
import { MemoryManager, type MemoryConfig, type MemoryType } from "@agenticforge/memory";

export interface MemoryToolOptions {
  userId?: string;
  memoryConfig?: Partial<MemoryConfig>;
  memoryTypes?: MemoryType[];
  expandable?: boolean;
  autoRecordRules?: AutoRecordRules;
}

export interface AutoRecordRules {
  enabled?: boolean;
  includeUser?: boolean;
  includeAssistant?: boolean;
  enableEpisodic?: boolean;
  workingImportance?: number;
  episodicImportance?: number;
  minLengthForEpisodic?: number;
  keywordsForEpisodic?: string[];
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

type MemoryActionSchemas = {
  add: z.ZodObject<{
    action: z.ZodLiteral<"add">;
    content: z.ZodString;
    memory_type: z.ZodOptional<z.ZodString>;
    importance: z.ZodOptional<z.ZodNumber>;
    file_path: z.ZodOptional<z.ZodString>;
    modality: z.ZodOptional<z.ZodString>;
  }>;
  search: z.ZodObject<{
    action: z.ZodLiteral<"search">;
    query: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
    memory_type: z.ZodOptional<z.ZodString>;
    min_importance: z.ZodOptional<z.ZodNumber>;
  }>;
  summary: z.ZodObject<{
    action: z.ZodLiteral<"summary">;
    limit: z.ZodOptional<z.ZodNumber>;
  }>;
  stats: z.ZodObject<{
    action: z.ZodLiteral<"stats">;
  }>;
  update: z.ZodObject<{
    action: z.ZodLiteral<"update">;
    memory_id: z.ZodString;
    content: z.ZodOptional<z.ZodString>;
    importance: z.ZodOptional<z.ZodNumber>;
  }>;
  remove: z.ZodObject<{
    action: z.ZodLiteral<"remove">;
    memory_id: z.ZodString;
  }>;
  forget: z.ZodObject<{
    action: z.ZodLiteral<"forget">;
    strategy: z.ZodOptional<z.ZodString>;
    threshold: z.ZodOptional<z.ZodNumber>;
    max_age_days: z.ZodOptional<z.ZodNumber>;
  }>;
  consolidate: z.ZodObject<{
    action: z.ZodLiteral<"consolidate">;
    from_type: z.ZodOptional<z.ZodString>;
    to_type: z.ZodOptional<z.ZodString>;
    importance_threshold: z.ZodOptional<z.ZodNumber>;
  }>;
  clear_all: z.ZodObject<{
    action: z.ZodLiteral<"clear_all">;
  }>;
};

type MemoryActionInputs = {
  [K in keyof MemoryActionSchemas]: z.infer<MemoryActionSchemas[K]>;
};

type MemoryActionInput = MemoryActionInputs[keyof MemoryActionInputs];

export class MemoryTool extends Tool {
  private readonly memoryTypes: MemoryType[];
  private readonly memoryManager: MemoryManager;
  private readonly autoRecordRules: Required<AutoRecordRules>;

  private currentSessionId: string | null = null;
  private conversationCount = 0;

  constructor(options: MemoryToolOptions = {}) {
    super("memory", "记忆工具 - 可以存储和检索对话历史、知识和经验", options.expandable ?? false);

    this.memoryTypes = options.memoryTypes ?? ["working", "episodic", "semantic"];
    this.memoryManager = new MemoryManager({
      config: options.memoryConfig,
      userId: options.userId ?? "default_user",
      enableWorking: this.memoryTypes.includes("working"),
      enableEpisodic: this.memoryTypes.includes("episodic"),
      enableSemantic: this.memoryTypes.includes("semantic"),
      enablePerceptual: this.memoryTypes.includes("perceptual"),
    });

    this.autoRecordRules = {
      enabled: true,
      includeUser: true,
      includeAssistant: true,
      enableEpisodic: true,
      workingImportance: 0.6,
      episodicImportance: 0.8,
      minLengthForEpisodic: 100,
      keywordsForEpisodic: ["重要", "记住"],
      ...(options.autoRecordRules ?? {}),
    };
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    const validation = this.validateAndNormalizeParameters(parameters);
    if (!validation.success) {
      return `❌ 参数验证失败: ${(validation as { success: false; error: string }).error}`;
    }

    const action = String(validation.data.action ?? "") as MemoryAction;
    const actionValidation = this.validateActionParameters(action, validation.data);

    if (!actionValidation.success) {
      return `❌ 参数验证失败: ${(actionValidation as { success: false; error: string }).error}`;
    }

    const p = actionValidation.data;

    switch (p.action) {
      case "add":
        return this.addMemory(
          p.content,
          this.toMemoryType(p.memory_type),
          this.toNumber(p.importance, 0.5),
          this.toOptionalString(p.file_path),
          this.toOptionalString(p.modality),
        );
      case "search":
        return this.searchMemory(
          p.query,
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
        description: "操作: add/search/summary/stats/update/remove/forget/consolidate/clear_all",
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
  async addMemory(
    content = "",
    memoryType: MemoryType = "working",
    importance = 0.5,
    filePath?: string,
    modality?: string,
  ): Promise<string> {
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

      const memoryId = await this.memoryManager.addMemory({
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
  async searchMemory(
    query: string,
    limit = 5,
    memoryType?: string,
    minImportance = 0.1,
  ): Promise<string> {
    try {
      const mt = asMemoryType(memoryType);
      const results = await this.memoryManager.retrieveMemories({
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
        const preview = m.content.length > 80 ? `${m.content.slice(0, 80)}...` : m.content;
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
  async getSummary(limit = 10): Promise<string> {
    try {
      const stats = await this.memoryManager.getMemoryStats();
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
        const record = typeStats as { count?: number; avgImportance?: number };
        const avgImportance = typeof record.avgImportance === "number" ? record.avgImportance : 0;
        const count = typeof record.count === "number" ? record.count : 0;
        lines.push(
          `  • ${memoryTypeLabel(type as MemoryType)}: ${count} 条 (平均重要性: ${avgImportance.toFixed(2)})`,
        );
      }

      const important = await this.memoryManager.retrieveMemories({
        query: "",
        limit: Math.max(1, limit),
        minImportance: 0.5,
      });
      if (important.length) {
        lines.push("", `⭐ 重要记忆 (前${important.length}条):`);
        important.forEach((m, i) => {
          const preview = m.content.length > 60 ? `${m.content.slice(0, 60)}...` : m.content;
          lines.push(`  ${i + 1}. ${preview} (重要性: ${m.importance.toFixed(2)})`);
        });
      }

      return lines.join("\n");
    } catch (error) {
      return `❌ 获取摘要失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_stats", "获取记忆统计")
  async getStats(): Promise<string> {
    try {
      const stats = await this.memoryManager.getMemoryStats();
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
  async updateMemory(memoryId?: string, content?: string, importance?: number): Promise<string> {
    if (!memoryId) return "❌ 更新记忆失败: 缺少 memory_id";
    const ok = await this.memoryManager.updateMemory({
      memoryId,
      content,
      importance,
    });
    return ok ? "✅ 记忆已更新" : "⚠️ 未找到要更新的记忆";
  }

  @toolAction("memory_remove", "删除记忆")
  async removeMemory(memoryId?: string): Promise<string> {
    if (!memoryId) return "❌ 删除记忆失败: 缺少 memory_id";
    const ok = await this.memoryManager.removeMemory(memoryId);
    return ok ? "✅ 记忆已删除" : "⚠️ 未找到要删除的记忆";
  }

  @toolAction("memory_forget", "批量遗忘")
  async forget(strategy = "importance_based", threshold = 0.1, maxAgeDays = 30): Promise<string> {
    try {
      const count = await this.memoryManager.forgetMemories({
        strategy: strategy as "importance_based" | "time_based" | "capacity_based",
        threshold,
        maxAgeDays,
      });
      return `🧹 已遗忘 ${count} 条记忆（策略: ${strategy}）`;
    } catch (error) {
      return `❌ 遗忘记忆失败: ${toErrorMessage(error)}`;
    }
  }

  @toolAction("memory_consolidate", "整合记忆")
  async consolidate(
    fromType = "working",
    toType = "episodic",
    importanceThreshold = 0.7,
  ): Promise<string> {
    try {
      const count = await this.memoryManager.consolidateMemories({
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
  async clearAll(): Promise<string> {
    await this.memoryManager.clearAllMemories();
    return "🧽 已清空所有记忆";
  }

  async autoRecordConversation(userInput: string, agentResponse: string): Promise<void> {
    this.conversationCount += 1;

    if (!this.autoRecordRules.enabled) return;

    const workingImportance = this.clamp01(this.autoRecordRules.workingImportance, 0.6);
    const episodicImportance = this.clamp01(this.autoRecordRules.episodicImportance, 0.8);

    if (this.autoRecordRules.includeUser) {
      await this.addMemory(`用户: ${userInput}`, "working", workingImportance);
    }
    if (this.autoRecordRules.includeAssistant) {
      await this.addMemory(`助手: ${agentResponse}`, "working", workingImportance);
    }

    if (this.autoRecordRules.enableEpisodic) {
      const minLength = Math.max(0, this.autoRecordRules.minLengthForEpisodic);
      const keywords = this.autoRecordRules.keywordsForEpisodic;
      const hitKeyword = keywords.some((k) => userInput.includes(k) || agentResponse.includes(k));
      const hitLength = userInput.length + agentResponse.length >= Math.max(1, minLength);

      if (hitKeyword || hitLength) {
        await this.addMemory(
          `对话 - 用户: ${userInput}\n助手: ${agentResponse}`,
          "episodic",
          episodicImportance,
        );
      }
    }
  }

  async addKnowledge(content: string, importance = 0.9): Promise<string> {
    return this.addMemory(content, "semantic", importance);
  }

  async getContextForQuery(query: string, limit = 3): Promise<string> {
    const results = await this.memoryManager.retrieveMemories({
      query,
      limit,
      minImportance: 0.3,
    });
    if (!results.length) return "";
    return ["相关记忆:", ...results.map((m) => `- ${m.content}`)].join("\n");
  }

  async clearSession(): Promise<void> {
    this.currentSessionId = null;
    this.conversationCount = 0;
    await this.memoryManager.clearAllMemories();
  }

  async forgetOldMemories(maxAgeDays = 30): Promise<string> {
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

  private clamp01(value: number | undefined, fallback: number): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
  }

  private buildActionSchemas(): MemoryActionSchemas {
    return {
      add: z
        .object({
          action: z.literal("add"),
          content: z.string().min(1, "content 不能为空"),
          memory_type: z.string().optional(),
          importance: z.number().min(0).max(1).optional(),
          file_path: z.string().optional(),
          modality: z.string().optional(),
        })
        .strict(),
      search: z
        .object({
          action: z.literal("search"),
          query: z.string().min(1, "query 不能为空"),
          limit: z.number().int().min(1).optional(),
          memory_type: z.string().optional(),
          min_importance: z.number().min(0).max(1).optional(),
        })
        .strict(),
      summary: z
        .object({
          action: z.literal("summary"),
          limit: z.number().int().min(1).optional(),
        })
        .strict(),
      stats: z
        .object({
          action: z.literal("stats"),
        })
        .strict(),
      update: z
        .object({
          action: z.literal("update"),
          memory_id: z.string().min(1, "memory_id 不能为空"),
          content: z.string().optional(),
          importance: z.number().min(0).max(1).optional(),
        })
        .strict(),
      remove: z
        .object({
          action: z.literal("remove"),
          memory_id: z.string().min(1, "memory_id 不能为空"),
        })
        .strict(),
      forget: z
        .object({
          action: z.literal("forget"),
          strategy: z.string().optional(),
          threshold: z.number().min(0).max(1).optional(),
          max_age_days: z.number().int().min(1).optional(),
        })
        .strict(),
      consolidate: z
        .object({
          action: z.literal("consolidate"),
          from_type: z.string().optional(),
          to_type: z.string().optional(),
          importance_threshold: z.number().min(0).max(1).optional(),
        })
        .strict(),
      clear_all: z
        .object({
          action: z.literal("clear_all"),
        })
        .strict(),
    };
  }

  private validateActionParameters(
    action: MemoryAction,
    parameters: Record<string, unknown>,
  ): { success: true; data: MemoryActionInput } | { success: false; error: string } {
    const schemas = this.buildActionSchemas();
    const schema = schemas[action];

    if (!schema) {
      return { success: false, error: `不支持的操作: ${action}` };
    }

    const parsed = schema.safeParse(parameters);
    if (!parsed.success) {
      const details = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
        .join("; ");
      return { success: false, error: details };
    }

    return { success: true, data: parsed.data };
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
  if (["png", "jpg", "jpeg", "bmp", "gif", "webp"].includes(ext)) return "image";
  if (["mp3", "wav", "flac", "m4a", "ogg"].includes(ext)) return "audio";
  return "text";
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
