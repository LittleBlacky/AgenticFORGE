export type Provider = "openai" | "anthropic" | "local";

export interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
}

export interface LLMOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
}

export type MessageRole = "user" | "assistant" | "system" | "tool";

export interface LLMMessage {
  role: MessageRole;
  content: string;
  /** 思考模型（DeepSeek R1、Claude 等）的 thinking token，仅在流式响应中填充 */
  reasoning_content?: string;
}

/**
 * streamThink 的流式模式：
 * - "content-only"  只 yield 正文 delta（默认，向后兼容）
 * - "thinking-only" 只 yield thinking delta
 * - "all"           先 yield thinking delta，再 yield 正文 delta
 */
export type StreamMode = "content-only" | "thinking-only" | "all";

/** streamThink 产出的 chunk，携带类型标记 */
export interface StreamChunk {
  type: "thinking" | "content";
  text: string;
}
