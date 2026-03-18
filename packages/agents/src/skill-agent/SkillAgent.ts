import {Agent, Message} from "@agenticforge/core";
import type {LLMClient, Config} from "@agenticforge/core";
import {SkillRegistry} from "@agenticforge/skills";
import type {IAgentSkill, SkillContext, SkillResult} from "@agenticforge/skills";

// ---------------------------------------------------------------------------
// SkillAgent — Agent-integrated Skill orchestrator
// ---------------------------------------------------------------------------

/**
 * An Agent that routes each user query to the most appropriate registered Skill.
 *
 * Extends `@agenticforge/core` Agent so it participates in the standard
 * history / runStructured / streamRun lifecycle.
 *
 * For a framework-independent alternative, use `SkillRunner` from
 * `@agenticforge/skills` which does not depend on the Agent base class.
 *
 * Architecture:
 * ```
 * User query
 *     │
 *     ▼
 * SkillAgent.run()
 *     │
 *     ├─ skillName provided  ──► execute named Skill directly
 *     ├─ 1 Skill registered  ──► execute that Skill directly
 *     └─ N Skills registered ──► LLM routing → execute matched Skill
 * ```
 *
 * Example:
 * ```ts
 * import { SkillAgent, AgentSkill } from "@agenticforge/agents";
 *
 * const agent = new SkillAgent({
 *   name: "assistant",
 *   llm: myLLM,
 *   skills: [weatherSkill, stockSkill, emailSkill],
 * });
 *
 * const reply = await agent.run("今天东京天气怎么样？");
 * const result = await agent.runSkill("stock", "苹果股票现在多少？");
 * ```
 */
export class SkillAgent extends Agent {
  readonly skillRegistry: SkillRegistry;
  private readonly routerPromptTemplate: string;

  constructor(params: {
    name: string;
    llm: LLMClient;
    systemPrompt?: string;
    config?: Config;
    skills?: IAgentSkill[];
    routerPromptTemplate?: string;
  }) {
    super({
      name: params.name,
      llm: params.llm,
      systemPrompt: params.systemPrompt,
      config: params.config,
    });

    this.skillRegistry = new SkillRegistry();
    for (const skill of params.skills ?? []) {
      this.skillRegistry.register(skill);
    }

    this.routerPromptTemplate =
      params.routerPromptTemplate ??
      [
        "你是一个意图路由器。根据用户输入，从下面的 Skill 列表中选出最合适的一个。",
        "只回答 Skill 的名称（name 字段），不要包含任何解释或标点。",
        "",
        "## 可用 Skills",
        "{skills}",
        "",
        "## 用户输入",
        "{query}",
        "",
        "## 你的选择（只填 Skill name）：",
      ].join("\n");
  }

  // -------------------------------------------------------------------------
  // Skill management
  // -------------------------------------------------------------------------

  addSkill(skill: IAgentSkill): void {
    this.skillRegistry.register(skill);
  }

  removeSkill(name: string): boolean {
    return this.skillRegistry.unregister(name);
  }

  listSkills(): string[] {
    return this.skillRegistry.list();
  }

  // -------------------------------------------------------------------------
  // Routing
  // -------------------------------------------------------------------------

  private async routeToSkill(query: string): Promise<IAgentSkill | undefined> {
    const visible = this.skillRegistry.visible();
    if (visible.length === 0) return undefined;
    if (visible.length === 1) return visible[0];

    const prompt = this.routerPromptTemplate
      .replace("{skills}", this.skillRegistry.describeAll())
      .replace("{query}", query);

    const raw = (await this.llm.think([{role: "user", content: prompt}])).trim().toLowerCase();

    return (
      this.skillRegistry.get(raw) ??
      visible.find((s) => s.name.toLowerCase().startsWith(raw)) ??
      visible.find((s) => raw.includes(s.name.toLowerCase()))
    );
  }

  // -------------------------------------------------------------------------
  // Primary API
  // -------------------------------------------------------------------------

  /**
   * Auto-route to the best Skill and execute it.
   * Saves input/output to conversation history.
   */
  async run(
    inputText: string,
    options?: {
      skillName?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    const result = await this.runSkillInternal(inputText, options);
    this.addMessage(new Message({role: "user", content: inputText}));
    this.addMessage(new Message({role: "assistant", content: result.output}));
    return result.output;
  }

  /**
   * Directly invoke a named Skill and return the full SkillResult.
   */
  async runSkill(
    skillName: string,
    query: string,
    metadata?: Record<string, unknown>,
  ): Promise<SkillResult> {
    return this.runSkillInternal(query, {skillName, metadata});
  }

  async *streamRun(
    inputText: string,
    options?: {skillName?: string; metadata?: Record<string, unknown>},
  ): AsyncGenerator<string> {
    yield await this.run(inputText, options);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private async runSkillInternal(
    inputText: string,
    options?: {skillName?: string; metadata?: Record<string, unknown>},
  ): Promise<SkillResult> {
    let skill: IAgentSkill | undefined;

    if (options?.skillName) {
      skill = this.skillRegistry.get(options.skillName);
      if (!skill) {
        throw new Error(
          `Skill "${options.skillName}" not found. Available: ${this.skillRegistry.list().join(", ")}`,
        );
      }
    } else {
      skill = await this.routeToSkill(inputText);
    }

    // No skill matched — fallback to plain LLM
    if (!skill) {
      const fallback = this.systemPrompt ?? "你是一个通用AI助理，请回答用户的问题。";
      const output = await this.llm.think([
        {role: "system", content: fallback},
        ...this.history.map((m) => ({role: m.role as "user" | "assistant", content: m.content})),
        {role: "user", content: inputText},
      ]);
      return {output};
    }

    const context: SkillContext = {
      query: inputText,
      metadata: options?.metadata,
      history: this.history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    };

    return skill.execute(context, this.llm);
  }
}
