import fs from "node:fs";
import path from "node:path";
import {Tool, type ToolParameter, toolAction} from "../Tool";
import {LLMClient} from "@AgenticKIT/core";
import {
  createRagPipeline,
  type RagPipeline,
  type VectorSearchHit,
} from "@AgenticKIT/memory";
import {createDefaultVectorStore} from "@AgenticKIT/memory";
import {createDefaultTextEmbedder} from "@AgenticKIT/memory";

// ---------------------------------------------------------------------------
// 类型 & 选项
// ---------------------------------------------------------------------------

export interface RagToolOptions {
  knowledgeBasePath?: string;
  qdrantUrl?: string;
  qdrantApiKey?: string;
  collectionName?: string;
  ragNamespace?: string;
  dimension?: number;
  expandable?: boolean;
}

interface CitationItem {
  index: number;
  source: string;
  score: number;
}

// ---------------------------------------------------------------------------
// 工具类
// ---------------------------------------------------------------------------

/**
 * RAG 工具
 *
 * 提供完整的 RAG 能力：
 * - 添加多格式文档（PDF、Office、图片、音频等）
 * - 智能检索与召回
 * - LLM 增强问答
 * - 知识库管理（命名空间隔离）
 *
 * 使用示例：
 * ```ts
 * const rag = new RagTool();
 * await rag.run({ action: "add_document", file_path: "doc.pdf" });
 * const answer = await rag.run({ action: "ask", question: "什么是机器学习？" });
 * ```
 */
export class RagTool extends Tool {
  private readonly knowledgeBasePath: string;
  readonly ragNamespace: string;
  private readonly collectionName: string;
  private readonly qdrantUrl?: string;
  private readonly qdrantApiKey?: string;
  private readonly dimension: number;
  private readonly pipelines = new Map<string, RagPipeline>();
  private llm: LLMClient | null = null;
  private initialized = false;
  private initError = "";

  constructor(options: RagToolOptions = {}) {
    super(
      "rag",
      "RAG工具 - 支持多格式文档检索增强生成，提供智能问答能力",
      options.expandable ?? false,
    );
    this.knowledgeBasePath = options.knowledgeBasePath ?? "./knowledge_base";
    this.ragNamespace = options.ragNamespace ?? "default";
    this.collectionName = options.collectionName ?? "rag_knowledge_base";
    this.qdrantUrl = options.qdrantUrl ?? process.env["QDRANT_URL"];
    this.qdrantApiKey = options.qdrantApiKey ?? process.env["QDRANT_API_KEY"];
    this.dimension = options.dimension ?? 384;
    fs.mkdirSync(this.knowledgeBasePath, {recursive: true});
    this.initComponents();
  }

  // -------------------------------------------------------------------------
  // 初始化
  // -------------------------------------------------------------------------

  private initComponents(): void {
    try {
      this.getOrCreatePipeline(this.ragNamespace);
      this.llm = new LLMClient();
      this.initialized = true;
      console.log(
        `[RagTool] ✅ 初始化成功  namespace=${this.ragNamespace}  collection=${this.collectionName}`,
      );
    } catch (e) {
      this.initialized = false;
      this.initError = toErr(e);
      console.error(`[RagTool] ❌ 初始化失败: ${this.initError}`);
    }
  }

  private getOrCreatePipeline(namespace?: string): RagPipeline {
    const ns = namespace ?? this.ragNamespace;
    const cached = this.pipelines.get(ns);
    if (cached) return cached;

    const store = createDefaultVectorStore(
      this.qdrantUrl
        ? {
            backend: "qdrant" as const,
            qdrantUrl: this.qdrantUrl,
            qdrantApiKey: this.qdrantApiKey,
            qdrantCollection: this.collectionName,
            qdrantVectorSize: this.dimension,
          }
        : {backend: "memory" as const},
    );
    const pipeline = createRagPipeline({
      ragNamespace: ns,
      store,
      embedder: createDefaultTextEmbedder(this.dimension),
      dimension: this.dimension,
    });
    this.pipelines.set(ns, pipeline);
    return pipeline;
  }

