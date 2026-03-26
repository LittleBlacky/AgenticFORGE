/**
 * MCP 协议工具函数
 *
 * 提供上下文管理、消息解析等辅助功能。
 */

import type { MCPPromptMessage } from "./types";

/** MCP 上下文对象 */
export interface MCPContext {
  messages: Array<{ role: string; content: string }>;
  tools: Array<Record<string, unknown>>;
  resources: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
}

/** 成功响应 */
export interface MCPSuccessResponse<T = unknown> {
  success: true;
  data: T;
  metadata?: Record<string, unknown>;
}

/** 错误响应 */
export interface MCPErrorResponse {
  error: {
    message: string;
    code: string;
    details?: Record<string, unknown>;
  };
}

/**
 * 创建 MCP 上下文对象
 */
export function createContext(
  options: {
    messages?: Array<{ role: string; content: string }>;
    tools?: Array<Record<string, unknown>>;
    resources?: Array<Record<string, unknown>>;
    metadata?: Record<string, unknown>;
  } = {},
): MCPContext {
  return {
    messages: options.messages ?? [],
    tools: options.tools ?? [],
    resources: options.resources ?? [],
    metadata: options.metadata ?? {},
  };
}

/**
 * 解析 MCP 上下文（支持 JSON 字符串或已解析的对象）
 */
export function parseContext(context: string | Record<string, unknown>): MCPContext {
  let raw: Record<string, unknown>;

  if (typeof context === "string") {
    try {
      raw = JSON.parse(context) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Invalid JSON context: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    raw = context;
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("Context must be a dictionary or JSON string");
  }

  return {
    messages: (raw["messages"] as MCPContext["messages"]) ?? [],
    tools: (raw["tools"] as MCPContext["tools"]) ?? [],
    resources: (raw["resources"] as MCPContext["resources"]) ?? [],
    metadata: (raw["metadata"] as MCPContext["metadata"]) ?? {},
  };
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  errorMessage: string,
  errorCode?: string,
  details?: Record<string, unknown>,
): MCPErrorResponse {
  const response: MCPErrorResponse = {
    error: {
      message: errorMessage,
      code: errorCode ?? "UNKNOWN_ERROR",
    },
  };
  if (details) {
    response.error.details = details;
  }
  return response;
}

/**
 * 创建成功响应
 */
export function createSuccessResponse<T>(
  data: T,
  metadata?: Record<string, unknown>,
): MCPSuccessResponse<T> {
  const response: MCPSuccessResponse<T> = { success: true, data };
  if (metadata) response.metadata = metadata;
  return response;
}

/**
 * 将工具调用结果序列化为字符串
 */
export function serializeToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

/**
 * 将提示词消息列表序列化为对话字符串（便于调试）
 */
export function formatPromptMessages(messages: MCPPromptMessage[]): string {
  return messages.map((m) => `[${m.role}] ${m.content}`).join("\n");
}
