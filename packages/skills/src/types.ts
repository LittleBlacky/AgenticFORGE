import type {LLMClient} from "@agenticforge/core";
import type {Tool, FunctionTool} from "@agenticforge/tools";

// ---------------------------------------------------------------------------
// SkillContext — 每次调用时注入给 Skill 的上下文
// ---------------------------------------------------------------------------

export interface SkillContext {
  /** 当前用户输入 */
  query: string;
  /** 调用方传入的任意元数据（权限、用户身份、会话 ID 等） */
  metadata?: Record<string, unknown>;
  /** 可选：对话历史（转发给 Skill 内部 LLM 调用） */
  history?: Array<{role: "user" | "assistant" | "system"; content: string}>;
}

// ---------------------------------------------------------------------------
// SkillResult — Skill 执行后的返回结构
// ---------------------------------------------------------------------------

export interface SkillResult {
  /** Skill 最终产出的文本 */
  output: string;
  /** 执行过程中调用的工具名列表（可选，用于可观测性） */
  toolsUsed?: string[];
  /** Skill 自定义的附加数据 */
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SkillDefinition — 定义一个 Skill 所需的静态配置
// ---------------------------------------------------------------------------

export interface SkillDefinition {
  /**
   * Skill 唯一标识名，用于注册与路由。
   * 建议使用 kebab-case，例如 "stock-query"、"email-composer"。
   */
  name: string;

  /**
   * 一句话描述该 Skill 能做什么。
   * SkillAgent 会把所有 Skill 的描述展示给 LLM，
   * 让它选择最合适的 Skill。
   */
  description: string;

  /**
   * 触发条件（可选）。
   * 描述什么样的用户输入应该触发这个 Skill。
   * 例如："当用户询问股票价格、K线图或市值时"
   */
  triggerHint?: string;

  /**
   * 该 Skill 专属的 System Prompt（可选）。
   */
  systemPrompt?: string;

  /**
   * 该 Skill 可用的工具（可选）。
   * 只有这些工具会在该 Skill 的执行上下文中出现。
   */
  tools?: Array<Tool | FunctionTool<Record<string, unknown>>>;

  /**
   * 是否在 SkillAgent 路由时对外可见（默认 true）。
   * 设为 false 则只能通过 runSkill(name) 直接调用。
   */
  visible?: boolean;
}

// ---------------------------------------------------------------------------
// IAgentSkill — 每个 Skill 必须实现的接口
// ---------------------------------------------------------------------------

export interface IAgentSkill extends SkillDefinition {
  /**
   * 执行该 Skill。
   * @param context  包含 query、history、metadata 的调用上下文
   * @param llm      由 SkillAgent 注入的 LLM 客户端
   * @returns        SkillResult
   */
  execute(context: SkillContext, llm: LLMClient): Promise<SkillResult>;
}