  // -------------------------------------------------------------------------
  // Tool 基类接口
  // -------------------------------------------------------------------------

  getParameters(): ToolParameter[] {
    return [
      {
        name: "action",
        type: "string",
        required: true,
        default: null,
        description:
          "操作类型：add_document | add_text | ask | search | stats | clear",
      },
      {
        name: "file_path",
        type: "string",
        required: false,
        default: null,
        description:
          "文档文件路径（支持 PDF、Word、Excel、PPT、图片、音频等多种格式）",
      },
      {
        name: "text",
        type: "string",
        required: false,
        default: null,
        description: "要添加的文本内容",
      },
      {
        name: "question",
        type: "string",
        required: false,
        default: null,
        description: "用户问题（用于智能问答）",
      },
      {
        name: "query",
        type: "string",
        required: false,
        default: null,
        description: "搜索查询词（用于基础搜索）",
      },
      {
        name: "namespace",
        type: "string",
        required: false,
        default: "default",
        description: "知识库命名空间，用于多项目隔离（默认：default）",
      },
      {
        name: "document_id",
        type: "string",
        required: false,
        default: null,
        description: "文档 ID（不传则自动生成）",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        default: 5,
        description: "返回结果数量（默认：5）",
      },
      {
        name: "chunk_size",
        type: "number",
        required: false,
        default: 800,
        description: "分块大小（token 数，默认：800）",
      },
      {
        name: "chunk_overlap",
        type: "number",
        required: false,
        default: 100,
        description: "分块重叠大小（token 数，默认：100）",
      },
      {
        name: "min_score",
        type: "number",
        required: false,
        default: 0.1,
        description: "最低相关度分数（默认：0.1）",
      },
      {
        name: "enable_advanced_search",
        type: "boolean",
        required: false,
        default: true,
        description: "是否启用高级检索（MQE + HyDE，默认：true）",
      },
      {
        name: "include_citations",
        type: "boolean",
        required: false,
        default: true,
        description: "是否包含引用来源（默认：true）",
      },
      {
        name: "max_chars",
        type: "number",
        required: false,
        default: 1200,
        description: "上下文最大字符数（默认：1200）",
      },
      {
        name: "confirm",
        type: "boolean",
        required: false,
        default: false,
        description: "清空操作安全确认（必须设置为 true）",
      },
    ];
  }

  async run(parameters: Record<string, unknown>): Promise<string> {
    if (!this.initialized) {
      return `❌ RAG工具未正确初始化，请检查配置: ${this.initError}`;
    }

    const action = parameters["action"] as string | undefined;
    const ns = (parameters["namespace"] as string | undefined) ?? "default";

    try {
      switch (action) {
        case "add_document":
          return this._addDocument(
            parameters["file_path"] as string,
            parameters["document_id"] as string | undefined,
            ns,
            (parameters["chunk_size"] as number | undefined) ?? 800,
            (parameters["chunk_overlap"] as number | undefined) ?? 100,
          );
        case "add_text":
          return this._addText(
            parameters["text"] as string,
            parameters["document_id"] as string | undefined,
            ns,
            (parameters["chunk_size"] as number | undefined) ?? 800,
            (parameters["chunk_overlap"] as number | undefined) ?? 100,
          );
        case "search":
          return this._search(
            (parameters["query"] ?? parameters["question"]) as string,
            (parameters["limit"] as number | undefined) ?? 5,
            (parameters["min_score"] as number | undefined) ?? 0.1,
            (parameters["enable_advanced_search"] as boolean | undefined) ??
              true,
            (parameters["max_chars"] as number | undefined) ?? 1200,
            (parameters["include_citations"] as boolean | undefined) ?? true,
            ns,
          );
        case "ask":
          return this._ask(
            (parameters["question"] ?? parameters["query"]) as string,
            (parameters["limit"] as number | undefined) ?? 5,
            (parameters["enable_advanced_search"] as boolean | undefined) ??
              true,
            (parameters["include_citations"] as boolean | undefined) ?? true,
            (parameters["max_chars"] as number | undefined) ?? 1200,
            ns,
          );
        case "stats":
          return this._getStats(ns);
        case "clear":
          return this._clearKnowledgeBase(
            (parameters["confirm"] as boolean | undefined) ?? false,
            ns,
          );
        default:
          return `❌ 不支持的操作: ${action}`;
      }
    } catch (e) {
      return `❌ 执行操作 '${action}' 时发生错误: ${toErr(e)}`;
    }
  }

