import type { LLMClient } from "@agenticforge/core";
import type { IAgentSkill } from "./types";
import type { SkillRegistry } from "./SkillRegistry";

// ---------------------------------------------------------------------------
// SkillDispatcher — 纯路由逻辑，不负责执行
// ---------------------------------------------------------------------------
//
// 职责：给定一个用户 query，从 SkillRegistry 中找出最匹配的 Skill。
// 两级路由策略：
//   1. 规则路由（零 LLM 开销）：基于 triggerHint 关键词匹配
//   2. LLM 路由（兜底）：把所有 Skill 描述给 LLM，让它选一个
//
// 不负责执行 Skill，只返回匹配到的 Skill 实例（或 undefined）。
// 执行逻辑由调用方（SkillRunner、SkillAgent）负责。

export interface SkillDispatcherOptions {
  /** 自定义路由 prompt 模板，支持 {skills} 和 {query} 占位符 */
  routerPromptTemplate?: string;
  /**
   * 规则路由分隔符（用于拆分 triggerHint），默认 /[,，、]/
   * 示例 triggerHint："当用户询问天气，温度，降雨时"
   */
  triggerHintSeparator?: RegExp;
  /** 是否禁用规则路由，只走 LLM 路由，默认 false */
  disableRuleRouting?: boolean;
}

const DEFAULT_ROUTER_PROMPT = [
  "你是一个意图路由器。根据用户输入，从下面的 Skill 列表中选出最合适的一个。",
  "只回答 Skill 的名称（name 字段），不要包含任何解释或标点。",
  "如果没有合适的 Skill，回答 __none__。",
  "",
  "## 可用 Skills",
  "{skills}",
  "",
  "## 用户输入",
  "{query}",
  "",
  "## 你的选择（只填 Skill name 或 __none__）：",
].join("\n");

/**
 * 纯路由器：给定 query，从 SkillRegistry 找出最匹配的 Skill。
 *
 * 两级策略（依次尝试）：
 * 1. **规则路由**：遍历 Skill 的 `triggerHint`，关键词命中则直接返回，零 LLM 调用
 * 2. **LLM 路由**：把所有可见 Skill 的描述给 LLM，让它选择最合适的一个
 *
 * @example
 * ```ts
 * const dispatcher = new SkillDispatcher(registry, llm);
 * const skill = await dispatcher.dispatch("东京今天天气怎么样？");
 * if (skill) {
 *   const result = await skill.execute({ query }, llm);
 * }
 * ```
 */
export class SkillDispatcher {
  private readonly registry: SkillRegistry;
  private readonly llm: LLMClient;
  private readonly routerPromptTemplate: string;
  private readonly triggerHintSeparator: RegExp;
  private readonly disableRuleRouting: boolean;

  constructor(registry: SkillRegistry, llm: LLMClient, options: SkillDispatcherOptions = {}) {
    this.registry = registry;
    this.llm = llm;
    this.routerPromptTemplate = options.routerPromptTemplate ?? DEFAULT_ROUTER_PROMPT;
    this.triggerHintSeparator = options.triggerHintSeparator ?? /[,，、]/;
    this.disableRuleRouting = options.disableRuleRouting ?? false;
  }

  /**
   * 路由：返回最匹配的 Skill，或 undefined（无匹配时）。
   *
   * - 只有 0 个可见 Skill → undefined
   * - 只有 1 个可见 Skill → 直接返回（跳过路由开销）
   * - 多个 Skill → 规则路由 → LLM 路由
   */
  async dispatch(query: string): Promise<IAgentSkill | undefined> {
    const visible = this.registry.visible();

    if (visible.length === 0) return undefined;
    if (visible.length === 1) return visible[0];

    // 规则路由（优先，零 LLM 开销）
    if (!this.disableRuleRouting) {
      const ruleMatch = this.ruleRoute(query, visible);
      if (ruleMatch) return ruleMatch;
    }

    // LLM 路由（兜底）
    return this.llmRoute(query, visible);
  }

  /**
   * 规则路由：基于 triggerHint 关键词匹配。
   * 将 triggerHint 按分隔符拆分，只要 query 包含其中一个词组，即命中。
   */
  private ruleRoute(query: string, visible: IAgentSkill[]): IAgentSkill | undefined {
    const q = query.toLowerCase();
    for (const skill of visible) {
      if (!skill.triggerHint) continue;
      const hints = skill.triggerHint
        .toLowerCase()
        .split(this.triggerHintSeparator)
        .map((h) => h.trim())
        .filter(Boolean);
      if (hints.some((hint) => q.includes(hint))) return skill;
    }
    return undefined;
  }

  /**
   * LLM 路由：把所有可见 Skill 描述给 LLM，让它选出 name。
   * 三级兜底匹配：精确匹配 → startsWith → includes。
   */
  private async llmRoute(query: string, visible: IAgentSkill[]): Promise<IAgentSkill | undefined> {
    const prompt = this.routerPromptTemplate
      .replace("{skills}", this.registry.describeAll())
      .replace("{query}", query);

    const raw = (await this.llm.think([{ role: "user", content: prompt }])).trim().toLowerCase();

    // LLM 明确回答无匹配
    if (raw === "__none__") return undefined;

    return (
      this.registry.get(raw) ??
      visible.find((s) => s.name.toLowerCase().startsWith(raw)) ??
      visible.find((s) => raw.includes(s.name.toLowerCase()))
    );
  }
}
