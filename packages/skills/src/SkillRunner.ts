import type {LLMClient, Config} from "@agenticforge/core";
import type {IAgentSkill, SkillContext, SkillResult} from "./types";
import {SkillRegistry} from "./SkillRegistry";

// ---------------------------------------------------------------------------
// SkillAgent
// ---------------------------------------------------------------------------

/**
 * A lightweight, framework-independent Skill runner.
 *
 * Unlike the `SkillAgent` in `@agenticforge/agents` (which extends `Agent`),
 * this class is a standalone orchestrator that does NOT depend on the agents
 * package — making it usable in any context.
 *
 * Architecture:
 * ```
 * User query
 *     │
 *     ▼
 * SkillRunner.run()
 *     │
 *     ├─ skillName provided ──► execute named Skill directly
 *     ├─ 1 Skill registered ──► execute that Skill directly
 *     └─ N Skills            ──► LLM routing → execute matched Skill
 * ```
 *
 * Example:
 * ```ts
 * import { SkillRunner, AgentSkill } from "@agenticforge/skills";
 *
 * const runner = new SkillRunner({
 *   llm: myLLMClient,
 *   skills: [weatherSkill, stockSkill],
 * });
 *
 * const result = await runner.run("东京今天下雨吗？");
 * console.log(result.output);
 * ```
 */
export class SkillRunner {
  readonly skillRegistry: SkillRegistry;
  private readonly llm: LLMClient;
  private readonly fallbackPrompt: string;
  private readonly routerPromptTemplate: string;

  constructor(params: {
    llm: LLMClient;
    skills?: IAgentSkill[];
    fallbackPrompt?: string;
    routerPromptTemplate?: string;
  }) {
    this.llm = params.llm;
    this.fallbackPrompt = params.fallbackPrompt ?? "你是一个通用AI助理，请回答用户的问题。";
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

    this.skillRegistry = new SkillRegistry();
    for (const skill of params.skills ?? []) {
      this.skillRegistry.register(skill);
    }
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
   * Run: auto-route to the best Skill and execute it.
   */
  async run(
    query: string,
    options?: {
      skillName?: string;
      metadata?: Record<string, unknown>;
      history?: Array<{role: "user" | "assistant" | "system"; content: string}>;
    },
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
      skill = await this.routeToSkill(query);
    }

    if (!skill) {
      const output = await this.llm.think([
        {role: "system", content: this.fallbackPrompt},
        ...(options?.history ?? []),
        {role: "user", content: query},
      ]);
      return {output};
    }

    const context: SkillContext = {
      query,
      metadata: options?.metadata,
      history: options?.history,
    };

    return skill.execute(context, this.llm);
  }

  /**
   * Directly invoke a named Skill and return the full SkillResult.
   */
  async runSkill(
    skillName: string,
    query: string,
    options?: {
      metadata?: Record<string, unknown>;
      history?: Array<{role: "user" | "assistant" | "system"; content: string}>;
    },
  ): Promise<SkillResult> {
    return this.run(query, {skillName, ...options});
  }
}