  // -------------------------------------------------------------------------
  // @toolAction 方法
  // -------------------------------------------------------------------------

  /** 添加文档到知识库（支持 PDF、Word、Excel、PPT、图片、音频等多种格式） */
  @toolAction("rag_add_document", "添加文档文件到 RAG 知识库")
  async _addDocument(
    filePath: string,
    documentId?: string,
    namespace = "default",
    chunkSize = 800,
    chunkOverlap = 100,
  ): Promise<string> {
    if (!filePath || !fs.existsSync(filePath)) {
      return `❌ 文件不存在: ${filePath}`;
    }
    try {
      const pipeline = this.getOrCreatePipeline(namespace);
      const t0 = Date.now();
      const n = await pipeline.addDocuments([filePath], chunkSize, chunkOverlap);
      if (n === 0) {
        return `⚠️ 未能从文件解析内容: ${path.basename(filePath)}`;
      }
      return (
        `✅ 文档已添加到知识库: ${path.basename(filePath)}\n` +
        `📊 分块数量: ${n}\n` +
        `⏱️ 处理时间: ${Date.now() - t0}ms\n` +
        `📝 命名空间: ${namespace}`
      );
    } catch (e) {
      return `❌ 添加文档失败: ${toErr(e)}`;
    }
  }

  /** 添加文本内容到知识库 */
  @toolAction("rag_add_text", "添加原始文本到 RAG 知识库")
  async _addText(
    text: string,
    documentId?: string,
    namespace = "default",
    chunkSize = 800,
    chunkOverlap = 100,
  ): Promise<string> {
    if (!text?.trim()) return "❌ 文本内容不能为空";

    const docId = documentId ?? `text_${Math.abs(hashCode(text)) % 100000}`;
    const tmpPath = path.join(this.knowledgeBasePath, `${docId}.md`);
    try {
      fs.writeFileSync(tmpPath, text, "utf-8");
      const pipeline = this.getOrCreatePipeline(namespace);
      const t0 = Date.now();
      const n = await pipeline.addDocuments([tmpPath], chunkSize, chunkOverlap);
      if (n === 0) return "⚠️ 未能从文本生成有效分块";
      return (
        `✅ 文本已添加到知识库: ${docId}\n` +
        `📊 分块数量: ${n}\n` +
        `⏱️ 处理时间: ${Date.now() - t0}ms\n` +
        `📝 命名空间: ${namespace}`
      );
    } catch (e) {
      return `❌ 添加文本失败: ${toErr(e)}`;
    } finally {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {
        // ignore
      }
    }
  }

