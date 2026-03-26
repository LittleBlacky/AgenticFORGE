import type { LLMClient, Config } from "@agenticforge/core";
import type { IAgentSkill, SkillContext, SkillResult } from "./types";
import { SkillRegistry } from "./SkillRegistry";
import { SkillDispatcher } from "./SkillDispatcher";
import type { SkillDispatcherOptions } from "./SkillDispatcher";

// ---------------------------------------------------------------------------
// SkillRunner — 框架无关的 Skill 编排器
// ---------------------------------------------------------------------------

/**
 * 轻量、框架无关的 Skill 编排器。
 *
 * 与 `SkillAgent`（继承自 `Agent` 基类）不同，
 * `SkillRunner` 不依赖 `@agenticforge/agents`，可在任何上下文中使用。
 *
 * 路由逻辑完全委托给 `SkillDispatcher`：
 *   1. 规则路由（triggerHint 关键词，零 LLM 开销）
 *   2. LLM 路由（兜底）
 *
 * @example
 * ```ts
 * const runner = new SkillRunner({
 *   llm: myLLMClient,
 *   skills: [weatherSkill, stockSkill],
 * });
 *
 * const result = await runner.run("东京今天下雨吗？");
 * console.log(result.output);
 *
 * // 直接调用指定 Skill，跳过路由
 * const result2 = await runner.runSkill("stock", "AAPL 现在多少钱？");
 * ```
 */
export class SkillRunner {
  readonly skillRegistry: SkillRegistry;
  private readonly llm: LLMClient;
  private readonly fallbackPrompt: string;
  private readonly dispatcher: SkillDispatcher;

  constructor(params: {
    llm: LLMClient;
    config?: Config;
    skills?: IAgentSkill[];
    fallbackPrompt?: string;
    /** 传给 SkillDispatcher 的路由选项 */
    dispatcher?: SkillDispatcherOptions;
  }) {
    this.llm = params.llm;
    this.fallbackPrompt = params.fallbackPrompt ?? "你是一个通用AI助理，请回答用户的问题。";

    this.skillRegistry = new SkillRegistry();
    for (const skill of params.skills ?? []) {
      this.skillRegistry.register(skill);
    }

    this.dispatcher = new SkillDispatcher(this.skillRegistry, this.llm, params.dispatcher);
  }

  // ---------------------------------------------------------------------------
  // Skill 管理
  // ---------------------------------------------------------------------------

  addSkill(skill: IAgentSkill): void {
    this.skillRegistry.register(skill);
  }

  removeSkill(name: string): boolean {
    return this.skillRegistry.unregister(name);
  }

  listSkills(): string[] {
    return this.skillRegistry.list();
  }

  // ---------------------------------------------------------------------------
  // 主 API
  // ---------------------------------------------------------------------------

  /**
   * 自动路由到最匹配的 Skill 并执行。
   * 未命中时 fallback 到纯 LLM 调用。
   */
  async run(
    query: string,
    options?: {
      skillName?: string;
      metadata?: Record<string, unknown>;
      history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    },
  ): Promise<SkillResult> {
    const skill = await this.resolveSkill(query, options?.skillName);

    if (!skill) {
      const output = await this.llm.think([
        { role: "system", content: this.fallbackPrompt },
        ...(options?.history ?? []),
        { role: "user", content: query },
      ]);
      return { output };
    }

    const context: SkillContext = {
      query,
      metadata: options?.metadata,
      history: options?.history?.filter(
        (m): m is { role: "user" | "assistant"; content: string } =>
          m.role === "user" || m.role === "assistant",
      ),
    };
    return skill.execute(context, this.llm);
  }

  /**
   * 直接调用指定 Skill，跳过路由。
   */
  async runSkill(
    skillName: string,
    query: string,
    options?: {
      metadata?: Record<string, unknown>;
      history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    },
  ): Promise<SkillResult> {
    return this.run(query, { skillName, ...options });
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  private async resolveSkill(query: string, skillName?: string): Promise<IAgentSkill | undefined> {
    if (skillName) {
      const skill = this.skillRegistry.get(skillName);
      if (!skill)
        throw new Error(
          `Skill "${skillName}" not found. Available: ${this.skillRegistry.list().join(", ")}`,
        );
      return skill;
    }
    return this.dispatcher.dispatch(query);
  }
}
