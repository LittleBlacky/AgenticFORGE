import type { IAgentSkill } from "./types";
import { AgentSkill } from "./AgentSkill";

/**
 * Manages a collection of AgentSkills.
 *
 * ```ts
 * const registry = new SkillRegistry();
 * registry.register(weatherSkill);
 * registry.register(stockSkill);
 *
 * registry.get("weather");  // => AgentSkill
 * registry.list();           // => ["weather", "stock"]
 * registry.describeAll();    // markdown bullet list for LLM prompt
 * ```
 */
export class SkillRegistry {
  private readonly skills = new Map<string, IAgentSkill>();

  register(skill: IAgentSkill): void {
    this.skills.set(skill.name, skill);
  }

  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  get(name: string): IAgentSkill | undefined {
    return this.skills.get(name);
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }

  list(): string[] {
    return Array.from(this.skills.keys());
  }

  all(): IAgentSkill[] {
    return Array.from(this.skills.values());
  }

  /** Return only Skills that are visible for LLM routing */
  visible(): IAgentSkill[] {
    return this.all().filter((s) => s.visible !== false);
  }

  size(): number {
    return this.skills.size;
  }

  /**
   * Produce a markdown bullet list of all visible Skills.
   * Used by SkillAgent to build the routing system prompt.
   */
  describeAll(): string {
    const visibleSkills = this.visible();
    if (visibleSkills.length === 0) return "（暂无可用 Skill）";
    return visibleSkills
      .map((s) =>
        s instanceof AgentSkill
          ? s.describe()
          : `- **${s.name}**: ${s.description}${
              s.triggerHint ? `\n  触发条件：${s.triggerHint}` : ""
            }`,
      )
      .join("\n");
  }
}