  /** 搜索知识库中的相关内容 */
  @toolAction("rag_search", "搜索 RAG 知识库中的相关内容")
  async _search(
    query: string,
    limit = 5,
    minScore = 0.1,
    enableAdvancedSearch = true,
    maxChars = 1200,
    includeCitations = true,
    namespace = "default",
  ): Promise<string> {
    if (!query?.trim()) return "❌ 搜索查询不能为空";
    try {
      const pipeline = this.getOrCreatePipeline(namespace);
      const results = enableAdvancedSearch
        ? await pipeline.searchAdvanced(
            query,
            limit,
            true,
            true,
            minScore > 0 ? minScore : undefined,
          )
        : await pipeline.search(query, limit, minScore > 0 ? minScore : undefined);

      if (results.length === 0) {
        return `🔍 未找到与 '${query}' 相关的内容`;
      }

      const lines: string[] = ["搜索结果："];
      for (let i = 0; i < results.length; i++) {
        const hit = results[i]!;
        const meta = hit.metadata;
        const score = hit.score;
        const content = `${String(meta["content"] ?? "").slice(0, 200)}...`;
        const source = String(meta["source_path"] ?? "unknown");

        lines.push(
          `\n${i + 1}. 文档: **${path.basename(source)}** (相似度: ${score.toFixed(3)})`,
        );
        lines.push(`   ${content}`);
        if (includeCitations && meta["heading_path"]) {
          lines.push(`   章节: ${String(meta["heading_path"])}`);
        }
      }
      return lines.join("\n");
    } catch (e) {
      return `❌ 搜索失败: ${toErr(e)}`;
    }
  }

  /**
   * 智能问答：检索 → 上下文注入 → LLM 生成答案
   *
   * 核心流程：
   * 1. 解析用户问题
   * 2. 智能检索相关内容
   * 3. 构建上下文和提示词
   * 4. LLM 生成准确答案
   * 5. 添加引用来源
   */
  @toolAction("rag_ask", "基于知识库进行智能问答")
  async _ask(
    question: string,
    limit = 5,
    enableAdvancedSearch = true,
    includeCitations = true,
    maxChars = 1200,
    namespace = "default",
  ): Promise<string> {
    if (!question?.trim()) return "❌ 请提供要询问的问题";

    const userQuestion = question.trim();
    console.log(`[RagTool] 🔍 智能问答: ${userQuestion}`);

    try {
      // 1. 检索相关内容
      const pipeline = this.getOrCreatePipeline(namespace);
      const searchStart = Date.now();
      const results: VectorSearchHit[] = enableAdvancedSearch
        ? await pipeline.searchAdvanced(userQuestion, limit, true, true)
        : await pipeline.search(userQuestion, limit);
      const searchTime = Date.now() - searchStart;

      if (results.length === 0) {
        return (
          `🤔 抱歉，我在知识库中没有找到与「${userQuestion}」相关的信息。\n\n` +
          `💡 建议：\n` +
          `• 尝试使用更简洁的关键词\n` +
          `• 检查是否已添加相关文档\n` +
          `• 使用 stats 操作查看知识库状态`
        );
      }

      // 2. 整理上下文
      const contextParts: string[] = [];
      const citations: CitationItem[] = [];
      let totalScore = 0;

      for (let i = 0; i < results.length; i++) {
        const hit = results[i]!;
        const meta = hit.metadata;
        const content = String(meta["content"] ?? "").trim();
        const source = String(meta["source_path"] ?? "unknown");
        totalScore += hit.score;

        if (content) {
          const cleaned = cleanContentForContext(content);
          contextParts.push(`片段 ${i + 1}：${cleaned}`);
          if (includeCitations) {
            citations.push({
              index: i + 1,
              source: path.basename(source),
              score: hit.score,
            });
          }
        }
      }

      // 3. 构建上下文（智能截断）
      let context = contextParts.join("\n\n");
      if (context.length > maxChars) {
        context = smartTruncateContext(context, maxChars);
      }

      // 4. 构建提示词并调用 LLM
      if (!this.llm) return "❌ LLM 客户端未初始化";
      const messages = [
        {role: "system" as const, content: buildSystemPrompt()},
        {role: "user" as const, content: buildUserPrompt(userQuestion, context)},
      ];

      const llmStart = Date.now();
      const answer = await this.llm.think(messages);
      const llmTime = Date.now() - llmStart;

      if (!answer?.trim()) return "❌ LLM 未能生成有效答案，请稍后重试";

      // 5. 格式化最终回答
      return formatFinalAnswer(
        answer.trim(),
        includeCitations ? citations : undefined,
        searchTime,
        llmTime,
        results.length > 0 ? totalScore / results.length : 0,
      );
    } catch (e) {
      return `❌ 智能问答失败: ${toErr(e)}\n💡 请检查知识库状态或稍后重试`;
    }
  }

