import { Tool, type FunctionTool, ToolRegistry } from "@agenticforge/tools";
import type { LLMClient } from "@agenticforge/core";
import { ToolCallExecutor } from "@agenticforge/core";
import type { IAgentSkill, SkillContext, SkillDefinition, SkillResult } from "./types";

// ---------------------------------------------------------------------------
// AgentSkill — 可继承的 Skill 基类
// ---------------------------------------------------------------------------

/**
 * AgentSkill 是一个可复用的 Agent 能力单元。
 *
 * 类比：
 * - Semantic Kernel 的 `KernelPlugin`
 * - Copilot Studio 的 `Skill`
 * - AutoGen 的 `AssistantAgent` with specific tools
 *
 * 每个 Skill 封装了：
 *  - 一个明确的业务语义（name + description）
 *  - 专属的 System Prompt
 *  - 专属的工具集（只有这个 Skill 能用的工具）
 *  - 独立的 execute() 执行逻辑
 *
 * 使用方式 A — 直接实例化（适合简单场景）：
 * ```ts
 * const weatherSkill = new AgentSkill({
 *   name: "weather",
 *   description: "获取城市实时天气，回答关于温度、降雨、风速的问题",
 *   triggerHint: "当用户询问天气、温度、是否下雨时",
 *   systemPrompt: "你是天气助理，只回答天气相关问题，用简洁中文回答。",
 *   tools: [weatherApiTool],
 * });
 * ```
 *
 * 使用方式 B — 继承扩展（适合复杂场景）：
 * ```ts
 * class StockSkill extends AgentSkill {
 *   constructor() {
 *     super({ name: "stock", description: "查询股票实时价格", tools: [stockTool] });
 *   }
 *
 *   override async execute(ctx, llm): Promise<SkillResult> {
 *     const price = await fetchStockPrice(ctx.query);
 *     return { output: `当前股价：${price}` };
 *   }
 * }
 * ```
 */
export class AgentSkill implements IAgentSkill {
  readonly name: string;
  readonly description: string;
  readonly triggerHint?: string;
  readonly systemPrompt?: string;
  readonly tools: Array<Tool | FunctionTool<Record<string, unknown>>>;
  readonly visible: boolean;

  constructor(definition: SkillDefinition) {
    this.name = definition.name;
    this.description = definition.description;
    this.triggerHint = definition.triggerHint;
    this.systemPrompt = definition.systemPrompt;
    this.tools = definition.tools ?? [];
    this.visible = definition.visible ?? true;
  }

  // -------------------------------------------------------------------------
  // Tool registry (lazy-built per Skill instance)
  // -------------------------------------------------------------------------

  private _registry?: ToolRegistry;

  protected get toolRegistry(): ToolRegistry {
    if (!this._registry) {
      this._registry = new ToolRegistry();
      for (const t of this.tools) {
        if (t instanceof Tool) {
          this._registry.registerTool(t);
        } else {
          this._registry.registerFunction(t.name, t.description, t.func, t.schema);
        }
      }
    }
    return this._registry;
  }

  // -------------------------------------------------------------------------
  // Default execute — runs an LLM call with this Skill's prompt + tools
  // -------------------------------------------------------------------------

  /**
   * Default implementation: builds messages from context + systemPrompt,
   * delegates to ToolCallExecutor for the function-calling loop.
   *
   * Override this method for fully custom Skill logic.
   */
  async execute(context: SkillContext, llm: LLMClient): Promise<SkillResult> {
    const sysPrompt = this.systemPrompt ?? `你是专门负责"${this.description}"的助理。`;

    const messages = [
      { role: "system" as const, content: sysPrompt },
      ...(context.history ?? []),
      { role: "user" as const, content: context.query },
    ];

    const executor = new ToolCallExecutor({ llm, maxIterations: 3 });
    const schemas = this.tools.length > 0 ? this.toolRegistry.getOpenAISchemas() : [];

    try {
      const result = await executor.run({
        messages,
        tools: schemas as Record<string, unknown>[],
        executor: (name, args) => this.toolRegistry.execute(name, args),
      });

      return {
        output: result.output,
        ...(result.toolsUsed.length > 0 ? { toolsUsed: result.toolsUsed } : {}),
      };
    } catch (e) {
      // 当工具调用需要 OpenAI client 但 LLM 未暴露时，fallback 到纯 llm.think()
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("未暴露底层 OpenAI 客户端") || msg.includes("does not expose")) {
        const output = await llm.think(messages);
        return { output };
      }
      throw e;
    }
  }

  // -------------------------------------------------------------------------
  // Describe (for SkillAgent routing prompt)
  // -------------------------------------------------------------------------

  describe(): string {
    const lines = [`- **${this.name}**: ${this.description}`];
    if (this.triggerHint) lines.push(`  触发条件：${this.triggerHint}`);
    return lines.join("\n");
  }
}
