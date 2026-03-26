/**
 * MCP 客户端实现
 *
 * 支持两种模式：
 * 1. 内存模式 —— 直接持有 MCPServer 实例，零网络开销（适合测试）
 * 2. HTTP 模式 —— 通过 fetch 调用远端 MCPServer.serve() 暴露的 REST 接口
 *
 * 使用示例：
 * ```ts
 * // 内存模式
 * const server = new MCPServer("demo");
 * const client = new MCPClient(server);
 * await client.connect();
 * const tools = await client.listTools();
 *
 * // HTTP 模式
 * const client = new MCPClient("http://127.0.0.1:8000");
 * await client.connect();
 * const result = await client.callTool("calculator", { expression: "1+1" });
 * ```
 */

import type { MCPServer } from "./server";
import type { MCPToolInfo, MCPResourceInfo, MCPPromptInfo, MCPPromptMessage } from "./types";

export type MCPClientSource =
  | MCPServer // in-memory
  | string; // HTTP base URL, e.g. "http://127.0.0.1:8000"

export class MCPClient {
  private readonly source: MCPClientSource;
  private _connected = false;

  constructor(source: MCPClientSource) {
    this.source = source;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async connect(): Promise<this> {
    if (this._connected) return this;
    if (typeof this.source === "string") {
      const ok = await this.ping();
      if (!ok) {
        throw new Error(`MCPClient: cannot reach server at ${this.source}`);
      }
    }
    this._connected = true;
    return this;
  }

  disconnect(): void {
    this._connected = false;
  }

  get connected(): boolean {
    return this._connected;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Tools
  // ---------------------------------------------------------------------------

  async listTools(): Promise<MCPToolInfo[]> {
    this._ensureConnected();
    if (this._isInMemory()) {
      const server = this.source as MCPServer;
      return server.listTools().map((name) => {
        const info = server.getToolInfo(name)!;
        return {
          name: info.name,
          description: info.description,
          inputSchema: info.inputSchema,
        };
      });
    }
    const data = await this._get<{ tools: MCPToolInfo[] }>("/tools");
    return data.tools;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    this._ensureConnected();
    if (this._isInMemory()) {
      return (this.source as MCPServer).callTool(toolName, args);
    }
    const data = await this._post<{ data: string }>(`/tools/${encodeURIComponent(toolName)}`, {
      arguments: args,
    });
    return data.data;
  }

  // ---------------------------------------------------------------------------
  // Resources
  // ---------------------------------------------------------------------------

  async listResources(): Promise<MCPResourceInfo[]> {
    this._ensureConnected();
    if (this._isInMemory()) {
      const server = this.source as MCPServer;
      return server.listResources().map(({ uri, name, mimeType }) => ({
        uri,
        name,
        description: server.getResourceInfo(uri)?.description ?? "",
        mimeType,
      }));
    }
    const data = await this._get<{ resources: MCPResourceInfo[] }>("/resources");
    return data.resources;
  }

  async readResource(uri: string): Promise<string> {
    this._ensureConnected();
    if (this._isInMemory()) {
      return (this.source as MCPServer).readResource(uri);
    }
    const data = await this._get<{ data: string }>(`/resources/${encodeURIComponent(uri)}`);
    return data.data;
  }

  // ---------------------------------------------------------------------------
  // Prompts
  // ---------------------------------------------------------------------------

  async listPrompts(): Promise<MCPPromptInfo[]> {
    this._ensureConnected();
    if (this._isInMemory()) {
      const server = this.source as MCPServer;
      return server.listPrompts().map((name) => {
        const info = server.getPromptInfo(name)!;
        return {
          name: info.name,
          description: info.description,
          arguments: info.arguments,
        };
      });
    }
    const data = await this._get<{ prompts: MCPPromptInfo[] }>("/prompts");
    return data.prompts;
  }

  async getPrompt(
    promptName: string,
    args: Record<string, string> = {},
  ): Promise<MCPPromptMessage[]> {
    this._ensureConnected();
    if (this._isInMemory()) {
      return (this.source as MCPServer).getPrompt(promptName, args);
    }
    const data = await this._post<{ data: MCPPromptMessage[] }>(
      `/prompts/${encodeURIComponent(promptName)}`,
      { arguments: args },
    );
    return data.data;
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async ping(): Promise<boolean> {
    if (this._isInMemory()) return true;
    try {
      const res = await fetch(`${this.source as string}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getTransportInfo(): { mode: "memory" | "http"; source: string } {
    if (this._isInMemory()) {
      const server = this.source as MCPServer;
      return { mode: "memory", source: server.name };
    }
    return { mode: "http", source: this.source as string };
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private _isInMemory(): boolean {
    return typeof this.source !== "string";
  }

  private _ensureConnected(): void {
    if (!this._connected) {
      throw new Error(
        "MCPClient is not connected. Call connect() first or use the client inside a context.",
      );
    }
  }

  private async _get<T>(path: string): Promise<T> {
    const baseUrl = (this.source as string).replace(/\/$/, "");
    const res = await fetch(`${baseUrl}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MCPClient GET ${path} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = (this.source as string).replace(/\/$/, "");
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MCPClient POST ${path} failed (${res.status}): ${text}`);
    }
    return res.json() as Promise<T>;
  }
}