  /** 获取知识库统计信息 */
  @toolAction("rag_stats", "获取 RAG 知识库统计信息")
  async _getStats(namespace = "default"): Promise<string> {
    try {
      const pipeline = this.getOrCreatePipeline(namespace);
      const stats = await pipeline.getStats();

      const lines: string[] = [
        "📊 **RAG 知识库统计**",
        `📝 命名空间: ${namespace}`,
        `📋 集合名称: ${this.collectionName}`,
        `📂 存储根路径: ${this.knowledgeBasePath}`,
      ];

      if (stats && Object.keys(stats).length > 0) {
        const storeType = String(stats["store_type"] ?? "unknown");
        const totalVectors = Number(
          stats["points_count"] ?? stats["vectors_count"] ?? stats["count"] ?? 0,
        );
        lines.push(`📦 存储类型: ${storeType}`);
        lines.push(`📊 文档分块数: ${totalVectors}`);

        const cfg = stats["config"];
        if (cfg && typeof cfg === "object") {
          const c = cfg as Record<string, unknown>;
          if (c["vector_size"]) lines.push(`🔢 向量维度: ${c["vector_size"]}`);
          if (c["distance"]) lines.push(`📎 距离度量: ${c["distance"]}`);
        }
      }

      lines.push("", "🟢 **系统状态**");
      lines.push(`✅ RAG 管道: ${this.initialized ? "正常" : "异常"}`);
      lines.push(`✅ LLM 连接: ${this.llm ? "正常" : "异常"}`);

      return lines.join("\n");
    } catch (e) {
      return `❌ 获取统计信息失败: ${toErr(e)}`;
    }
  }

  /** 清空知识库（危险操作，请谨慎使用） */
  @toolAction("rag_clear", "清空 RAG 知识库（危险操作）")
  async _clearKnowledgeBase(confirm = false, namespace = "default"): Promise<string> {
    if (!confirm) {
      return (
        "⚠️ 危险操作：清空知识库将删除所有数据！\n" +
        "请使用 confirm=true 参数确认执行。"
      );
    }
    try {
      const pipeline = this.getOrCreatePipeline(namespace);
      const store = pipeline.store as {clearCollection?: () => Promise<boolean> | boolean};
      const success =
        typeof store.clearCollection === "function"
          ? await store.clearCollection()
          : false;

      if (success) {
        // 重新初始化该命名空间管道
        this.pipelines.delete(namespace);
        this.getOrCreatePipeline(namespace);
        return `✅ 知识库已成功清空（命名空间：${namespace}）`;
      }
      return "❌ 清空知识库失败";
    } catch (e) {
      return `❌ 清空知识库失败: ${toErr(e)}`;
    }
  }

  // -------------------------------------------------------------------------
  // 便捷公开方法
  // -------------------------------------------------------------------------

  /** 便捷方法：添加单个文档 */
  addDocument(filePath: string, namespace = "default"): Promise<string> {
    return this.run({action: "add_document", file_path: filePath, namespace});
  }

  /** 便捷方法：添加文本内容 */
  addText(text: string, namespace = "default", documentId?: string): Promise<string> {
    return this.run({action: "add_text", text, namespace, document_id: documentId});
  }

  /** 便捷方法：智能问答 */
  ask(
    question: string,
    namespace = "default",
    extra: Partial<Record<string, unknown>> = {},
  ): Promise<string> {
    return this.run({action: "ask", question, namespace, ...extra});
  }

