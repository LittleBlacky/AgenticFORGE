/** A2A 协议核心类型定义 */

/** A2A 服务器信息 */
export interface A2AServerInfo {
  name: string;
  description: string;
  version: string;
  capabilities: Record<string, unknown>;
  protocol: "A2A";
  skills: string[];
}

/** A2A 技能处理函数 */
export type A2ASkillHandler = (
  text: string,
  data?: Record<string, unknown>,
) => string | Promise<string>;

/** 注册的技能条目 */
export interface RegisteredSkill {
  name: string;
  description: string;
  handler: A2ASkillHandler;
}

/** 技能执行请求 */
export interface SkillExecuteRequest {
  text?: string;
  query?: string;
  data?: Record<string, unknown>;
}

/** 技能执行结果 */
export interface SkillExecuteResult {
  skill: string;
  result: string;
  status: "success" | "error";
  error?: string;
}

/** 通用问答请求 */
export interface AskRequest {
  question?: string;
  text?: string;
}

/** 通用问答结果 */
export interface AskResult {
  answer: string;
  skillUsed?: string;
  status: "success" | "no_match" | "error";
  error?: string;
}

/** Agent 网络节点 */
export interface AgentNode {
  name: string;
  url: string;
  metadata?: Record<string, unknown>;
  registeredAt?: string;
}
