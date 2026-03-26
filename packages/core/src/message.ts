import type { LLMMessage, MessageRole } from "./types";

// Re-export so consumers can import from either place
export type { LLMMessage, MessageRole };

// ---------------------------------------------------------------------------
// AgentMessage — Agent 内部会话历史专用，扩展自 LLMMessage
// ---------------------------------------------------------------------------

export interface MessageMetadata {
  [key: string]: unknown;
}

/**
 * AgentMessage 是 Agent 内部 history 数组的条目类型。
 * 相比 LLMMessage 额外携带运行时元数据（timestamp、metadata），
 * 仅在 Agent 基类及其子类内部使用，不作为 LLM 调用格式。
 */
export interface AgentMessage extends LLMMessage {
  timestamp: Date;
  metadata: MessageMetadata;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 创建一个 AgentMessage，timestamp 默认为当前时间。
 */
export function createAgentMessage(
  role: MessageRole,
  content: string,
  metadata: MessageMetadata = {},
  timestamp: Date = new Date(),
): AgentMessage {
  return { role, content, timestamp, metadata };
}

/**
 * 将 AgentMessage 转换为 LLMMessage（去除运行时字段）。
 */
export function toLLMMessage(msg: AgentMessage): LLMMessage {
  return { role: msg.role, content: msg.content };
}

/**
 * 格式化消息为可读字符串。
 */
export function formatMessage(msg: LLMMessage): string {
  return `[${msg.role}] ${msg.content}`;
}

// ---------------------------------------------------------------------------
// 向后兼容：保留 Message 作为 AgentMessage 的别名，便于渐进迁移
// ---------------------------------------------------------------------------

/**
 * @deprecated 请使用 AgentMessage 或 LLMMessage。
 * Message 作为别名保留，便于渐进迁移，后续版本将移除。
 */
export type Message = AgentMessage;
