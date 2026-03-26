import { Agent, Message, createAgentMessage } from "@agenticforge/core";
import type { LLMClient, Config } from "@agenticforge/core";
import { SkillRegistry, SkillDispatcher } from "@agenticforge/skills";
import type { IAgentSkill, SkillContext, SkillResult } from "@agenticforge/skills";

/**
 * SkillAgent — 基于意图路由的多技能 Agent
 *
 * 架构：
 * ```
 * 用户输入
 *     ↓
 * SkillDispatcher（两级路由）
 *     ├── 规则路由（triggerHint 关键词，零 LLM 开销）
 *     └── LLM 路由（兜底）
 *         ↓ 命中
 * Skill.execute(context, llm)
 *         ↓ 未命中
 * 纯 LLM fallback（systemPrompt）
 * ```
 *
 * @example
 * ```ts
 * const agent = new SkillAgent({
 *   name: "assistant",
 *   llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
 *   skills: [weatherSkill, stockSkill],
 * });
 *
 * const result = await agent.run("东京今天下雨吗？");
 * // → 路由到 weatherSkill
 *
 * // 跳过路由，直接执行指定 Skill
 * const result2 = await agent.runSkill("stock", "AAPL 现在多少钱？");
 * ```
 */
export class SkillAgent extends Agent {
  readonly skillRegistry: SkillRegistry;
  private readonly dispatcher: SkillDispatcher;
  private readonly fallbackPrompt: string;

  constructor(params: {
    name: string;
    llm: LLMClient;
    systemPrompt?: string;
    config?: Config;
    skills?: IAgentSkill[];
    /** 自定义路由 prompt 模板（支持 {skills} 和 {query} 占位符） */
    routerPromptTemplate?: string;
    /** 是否禁用规则路由，只走 LLM 路由，默认 false */
    disableRuleRouting?: boolean;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    this.fallbackPrompt = params.systemPrompt ?? "你是一个通用AI助理，请回答用户的问题。";
    this.skillRegistry = new SkillRegistry();
    for (const skill of params.skills ?? []) this.skillRegistry.register(skill);

    this.dispatcher = new SkillDispatcher(this.skillRegistry, params.llm, {
      routerPromptTemplate: params.routerPromptTemplate,
      disableRuleRouting: params.disableRuleRouting,
    });
  }

  // ---------------------------------------------------------------------------
  // Skill 管理 API
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
  // run() — 主入口
  // ---------------------------------------------------------------------------

  async run(
    inputText: string,
    options?: { skillName?: string; metadata?: Record<string, unknown> },
  ): Promise<string> {
    const result = await this.runInternal(inputText, options);
    this.addMessage(createAgentMessage("user", inputText));
    this.addMessage(createAgentMessage("assistant", result.output));
    return result.output;
  }

  // ---------------------------------------------------------------------------
  // runSkill() — 直接调用指定 Skill，跳过路由
  // ---------------------------------------------------------------------------

  async runSkill(
    skillName: string,
    query: string,
    metadata?: Record<string, unknown>,
  ): Promise<SkillResult> {
    return this.runInternal(query, { skillName, metadata });
  }

  // ---------------------------------------------------------------------------
  // streamRun() — 流式输出
  // ---------------------------------------------------------------------------

  async *streamRun(
    inputText: string,
    options?: {
      skillName?: string;
      metadata?: Record<string, unknown>;
      temperature?: number;
    },
  ): AsyncGenerator<string> {
    const skill = await this.resolveSkill(inputText, options?.skillName);

    if (!skill) {
      let full = "";
      for await (const chunk of this.llm.streamThink(
        [
          { role: "system", content: this.fallbackPrompt },
          ...this.getHistoryMessages(),
          { role: "user", content: inputText },
        ],
        options?.temperature,
      )) {
        full += chunk;
        yield chunk;
      }
      this.addMessage(createAgentMessage("user", inputText));
      this.addMessage(createAgentMessage("assistant", full));
      return;
    }

    const context: SkillContext = {
      query: inputText,
      metadata: options?.metadata,
      history: this.getHistoryMessages(),
    };
    const result = await skill.execute(context, this.llm);
    this.addMessage(createAgentMessage("user", inputText));
    this.addMessage(createAgentMessage("assistant", result.output));
    yield result.output;
  }

  // ---------------------------------------------------------------------------
  // 私有方法
  // ---------------------------------------------------------------------------

  private async runInternal(
    inputText: string,
    options?: { skillName?: string; metadata?: Record<string, unknown> },
  ): Promise<SkillResult> {
    const skill = await this.resolveSkill(inputText, options?.skillName);

    if (!skill) {
      const output = await this.llm.think([
        { role: "system", content: this.fallbackPrompt },
        ...this.getHistoryMessages(),
        { role: "user", content: inputText },
      ]);
      return { output };
    }

    const context: SkillContext = {
      query: inputText,
      metadata: options?.metadata,
      history: this.getHistoryMessages(),
    };
    return skill.execute(context, this.llm);
  }

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

  private getHistoryMessages(): Array<{ role: "user" | "assistant"; content: string }> {
    return this.history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
  }
}
