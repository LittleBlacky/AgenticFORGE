/**
 * MCP 服务器实现
 *
 * 纯 TypeScript 实现，不依赖 fastmcp Python 库。
 * 提供工具、资源、提示词的注册与调用入口。
 *
 * 支持两种运行模式：
 * 1. 内存模式 —— 直接调用，适合单进程集成与测试
 * 2. HTTP 模式 —— 通过 Node.js http 模块暴露 REST 接口
 */

import { Protocol, ProtocolType } from "../base";
import type {
  MCPServerInfo,
  MCPToolHandler,
  MCPResourceHandler,
  MCPPromptHandler,
  MCPPromptMessage,
  RegisteredTool,
  RegisteredResource,
  RegisteredPrompt,
} from "./types";
import { createErrorResponse, createSuccessResponse, serializeToolResult } from "./utils";

export class MCPServer extends Protocol {
  readonly name: string;
  readonly description: string;

  private readonly _tools = new Map<string, RegisteredTool>();
  private readonly _resources = new Map<string, RegisteredResource>();
  private readonly _prompts = new Map<string, RegisteredPrompt>();

  constructor(name: string, description?: string) {
    super(ProtocolType.MCP);
    this.name = name;
    this.description = description ?? `${name} MCP Server`;
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  /**
   * 注册工具
   */
  addTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: MCPToolHandler,
  ): this {
    this._tools.set(name, { name, description, inputSchema, handler });
    return this;
  }

  /**
   * 注册资源
   */
  addResource(
    uri: string,
    name: string,
    description: string,
    handler: MCPResourceHandler,
    mimeType?: string,
  ): this {
    this._resources.set(uri, { uri, name, description, mimeType, handler });
    return this;
  }

  /**
   * 注册提示词模板
   */
  addPrompt(
    name: string,
    description: string,
    args: Array<{ name: string; description?: string; required?: boolean }>,
    handler: MCPPromptHandler,
  ): this {
    this._prompts.set(name, { name, description, arguments: args, handler });
    return this;
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  /** 调用工具 */
  async callTool(toolName: string, params: Record<string, unknown>): Promise<string> {
    const tool = this._tools.get(toolName);
    if (!tool) {
      return JSON.stringify(
        createErrorResponse(`Tool '${toolName}' not found`, "TOOL_NOT_FOUND", {
          available: this.listTools(),
        }),
      );
    }
    try {
      const result = await tool.handler(params);
      return serializeToolResult(result);
    } catch (err) {
      return JSON.stringify(
        createErrorResponse(
          err instanceof Error ? err.message : String(err),
          "TOOL_EXECUTION_ERROR",
          { tool: toolName },
        ),
      );
    }
  }

  /** 读取资源 */
  async readResource(uri: string): Promise<string> {
    const resource = this._resources.get(uri);
    if (!resource) {
      return JSON.stringify(
        createErrorResponse(`Resource '${uri}' not found`, "RESOURCE_NOT_FOUND", {
          available: this.listResources().map((r) => r.uri),
        }),
      );
    }
    try {
      return await resource.handler();
    } catch (err) {
      return JSON.stringify(
        createErrorResponse(
          err instanceof Error ? err.message : String(err),
          "RESOURCE_READ_ERROR",
          { uri },
        ),
      );
    }
  }

  /** 获取提示词 */
  async getPrompt(
    promptName: string,
    args: Record<string, string> = {},
  ): Promise<MCPPromptMessage[]> {
    const prompt = this._prompts.get(promptName);
    if (!prompt) {
      throw new Error(`Prompt '${promptName}' not found`);
    }
    return await prompt.handler(args);
  }

  // ---------------------------------------------------------------------------
  // Discovery
  // ---------------------------------------------------------------------------

  listTools(): string[] {
    return Array.from(this._tools.keys());
  }

  listResources(): Array<{ uri: string; name: string; mimeType?: string }> {
    return Array.from(this._resources.values()).map(({ uri, name, mimeType }) => ({
      uri,
      name,
      mimeType,
    }));
  }

  listPrompts(): string[] {
    return Array.from(this._prompts.keys());
  }

  getToolInfo(name: string): RegisteredTool | undefined {
    return this._tools.get(name);
  }

  getResourceInfo(uri: string): RegisteredResource | undefined {
    return this._resources.get(uri);
  }

  getPromptInfo(name: string): RegisteredPrompt | undefined {
    return this._prompts.get(name);
  }

  /** 获取所有工具的 OpenAI-style function schema */
  getToolSchemas(): Array<{
    type: "function";
    function: { name: string; description: string; parameters: Record<string, unknown> };
  }> {
    return Array.from(this._tools.values()).map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));
  }

  // ---------------------------------------------------------------------------
  // Info
  // ---------------------------------------------------------------------------

  getInfo(): MCPServerInfo & { tools: number; resources: number; prompts: number } {
    return {
      name: this.name,
      description: this.description,
      protocol: "MCP",
      tools: this._tools.size,
      resources: this._resources.size,
      prompts: this._prompts.size,
    };
  }

  /**
   * 启动内置 HTTP 服务（仅依赖 Node.js built-in http 模块）
   *
   * 端点列表：
   * - GET  /health              健康检查
   * - GET  /info                服务器信息
   * - GET  /tools               工具列表
   * - POST /tools/:name         调用工具（body: { arguments: {...} }）
   * - GET  /resources           资源列表
   * - GET  /resources/*         读取资源（uri 作为路径后缀）
   * - GET  /prompts             提示词列表
   * - POST /prompts/:name       获取提示词（body: { arguments: {...} }）
   */
  async serve(port = 8000, host = "127.0.0.1"): Promise<void> {
    const { createServer } = await import("node:http");

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${host}:${port}`);
      const pathname = url.pathname;

      const jsonReply = (data: unknown, status = 200) => {
        const body = JSON.stringify(data);
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(body);
      };

      const readBody = (): Promise<Record<string, unknown>> =>
        new Promise((resolve) => {
          let data = "";
          req.on("data", (chunk: Buffer) => {
            data += chunk.toString();
          });
          req.on("end", () => {
            try {
              resolve(JSON.parse(data) as Record<string, unknown>);
            } catch {
              resolve({});
            }
          });
        });

      try {
        // GET /health
        if (pathname === "/health" && req.method === "GET") {
          jsonReply({ status: "healthy", server: this.name });
          return;
        }

        // GET /info
        if (pathname === "/info" && req.method === "GET") {
          jsonReply(this.getInfo());
          return;
        }

        // GET /tools
        if (pathname === "/tools" && req.method === "GET") {
          jsonReply({
            tools: Array.from(this._tools.values()).map(({ name, description, inputSchema }) => ({
              name,
              description,
              inputSchema,
            })),
          });
          return;
        }

        // POST /tools/:name
        const toolMatch = pathname.match(/^\/tools\/(.+)$/);
        if (toolMatch && req.method === "POST") {
          const toolName = decodeURIComponent(toolMatch[1]!);
          const body = await readBody();
          const toolArgs = (body["arguments"] as Record<string, unknown> | undefined) ?? body;
          const result = await this.callTool(toolName, toolArgs);
          jsonReply(createSuccessResponse(result));
          return;
        }

        // GET /resources
        if (pathname === "/resources" && req.method === "GET") {
          jsonReply({ resources: this.listResources() });
          return;
        }

        // GET /resources/* — read resource by uri
        const resourceMatch = pathname.match(/^\/resources\/(.+)$/);
        if (resourceMatch && req.method === "GET") {
          const uri = decodeURIComponent(resourceMatch[1]!);
          const content = await this.readResource(uri);
          jsonReply(createSuccessResponse(content));
          return;
        }

        // GET /prompts
        if (pathname === "/prompts" && req.method === "GET") {
          jsonReply({
            prompts: Array.from(this._prompts.values()).map(
              ({ name, description, arguments: a }) => ({ name, description, arguments: a }),
            ),
          });
          return;
        }

        // POST /prompts/:name
        const promptMatch = pathname.match(/^\/prompts\/(.+)$/);
        if (promptMatch && req.method === "POST") {
          const promptName = decodeURIComponent(promptMatch[1]!);
          const body = await readBody();
          const promptArgs = (body["arguments"] as Record<string, string> | undefined) ?? {};
          const messages = await this.getPrompt(promptName, promptArgs);
          jsonReply(createSuccessResponse(messages));
          return;
        }

        // 404
        jsonReply(createErrorResponse(`Not found: ${pathname}`, "NOT_FOUND"), 404);
      } catch (err) {
        jsonReply(
          createErrorResponse(err instanceof Error ? err.message : String(err), "INTERNAL_ERROR"),
          500,
        );
      }
    });

    await new Promise<void>((resolve, reject) => {
      server.on("error", reject);
      server.listen(port, host, () => {
        console.log(`[MCPServer] ${this.name} listening on http://${host}:${port}`);
        resolve();
      });
    });
  }
}