  /** 便捷方法：搜索知识库 */
  search(
    query: string,
    namespace = "default",
    extra: Partial<Record<string, unknown>> = {},
  ): Promise<string> {
    return this.run({action: "search", query, namespace, ...extra});
  }

  /** 批量添加多个文档 */
  async addDocumentsBatch(filePaths: string[], namespace = "default"): Promise<string> {
    if (!filePaths.length) return "❌ 文件路径列表不能为空";

    let successful = 0;
    let failed = 0;
    let totalChunks = 0;
    const failures: string[] = [];
    const t0 = Date.now();

    for (let i = 0; i < filePaths.length; i++) {
      const fp = filePaths[i]!;
      console.log(
        `[RagTool] 📄 处理文档 ${i + 1}/${filePaths.length}: ${path.basename(fp)}`,
      );
      try {
        const result = await this.addDocument(fp, namespace);
        if (result.startsWith("✅")) {
          successful++;
          const m = result.match(/分块数量: (\d+)/);
          if (m) totalChunks += parseInt(m[1]!, 10);
        } else {
          failed++;
          failures.push(`❌ ${path.basename(fp)}: 处理失败`);
        }
      } catch (e) {
        failed++;
        failures.push(`❌ ${path.basename(fp)}: ${toErr(e)}`);
      }
    }

    const lines = [
      "📊 **批量处理完成**",
      `✅ 成功: ${successful}/${filePaths.length} 个文档`,
      `📊 总分块数: ${totalChunks}`,
      `⏱️ 总耗时: ${Date.now() - t0}ms`,
      `📝 命名空间: ${namespace}`,
    ];
    if (failed > 0) {
      lines.push(`❌ 失败: ${failed} 个文档`, "", "**失败详情:**", ...failures);
    }
    return lines.join("\n");
  }

  /** 批量添加多个文本 */
  async addTextsBatch(
    texts: string[],
    namespace = "default",
    documentIds?: string[],
  ): Promise<string> {
    if (!texts.length) return "❌ 文本列表不能为空";
    if (documentIds && documentIds.length !== texts.length) {
      return "❌ 文本数量和文档 ID 数量不匹配";
    }

    let successful = 0;
    let failed = 0;
    let totalChunks = 0;
    const failures: string[] = [];
    const t0 = Date.now();

    for (let i = 0; i < texts.length; i++) {
      const docId = documentIds?.[i] ?? `batch_text_${i + 1}`;
      console.log(`[RagTool] 📝 处理文本 ${i + 1}/${texts.length}: ${docId}`);
      try {
        const result = await this.addText(texts[i]!, namespace, docId);
        if (result.startsWith("✅")) {
          successful++;
          const m = result.match(/分块数量: (\d+)/);
          if (m) totalChunks += parseInt(m[1]!, 10);
        } else {
          failed++;
          failures.push(`❌ ${docId}: 处理失败`);
        }
      } catch (e) {
        failed++;
        failures.push(`❌ ${docId}: ${toErr(e)}`);
      }
    }

    const lines = [
      "📊 **批量文本处理完成**",
      `✅ 成功: ${successful}/${texts.length} 个文本`,
      `📊 总分块数: ${totalChunks}`,
      `⏱️ 总耗时: ${Date.now() - t0}ms`,
      `📝 命名空间: ${namespace}`,
    ];
    if (failed > 0) {
      lines.push(`❌ 失败: ${failed} 个文本`, "", "**失败详情:**", ...failures);
    }
    return lines.join("\n");
  }

  /**
   * 为外部查询获取相关上下文片段（供 Agent 直接调用）
   */
  async getRelevantContext(
    query: string,
    limit = 3,
    maxChars = 1200,
    namespace?: string,
  ): Promise<string> {
    if (!query) return "";
    try {
      const pipeline = this.getOrCreatePipeline(namespace);
      const results = await pipeline.search(query, limit);
      if (!results.length) return "";

      const parts = results
        .map((r) => String(r.metadata["content"] ?? "").trim())
        .filter(Boolean);

      let merged = parts.join("\n\n");
      if (merged.length > maxChars) merged = merged.slice(0, maxChars) + "...";
      return merged;
    } catch (e) {
      return `获取上下文失败: ${toErr(e)}`;
    }
  }

