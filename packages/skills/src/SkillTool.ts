import { Tool } from "@agenticforge/tools";
import type { ToolParameter } from "@agenticforge/tools";
import type { LLMClient } from "@agenticforge/core";
import { LruCache } from "@agenticforge/utils";
import type { IAgentSkill, SkillContext, SkillResult } from "./types";

// ---------------------------------------------------------------------------
// SkillTool — 将 IAgentSkill 适配为 Tool，注册进 ToolRegistry
// ---------------------------------------------------------------------------

/**
 * 将任意 `IAgentSkill` 包装成 `Tool`，使其可以注册进 `ToolRegistry`，
 * 供 `FunctionCallAgent`、`ReActAgent` 等所有基于工具调用的 Agent 使用。
 *
 * ### 渐进式披露
 * `run()` 返回的字符串末尾会附加 `[tools_used: ...]` 元数据行（当 skill
 * 内部使用了工具时），调用方可选择性解析。需要完整结构化结果时，
 * 使用 `runSkill()` 方法，它返回原始 `SkillResult`。
 *
 * ### 缓存
 * 构造时传入 `cacheSize` 启用 LRU 缓存。相同 query 的重复调用直接命中缓存，
 * 不再触发 LLM 调用。适合无副作用的 Markdown Skill 或查询类 Skill。
 *
 * @example
 * ```ts
 * import { SkillTool, skillsToTools } from "@agenticforge/skills";
 * import { ToolRegistry } from "@agenticforge/tools";
 * import { FunctionCallAgent, LLMClient } from "@agenticforge/kit";
 *
 * const llm = new LLMClient({ provider: "openai", model: "gpt-4o" });
 * const skills = await SkillLoader.fromDirectory(".cursor/skills");
 *
 * const registry = new ToolRegistry();
 * // 启用缓存：最多缓存 50 条结果
 * for (const skill of skills) {
 *   registry.registerTool(new SkillTool(skill, llm, { cacheSize: 50 }));
 * }
 * registry.registerTool(new SearchTool()); // 普通 Tool 混用
 *
 * // 任意 Agent 都可以用，不再需要 SkillAgent
 * const agent = new FunctionCallAgent({ name: "agent", llm, tools: registry.getAll() });
 * ```
 */
export class SkillTool extends Tool {
  private readonly skill: IAgentSkill;
  private readonly llm: LLMClient;
  /** LRU 缓存：query → output，undefined 表示未启用 */
  private readonly cache?: LruCache<string>;

  /**
   * @param skill      要包装的 Skill 实例
   * @param llm        LLM 客户端，注入给 skill.execute()
   * @param options    可选配置
   * @param options.cacheSize  启用 LRU 缓存并设置最大条目数（默认不缓存）
   */
  constructor(
    skill: IAgentSkill,
    llm: LLMClient,
    options?: {
      /** 启用结果缓存，指定最大缓存条目数。适合无副作用的查询类 Skill。 */
      cacheSize?: number;
    },
  ) {
    // 将 skill 的 description + triggerHint 合并为 Tool description
    // LLM 在 function calling 时会读取这段描述来决定是否调用
    const description = skill.triggerHint
      ? `${skill.description}\n触发条件：${skill.triggerHint}`
      : skill.description;

    super(skill.name, description);
    this.skill = skill;
    this.llm = llm;
    if (options?.cacheSize && options.cacheSize > 0) {
      this.cache = new LruCache<string>(options.cacheSize);
    }
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: "query",
        type: "string",
        description: "用户的完整问题或指令，原文传入即可",
        required: true,
        default: null,
      },
    ];
  }

  /**
   * 执行 Skill 并返回字符串结果。
   *
   * - 缓存命中时直接返回，不调用 LLM
   * - Skill 内部使用了工具时，输出末尾附加 `[tools_used: ...]` 元数据行
   * - 发生异常时返回 `Error: ...` 字符串，不抛出（保护 Agent 循环不崩溃）
   */
  async run(parameters: Record<string, unknown>): Promise<string> {
    const query = String(parameters.query ?? "").trim();
    if (!query) return "错误：query 不能为空";

    // 缓存命中直接返回
    if (this.cache) {
      const cached = this.cache.get(query);
      if (cached !== undefined) return cached;
    }

    const context: SkillContext = {
      query,
      // history 由调用方（Agent）管理，SkillTool 层不传递
      // 若需要传递历史，继承 SkillTool 并覆写 run()
    };

    try {
      const result = await this.skill.execute(context, this.llm);
      const output = this.formatOutput(result);
      // 写入缓存
      if (this.cache) this.cache.set(query, output);
      return output;
    } catch (e) {
      return `Error: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /**
   * 执行 Skill 并返回完整的 `SkillResult`（渐进式披露的结构化入口）。
   * 不经过缓存，不格式化输出，适合需要访问 `toolsUsed`、`data` 的场景。
   */
  async runSkill(query: string): Promise<SkillResult> {
    const trimmed = query.trim();
    if (!trimmed) throw new Error("query 不能为空");
    const context: SkillContext = { query: trimmed };
    return this.skill.execute(context, this.llm);
  }

  /**
   * 返回被包装的原始 Skill 实例。
   * 用于在需要访问 Skill 元数据时（如 triggerHint、systemPrompt）直接访问。
   */
  getSkill(): IAgentSkill {
    return this.skill;
  }

  /**
   * 返回缓存统计信息。未启用缓存时返回 null。
   */
  getCacheStats(): { size: number; keys: string[] } | null {
    if (!this.cache) return null;
    return { size: this.cache.size, keys: this.cache.keys() };
  }

  /**
   * 清空缓存。
   */
  clearCache(): void {
    this.cache?.clear();
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  /**
   * 格式化 SkillResult 为字符串。
   * 渐进式披露：若 skill 内部使用了工具，附加 tools_used 元数据行。
   * 调用方可通过解析 `[tools_used: ...]` 获取执行链路信息。
   */
  private formatOutput(result: SkillResult): string {
    if (result.toolsUsed && result.toolsUsed.length > 0) {
      return `${result.output}\n\n[tools_used: ${result.toolsUsed.join(", ")}]`;
    }
    return result.output;
  }
}

// ---------------------------------------------------------------------------
// 工厂函数 — 批量将 Skill 列表转换为 SkillTool 数组
// ---------------------------------------------------------------------------

/**
 * 将一组 Skill 批量转换为 SkillTool 数组，方便直接传给 ToolRegistry 或 Agent。
 *
 * @example
 * ```ts
 * const skills = await SkillLoader.fromDirectory(".cursor/skills");
 * const tools = skillsToTools(skills, llm, { cacheSize: 50 });
 *
 * const registry = new ToolRegistry();
 * tools.forEach(t => registry.registerTool(t));
 * ```
 */
export function skillsToTools(
  skills: IAgentSkill[],
  llm: LLMClient,
  options?: { cacheSize?: number },
): SkillTool[] {
  return skills.map((skill) => new SkillTool(skill, llm, options));
}