// ---------------------------------------------------------------------------
// MCPServerBuilder — fluent builder API
// ---------------------------------------------------------------------------

export class MCPServerBuilder {
  private readonly server: MCPServer;

  constructor(name: string, description?: string) {
    this.server = new MCPServer(name, description);
  }

  withTool(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: MCPToolHandler,
  ): this {
    this.server.addTool(name, description, inputSchema, handler);
    return this;
  }

  withResource(
    uri: string,
    name: string,
    description: string,
    handler: MCPResourceHandler,
    mimeType?: string,
  ): this {
    this.server.addResource(uri, name, description, handler, mimeType);
    return this;
  }

  withPrompt(
    name: string,
    description: string,
    args: Array<{ name: string; description?: string; required?: boolean }>,
    handler: MCPPromptHandler,
  ): this {
    this.server.addPrompt(name, description, args, handler);
    return this;
  }

  build(): MCPServer {
    return this.server;
  }

  async serve(port?: number, host?: string): Promise<void> {
    return this.server.serve(port, host);
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * 创建内置示例 MCP 服务器（含 calculator + greet 工具）
 */
export function createExampleMCPServer(): MCPServer {
  return new MCPServerBuilder("example-server", "Example MCP server with calculator and greet")
    .withTool(
      "calculator",
      "Calculate a simple arithmetic expression",
      {
        type: "object",
        properties: {
          expression: { type: "string", description: "Arithmetic expression, e.g. '2 + 3 * 4'" },
        },
        required: ["expression"],
      },
      ({ expression }) => {
        const expr = String(expression ?? "");
        const safe = /^[\d+\-*/().\s]+$/.test(expr);
        if (!safe) return "Error: invalid characters in expression";
        try {
          const result = Function(`"use strict"; return (${expr})`)() as number;
          return `Result: ${result}`;
        } catch (err) {
          return `Error: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    )
    .withTool(
      "greet",
      "Generate a friendly greeting",
      {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the person to greet" },
        },
        required: ["name"],
      },
      ({ name }) => `Hello, ${String(name)}! Welcome to the MCP server.`,
    )
    .build();
}