  /** 清空当前工具管理的所有命名空间数据 */
  async clearAllNamespaces(): Promise<string> {
    try {
      for (const [, pipeline] of this.pipelines) {
        const store = pipeline.store as {clearCollection?: () => Promise<boolean> | boolean};
        if (typeof store.clearCollection === "function") {
          await store.clearCollection();
        }
      }
      this.pipelines.clear();
      this.initComponents();
      return "✅ 所有命名空间数据已清空并重新初始化";
    } catch (e) {
      return `❌ 清空所有命名空间失败: ${toErr(e)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// 私有工具函数
// ---------------------------------------------------------------------------

function toErr(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** 简单字符串哈希（用于自动生成文档 ID） */
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/** 清理内容用于上下文注入 */
function cleanContentForContext(content: string): string {
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.length > 300 ? collapsed.slice(0, 300) + "..." : collapsed;
}

/** 智能截断上下文，尽量保持段落完整性 */
function smartTruncateContext(context: string, maxChars: number): string {
  if (context.length <= maxChars) return context;
  const truncated = context.slice(0, maxChars);
  const lastBreak = truncated.lastIndexOf("\n\n");
  if (lastBreak > maxChars * 0.7) {
    return truncated.slice(0, lastBreak) + "\n\n[...更多内容被截断]";
  }
  return truncated.slice(0, maxChars - 20) + "...[内容被截断]";
}

/** 构建 RAG 问答系统提示词 */
function buildSystemPrompt(): string {
  return (
    "你是一个专业的知识助手，具备以下能力：\n" +
    "1. 📖 精准理解：仔细理解用户问题的核心意图\n" +
    "2. 🎯 可信回答：严格基于提供的上下文信息回答，不编造内容\n" +
    "3. 🔍 信息整合：从多个片段中提取关键信息，形成完整答案\n" +
    "4. 💡 清晰表达：用简洁明了的语言回答，适当使用结构化格式\n" +
    "5. 🚫 诚实表达：如果上下文不足以回答问题，请坦诚说明\n\n" +
    "回答格式要求：\n" +
    "• 直接回答核心问题\n" +
    "• 必要时使用要点或步骤\n" +
    "• 引用关键原文时使用引号\n" +
    "• 避免重复和冗余"
  );
}

/** 构建用户提示词 */
function buildUserPrompt(question: string, context: string): string {
  return (
    `请基于以下上下文信息回答问题：\n\n` +
    `【问题】${question}\n\n` +
    `【相关上下文】\n${context}\n\n` +
    `【要求】请提供准确、有帮助的回答。如果上下文信息不足，请说明需要什么额外信息。`
  );
}

/** 格式化最终问答结果 */
function formatFinalAnswer(
  answer: string,
  citations?: CitationItem[],
  searchTime = 0,
  llmTime = 0,
  avgScore = 0,
): string {
  const lines: string[] = ["🤖 **智能问答结果**\n", answer];

  if (citations && citations.length > 0) {
    lines.push("\n\n📚 **参考来源**");
    for (const c of citations) {
      const emoji = c.score > 0.8 ? "🟢" : c.score > 0.6 ? "🟡" : "🔵";
      lines.push(
        `${emoji} [${c.index}] ${c.source} (相似度: ${c.score.toFixed(3)})`,
      );
    }
  }

  lines.push(
    `\n⚡ 检索: ${searchTime}ms | 生成: ${llmTime}ms | 平均相似度: ${avgScore.toFixed(3)}`,
  );
  return lines.join("\n");
}
