/** MCP 协议核心类型定义 */

/** MCP 工具描述 */
export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** MCP 资源描述 */
export interface MCPResourceInfo {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

/** MCP 提示词模板描述 */
export interface MCPPromptInfo {
  name: string;
  description: string;
  arguments: Array<{name: string; description?: string; required?: boolean}>;
}

/** MCP 提示词消息 */
export interface MCPPromptMessage {
  role: string;
  content: string;
}

/** MCP 传输类型 */
export type MCPTransportType = "stdio" | "http" | "sse" | "memory";

/** Stdio 传输配置 */
export interface StdioTransportConfig {
  transport: "stdio";
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/** HTTP 传输配置 */
export interface HttpTransportConfig {
  transport: "http";
  url: string;
  headers?: Record<string, string>;
}

/** SSE 传输配置 */
export interface SseTransportConfig {
  transport: "sse";
  url: string;
  headers?: Record<string, string>;
}

/** 所有传输配置的联合类型 */
export type MCPTransportConfig =
  | StdioTransportConfig
  | HttpTransportConfig
  | SseTransportConfig;

/** MCP 服务器信息 */
export interface MCPServerInfo {
  name: string;
  description: string;
  protocol: "MCP";
}

/** MCP 工具处理函数 */
export type MCPToolHandler = (
  params: Record<string, unknown>,
) => string | Promise<string>;

/** MCP 资源处理函数 */
export type MCPResourceHandler = () => string | Promise<string>;

/** MCP 提示词处理函数 */
export type MCPPromptHandler = (
  args: Record<string, string>,
) => MCPPromptMessage[] | Promise<MCPPromptMessage[]>;

/** 注册的工具条目 */
export interface RegisteredTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: MCPToolHandler;
}

/** 注册的资源条目 */
export interface RegisteredResource {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
  handler: MCPResourceHandler;
}

/** 注册的提示词条目 */
export interface RegisteredPrompt {
  name: string;
  description: string;
  arguments: Array<{name: string; description?: string; required?: boolean}>;
  handler: MCPPromptHandler;
}
